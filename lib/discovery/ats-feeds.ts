// Career sites on applicant tracking systems → "Heiße Firmen", free and DACH-wide.
// 1) discoverAtsAccounts: the Common Crawl index (public web archive) lists every known
//    career site like acme.jobs.personio.de → ats_accounts (a few index pages per run).
// 2) pollAtsAccounts: checks the public job feed of due accounts in rotation; busy employers
//    are re-checked every 3 days, quiet ones every 2 weeks, non-DACH ones rarely.
// Server-only, service role client.
import { AtsFeed, atsCompanyName, dachCountry, feedOf, fetchAtsJobs } from './ats'
import { employerKey, excluded, loadEmployers, save, storeScores, toRows } from './hiring'

const CC_INDEX = process.env.CC_INDEX_URL || 'https://index.commoncrawl.org'

export const PATTERNS = [
  '*.jobs.personio.de', '*.jobs.personio.com', '*.recruitee.com',
  'boards.greenhouse.io/*', 'job-boards.greenhouse.io/*', 'job-boards.eu.greenhouse.io/*',
  'jobs.lever.co/*', 'jobs.eu.lever.co/*', 'apply.workable.com/*', 'jobs.smartrecruiters.com/*',
]

const POLL_CONCURRENCY = 10
const POLL_BATCH = 400
const DAY = 86400000
const RECHECK = { hot: 3, active: 14, empty: 30, foreign: 90, gone: 180 }
const HOT_MIN = 4

const later = (days: number) => new Date(Date.now() + days * DAY).toISOString()
const prettify = (slug: string) => slug.split(/[-_]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RevenueOS-JobSignals/1.0' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`)
  return res
}

// ---------- 1) find career sites in the crawl index ----------

export async function discoverAtsAccounts(svc: any, projectId: string, budgetMs = 15_000) {
  const started = Date.now()
  const out = { found: 0, pattern: null as string | null, page: 0, pages: 0, error: null as string | null }
  try {
    const collection: string = (await (await getJson(`${CC_INDEX}/collinfo.json`)).json())[0].id
    const { data: states } = await svc.from('ats_discovery_state').select('*').eq('project_id', projectId)
    const byPattern = new Map<string, any>((states || []).map((s: any) => [s.pattern, s]))
    // Next pattern: never started → unfinished → (new crawl collection) start over
    const pick = PATTERNS.map(pattern => byPattern.get(pattern) ?? { project_id: projectId, pattern, collection: null, page: 0, num_pages: null, finished_at: null, updated_at: '1970-01-01' })
      .filter(s => s.collection !== collection || !s.finished_at)
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))[0]
    if (!pick) return out
    let state = pick.collection === collection ? pick : { ...pick, collection, page: 0, num_pages: null, finished_at: null }
    out.pattern = state.pattern

    const base = `${CC_INDEX}/${collection}-index?url=${encodeURIComponent(state.pattern)}&output=json`
    if (state.num_pages == null) state.num_pages = (await (await getJson(`${base}&showNumPages=true`)).json()).pages ?? 0

    while (state.page < state.num_pages && Date.now() - started < budgetMs) {
      const text = await (await getJson(`${base}&fl=url&page=${state.page}`)).text()
      const feeds = new Map<string, AtsFeed>()
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try { const f = feedOf(JSON.parse(line).url); if (f) feeds.set(`${f.ats}:${f.slug}`, f) } catch { /* skip bad line */ }
      }
      const rows = Array.from(feeds.values()).map(f => ({ project_id: projectId, ats: f.ats, slug: f.slug }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await svc.from('ats_accounts').upsert(rows.slice(i, i + 500), { onConflict: 'project_id,ats,slug', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      }
      out.found += rows.length
      state.page++
    }
    if (state.page >= state.num_pages) state.finished_at = new Date().toISOString()
    out.page = state.page; out.pages = state.num_pages
    await svc.from('ats_discovery_state').upsert({
      project_id: projectId, pattern: state.pattern, collection: state.collection, page: state.page,
      num_pages: state.num_pages, finished_at: state.finished_at, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,pattern' })
  } catch (e: any) {
    out.error = e?.message || String(e)
  }
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
