// Career sites on applicant tracking systems → "Heiße Firmen", free and DACH-wide.
// 1) discoverAtsAccounts: the public web archives (Internet Archive / Common Crawl) list every
//    known career site like acme.jobs.personio.de → ats_accounts (a few index pages per run).
// 2) pollAtsAccounts: checks the public job feed of due accounts in rotation; busy employers
//    are re-checked every 3 days, quiet ones every 2 weeks, non-DACH ones rarely.
// Server-only, service role client.
import { AtsFeed, atsCompanyName, dachCountry, feedOf, fetchAtsJobs } from './ats'
import { employerKey, excluded, loadEmployers, save, storeScores, toRows } from './hiring'

const CC_INDEX = process.env.CC_INDEX_URL || 'https://index.commoncrawl.org'

// Career-site addresses per system. Wayback (Internet Archive CDX) is asked for the start pages
// only (one hit per company); Common Crawl is the fallback when the Wayback index fails.
export const PATTERNS: { key: string; url: string; match: 'domain' | 'prefix'; root: string }[] = [
  { key: '*.jobs.personio.de', url: 'jobs.personio.de', match: 'domain', root: '^https?://[^/]+\\.jobs\\.personio\\.de(/(de|en)?/?)?(\\?.*)?$' },
  { key: '*.jobs.personio.com', url: 'jobs.personio.com', match: 'domain', root: '^https?://[^/]+\\.jobs\\.personio\\.com(/(de|en)?/?)?(\\?.*)?$' },
  { key: '*.recruitee.com', url: 'recruitee.com', match: 'domain', root: '^https?://[^/]+\\.recruitee\\.com/?(\\?.*)?$' },
  { key: 'boards.greenhouse.io/*', url: 'boards.greenhouse.io/', match: 'prefix', root: '^https?://boards\\.greenhouse\\.io/[^/?]+/?(\\?.*)?$' },
  { key: 'job-boards.greenhouse.io/*', url: 'job-boards.greenhouse.io/', match: 'prefix', root: '^https?://job-boards\\.greenhouse\\.io/[^/?]+/?(\\?.*)?$' },
  { key: 'job-boards.eu.greenhouse.io/*', url: 'job-boards.eu.greenhouse.io/', match: 'prefix', root: '^https?://job-boards\\.eu\\.greenhouse\\.io/[^/?]+/?(\\?.*)?$' },
  { key: 'jobs.lever.co/*', url: 'jobs.lever.co/', match: 'prefix', root: '^https?://jobs\\.lever\\.co/[^/?]+/?(\\?.*)?$' },
  { key: 'jobs.eu.lever.co/*', url: 'jobs.eu.lever.co/', match: 'prefix', root: '^https?://jobs\\.eu\\.lever\\.co/[^/?]+/?(\\?.*)?$' },
  { key: 'apply.workable.com/*', url: 'apply.workable.com/', match: 'prefix', root: '^https?://apply\\.workable\\.com/[^/?]+/?(\\?.*)?$' },
  { key: 'jobs.smartrecruiters.com/*', url: 'jobs.smartrecruiters.com/', match: 'prefix', root: '^https?://jobs\\.smartrecruiters\\.com/[^/?]+/?(\\?.*)?$' },
]
const WAYBACK = process.env.WAYBACK_CDX_URL || 'https://web.archive.org/cdx/search/cdx'
const REDISCOVER_DAYS = 30

const POLL_CONCURRENCY = 10
const POLL_BATCH = 400
const DAY = 86400000
const RECHECK = { hot: 3, active: 14, empty: 30, foreign: 90, gone: 180 }
const HOT_MIN = 4

const later = (days: number) => new Date(Date.now() + days * DAY).toISOString()
const prettify = (slug: string) => slug.split(/[-_]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

async function getJson(url: string, timeoutMs = 20_000) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RevenueOS-JobSignals/1.0' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`)
  return res
}

async function storeFeeds(svc: any, projectId: string, urls: string[]) {
  const feeds = new Map<string, AtsFeed>()
  for (const u of urls) { const f = feedOf(u); if (f) feeds.set(`${f.ats}:${f.slug}`, f) }
  const rows = Array.from(feeds.values()).map(f => ({ project_id: projectId, ats: f.ats, slug: f.slug }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await svc.from('ats_accounts').upsert(rows.slice(i, i + 500), { onConflict: 'project_id,ats,slug', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  return rows.length
}

// ---------- 1) find career sites in the web archives ----------

// One page of the Wayback index (start pages only); returns the key for the next page, null at the end
async function waybackPage(p: typeof PATTERNS[number], resumeKey: string | null, timeoutMs: number) {
  const q = new URLSearchParams({ url: p.url, matchType: p.match, fl: 'original', collapse: 'urlkey', output: 'json', limit: '5000', showResumeKey: 'true', filter: `original:${p.root}` })
  if (resumeKey) q.set('resumeKey', resumeKey)
  const rows: string[][] = await (await getJson(`${WAYBACK}?${q}`, timeoutMs)).json()
  const gap = rows.findIndex(r => !r.length)
  const urls = rows.slice(1, gap === -1 ? undefined : gap).map(r => r[0])
  return { urls, next: gap !== -1 ? rows[gap + 1]?.[0] ?? null : null }
}

// Fallback: Common Crawl, one index page
async function commonCrawlPage(p: typeof PATTERNS[number], page: number, timeoutMs: number) {
  const collection: string = (await (await getJson(`${CC_INDEX}/collinfo.json`, timeoutMs)).json())[0].id
  const base = `${CC_INDEX}/${collection}-index?url=${encodeURIComponent(p.key)}&output=json`
  const pages = (await (await getJson(`${base}&showNumPages=true`, timeoutMs)).json()).pages ?? 0
  if (page >= pages) return { urls: [] as string[], pages }
  const text = await (await getJson(`${base}&fl=url&page=${page}`, timeoutMs)).text()
  const urls = text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).url as string } catch { return '' } })
  return { urls, pages }
}

export async function discoverAtsAccounts(svc: any, projectId: string, budgetMs = 15_000) {
  const started = Date.now()
  const left = () => budgetMs - (Date.now() - started)
  const out = { found: 0, pattern: null as string | null, page: 0, source: null as string | null, done: false, error: null as string | null }
  const { data: states } = await svc.from('ats_discovery_state').select('*').eq('project_id', projectId)
  const byKey = new Map<string, any>((states || []).map((s: any) => [s.pattern, s]))
  // Next pattern: never started → unfinished → finished more than a month ago (start over)
  const stale = new Date(Date.now() - REDISCOVER_DAYS * DAY).toISOString()
  const pick = PATTERNS.map(p => ({ p, s: byKey.get(p.key) ?? { pattern: p.key, collection: null, page: 0, finished_at: null, updated_at: '1970-01-01' } }))
    .filter(({ s }) => !s.finished_at || s.finished_at < stale)
    .sort((a, b) => String(a.s.updated_at).localeCompare(String(b.s.updated_at)))[0]
  if (!pick) return out
  const { p } = pick
  let state = pick.s.finished_at ? { ...pick.s, collection: null, page: 0, finished_at: null } : { ...pick.s }
  out.pattern = p.key

  try {
    // state.collection holds the Wayback resume key ("wb:<key>"), state.page the pages done
    let resume: string | null = String(state.collection || '').startsWith('wb:') ? state.collection.slice(3) : null
    do {
      const r = await waybackPage(p, resume, Math.max(5_000, Math.min(25_000, left())))
      out.found += await storeFeeds(svc, projectId, r.urls)
      state.page++
      resume = r.next
      out.source = 'wayback'
    } while (resume && left() > 8_000)
    state.collection = resume ? `wb:${resume}` : null
    if (!resume) state.finished_at = new Date().toISOString()
  } catch (e: any) {
    out.error = `Wayback: ${e?.message || e}`
    if (left() > 6_000) {
      try {
        const r = await commonCrawlPage(p, 0, Math.min(20_000, left()))
        out.found += await storeFeeds(svc, projectId, r.urls)
        out.source = 'commoncrawl'
        out.error += ' (Common Crawl als Ersatz genutzt)'
      } catch (e2: any) {
        out.error += ` · Common Crawl: ${e2?.message || e2}`
      }
    }
  }
  out.page = state.page
  out.done = !!state.finished_at
  await svc.from('ats_discovery_state').upsert({
    project_id: projectId, pattern: p.key, collection: state.collection ?? null, page: state.page,
    num_pages: null, finished_at: state.finished_at ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,pattern' })
  return out
}

// ---------- 2) check due feeds ----------

async function checkAccount(svc: any, projectId: string, acc: any) {
  const feed: AtsFeed = { ats: acc.ats, slug: acc.slug }
  try {
    const name: string = acc.employer_name || (await atsCompanyName(feed)) || prettify(acc.slug)
    if (excluded(name)) {
      await svc.from('ats_accounts').update({ employer_name: name, status: 'excluded', last_checked_at: new Date().toISOString(), next_check_at: later(RECHECK.gone) }).eq('id', acc.id)
      return null
    }
    const jobs = await fetchAtsJobs(feed, name, 'DE')
    const counts = new Map<string, number>()
    for (const j of jobs) {
      const c = dachCountry(j.location)
      if (c) counts.set(c, (counts.get(c) || 0) + 1)
    }
    const dach = Array.from(counts.values()).reduce((a, b) => a + b, 0)
    const country = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    // Only foreign locations → not DACH; no location info at all → keep (country unknown)
    const located = jobs.filter(j => j.location).length
    const status = !jobs.length ? 'empty' : !dach && located ? 'not_dach' : 'active'
    const rows = status === 'active'
      ? toRows(projectId, jobs.map(j => ({ ...j, country: (dachCountry(j.location) ?? country ?? '') as string })))
      : []
    if (rows.length) await save(svc, rows)
    await svc.from('ats_accounts').update({
      employer_name: name, employer_key: employerKey(name), status, open_count: jobs.length, country, error: null,
      last_checked_at: new Date().toISOString(),
      next_check_at: later(status === 'empty' ? RECHECK.empty : status === 'not_dach' ? RECHECK.foreign : rows.length >= HOT_MIN ? RECHECK.hot : RECHECK.active),
    }).eq('id', acc.id)
    return rows.length ? employerKey(name) : null
  } catch (e: any) {
    const gone = /^(404|410)/.test(String(e?.message))
    await svc.from('ats_accounts').update({
      status: gone ? 'gone' : acc.status, error: String(e?.message || e).slice(0, 200),
      last_checked_at: new Date().toISOString(), next_check_at: later(gone ? RECHECK.gone : RECHECK.hot),
    }).eq('id', acc.id)
    return null
  }
}

export async function pollAtsAccounts(svc: any, projectId: string, budgetMs = 35_000) {
  const started = Date.now()
  const stats = { checked: 0, active: 0, employers: 0, candidates: 0, signals: 0 }
  const { data: due } = await svc.from('ats_accounts').select('*')
    .eq('project_id', projectId).lte('next_check_at', new Date().toISOString())
    .order('next_check_at', { ascending: true }).limit(POLL_BATCH)
  const queue = [...(due || [])]
  const keys = new Set<string>()
  // A few feeds in parallel, until the time budget is used (leaves room for scoring)
  await Promise.all(Array.from({ length: POLL_CONCURRENCY }, async () => {
    while (queue.length && Date.now() - started < budgetMs - 8_000) {
      const key = await checkAccount(svc, projectId, queue.shift())
      stats.checked++
      if (key) { keys.add(key); stats.active++ }
    }
  }))
  if (keys.size) await storeScores(svc, projectId, await loadEmployers(svc, projectId, Array.from(keys)), stats)
  return stats
}
