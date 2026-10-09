// Public job feeds of applicant tracking systems. A job link like
// "acme.jobs.personio.de/job/123" reveals the system and the company's account,
// and the feed then lists every open role of that company — the exact count.
import type { Posting } from './hiring'

export type AtsFeed = { ats: string; slug: string }

const PATTERNS: [RegExp, string][] = [
  [/^https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i, 'personio'],
  [/^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i, 'greenhouse'],
  [/^https?:\/\/jobs(?:\.eu)?\.lever\.co\/([a-z0-9_-]+)/i, 'lever'],
  [/^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/i, 'smartrecruiters'],
  [/^https?:\/\/([a-z0-9-]+)\.recruitee\.com/i, 'recruitee'],
  [/^https?:\/\/apply\.workable\.com\/([a-z0-9_-]+)/i, 'workable'],
  // Career sites read from their HTML (job links / structured data)
  [/^https?:\/\/([a-z0-9-]+)\.softgarden\.io/i, 'softgarden'],
  [/^https?:\/\/join\.com\/companies\/([a-z0-9_-]+)/i, 'join'],
  [/^https?:\/\/([a-z0-9-]+)\.onlyfy\.jobs/i, 'onlyfy'],
  [/^https?:\/\/([a-z0-9-]+)\.dvinci-hr\.com/i, 'dvinci'],
  [/^https?:\/\/([a-z0-9-]+)\.rexx-systems\.com/i, 'rexx'],
  [/^https?:\/\/([a-z0-9-]+)\.concludis\.de/i, 'concludis'],
]
const CAREER_PAGE: Record<string, (slug: string) => string> = {
  softgarden: s => `https://${s}.softgarden.io/de/vacancies`,
  join: s => `https://join.com/companies/${s}`,
  onlyfy: s => `https://${s}.onlyfy.jobs/`,
  dvinci: s => `https://${s}.dvinci-hr.com/de/jobs`,
  rexx: s => `https://${s}.rexx-systems.com/`,
  concludis: s => `https://${s}.concludis.de/`,
}
export const careerPageOf = (feed: AtsFeed) => CAREER_PAGE[feed.ats]?.(feed.slug) ?? null

export function feedOf(url: string | null | undefined): AtsFeed | null {
  for (const [re, ats] of PATTERNS) {
    const m = String(url || '').match(re)
    if (m && !['www', 'jobs', 'api', 'app', 'embed', 'v1', 'robots', 'sitemap'].includes(m[1].toLowerCase())) return { ats, slug: m[1].toLowerCase() }
  }
  return null
}

async function get(url: string, accept = 'application/json') {
  const res = await fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${res.status}`)
  return accept.includes('json') ? res.json() : res.text()
}

const tag = (xml: string, name: string) => (xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`)) || [])[1]?.trim() ?? null

// Every open role of one company, straight from its applicant tracking system
export async function fetchAtsJobs(feed: AtsFeed, employer: string, country: string): Promise<Posting[]> {
  const base = { source: feed.ats, employer, country }
  const { ats, slug } = feed
  if (ats === 'personio') {
    const xml: string = await get(`https://${slug}.jobs.personio.de/xml?language=de`, 'application/xml')
      .catch(() => get(`https://${slug}.jobs.personio.com/xml?language=de`, 'application/xml'))
    return Array.from(xml.matchAll(/<position>([\s\S]*?)<\/position>/g)).map(([, p]) => ({
      ...base, externalId: `${slug}:${tag(p, 'id')}`, title: tag(p, 'name') || '', location: tag(p, 'office'),
      url: `https://${slug}.jobs.personio.de/job/${tag(p, 'id')}`, publishedAt: tag(p, 'createdAt'),
    })).filter(j => j.title)
  }
  if (ats === 'greenhouse') {
    const d = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
    return (d.jobs || []).map((j: any) => ({ ...base, externalId: `${slug}:${j.id}`, title: j.title, location: j.location?.name ?? null, url: j.absolute_url ?? null, publishedAt: j.updated_at ?? null }))
  }
  if (ats === 'lever') {
    const d = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`)
    return (d || []).map((j: any) => ({ ...base, externalId: `${slug}:${j.id}`, title: j.text, location: j.categories?.location ?? null, url: j.hostedUrl ?? null, publishedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null }))
  }
  if (ats === 'smartrecruiters') {
    const d = await get(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`)
    return (d.content || []).map((j: any) => ({ ...base, externalId: `${slug}:${j.id}`, title: j.name, location: j.location?.city ?? null, url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`, publishedAt: j.releasedDate ?? null }))
  }
  if (ats === 'recruitee') {
    const d = await get(`https://${slug}.recruitee.com/api/offers/`)
    return (d.offers || []).map((j: any) => ({ ...base, externalId: `${slug}:${j.id}`, title: j.title, location: j.city || j.location || null, url: j.careers_url ?? null, publishedAt: j.published_at ?? j.created_at ?? null }))
  }
  if (ats === 'dvinci') {
    // d.vinci publishes a JSON list next to the career page
    const d = await get(`https://${slug}.dvinci-hr.com/jobPublication/list.json`).catch(() => null)
    const list = Array.isArray(d) ? d : d?.jobPublications ?? d?.content ?? null
    if (Array.isArray(list)) return list.map((j: any) => ({
      ...base, externalId: `${slug}:${j.id ?? j.jobOpeningId ?? j.position}`, title: j.position ?? j.title ?? j.name ?? '',
      location: j.location?.city ?? j.locations?.[0]?.city ?? j.workplace ?? null, url: j.jobPublicationURL ?? j.url ?? null, publishedAt: j.startDate ?? j.createdDate ?? null,
    })).filter((j: any) => j.title)
  }
  if (CAREER_PAGE[ats]) return careerPageJobs(feed, base)
  if (ats === 'workable') {
    const d = await get(`https://apply.workable.com/api/v1/widget/accounts/${slug}`)
    return (d.jobs || []).map((j: any) => ({ ...base, externalId: `${slug}:${j.shortcode}`, title: j.title, location: j.city ?? null, url: j.url ?? j.application_url ?? null, publishedAt: j.published_on ?? j.created_at ?? null }))
  }
  return []
}

// Company name as shown on the career site (the feeds of most systems don't carry it)
export async function atsCompanyName(feed: AtsFeed): Promise<string | null> {
  const { ats, slug } = feed
  try {
    if (ats === 'greenhouse') return (await get(`https://boards-api.greenhouse.io/v1/boards/${slug}`)).name ?? null
    if (ats === 'workable') return (await get(`https://apply.workable.com/api/v1/widget/accounts/${slug}`)).name ?? null
    if (ats === 'smartrecruiters') return (await get(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`)).content?.[0]?.company?.name ?? null
    if (ats === 'recruitee') return (await get(`https://${slug}.recruitee.com/api/offers/`)).offers?.[0]?.company_name ?? null
    const page = ats === 'personio' ? `https://${slug}.jobs.personio.de/` : careerPageOf(feed)
    if (page) {
      const html: string = await get(page, 'text/html')
      const raw = (html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i) || [])[1]
      return raw ? decodeHtml(raw).replace(/^(jobs|karriere|career|careers|stellenangebote|offene stellen|jobs@|karriere@)\s*(bei|at|@|[-–|:])?\s*/i, '')
        .replace(/\s*[-–|:]\s*(jobs|karriere|career|careers|stellenangebote|personio|softgarden|join|onlyfy|d\.vinci|rexx|concludis).*$/i, '').trim() || null : null
    }
  } catch { /* name stays unknown */ }
  return null
}

// DE / AT / CH from a job location ("München", "Wien, Österreich", "Zürich", "Remote - Germany")
const CH = /(?:^|[^a-zäöüß])(?:schweiz|switzerland|suisse|svizzera|\bch\b|zürich|zurich|basel|bern\b|luzern|lucerne|genf|geneva|genève|lausanne|winterthur|st\.? ?gallen|zug\b|lugano|aarau|baden \(ch\)|schaffhausen|chur|thun|biel)/i
const AT = /(?:^|[^a-zäöüß])(?:österreich|austria|\bat\b|wien|vienna|graz|linz|salzburg|innsbruck|klagenfurt|villach|wels|st\.? ?pölten|dornbirn|bregenz|leoben|wiener neustadt)/i
const DE = /(?:^|[^a-zäöüß])(?:deutschland|germany|\bde\b|berlin|hamburg|münchen|munich|köln|cologne|frankfurt|stuttgart|düsseldorf|dortmund|essen|leipzig|bremen|dresden|hannover|nürnberg|nuremberg|duisburg|bochum|wuppertal|bielefeld|bonn|münster|karlsruhe|mannheim|augsburg|wiesbaden|mönchengladbach|gelsenkirchen|aachen|braunschweig|kiel|chemnitz|halle|magdeburg|freiburg|krefeld|mainz|lübeck|erfurt|oberhausen|rostock|kassel|hagen|potsdam|saarbrücken|hamm|ludwigshafen|oldenburg|osnabrück|leverkusen|heidelberg|darmstadt|solingen|regensburg|paderborn|ingolstadt|würzburg|ulm|wolfsburg|heilbronn|göttingen|pforzheim|offenbach|reutlingen|koblenz|bremerhaven|jena|trier|erlangen|siegen|hildesheim|cottbus|ratingen|gütersloh|konstanz|neuss|fürth|bamberg|rosenheim|passau|landshut|kempten|flensburg|schwerin|lüneburg|wolfsburg|walldorf|eschborn|unterföhring|garching|sindelfingen|ludwigsburg|esslingen|böblingen)/i
export function dachCountry(location: string | null | undefined): 'DE' | 'AT' | 'CH' | null {
  const l = String(location || '')
  if (!l) return null
  return CH.test(l) ? 'CH' : AT.test(l) ? 'AT' : DE.test(l) ? 'DE' : null
}

// ---------- generic career page reader ----------

const decodeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
const strip = (s: string) => decodeHtml(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const NAV = /^(alle (jobs|stellen)|jobs?|stellen(angebote)?|karriere|career|home|start|impressum|datenschutz|kontakt|initiativbewerbung|jetzt bewerben|bewerben|mehr|weiter|zurück|apply|apply now|login|anmelden|deutsch|english|de|en)$/i

// Structured data (schema.org JobPosting) first, else the links that look like single job ads
export async function careerPageJobs(feed: AtsFeed, base: { source: string; employer: string; country: string }): Promise<Posting[]> {
  const url = careerPageOf(feed)!
  const html: string = await get(url, 'text/html')
  const out = new Map<string, Posting>()
  for (const m of Array.from(html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi))) {
    try {
      const data = JSON.parse(m[1])
      const items = ([] as any[]).concat(data, data?.itemListElement?.map((x: any) => x.item ?? x) ?? [], data?.['@graph'] ?? [])
      for (const it of items) if (it?.['@type'] === 'JobPosting' && it.title) {
        const loc = [].concat(it.jobLocation ?? []).map((l: any) => l?.address?.addressLocality).filter(Boolean)[0] ?? null
        out.set(it.url || it.identifier?.value || it.title + loc, { ...base, externalId: `${feed.slug}:${it.identifier?.value ?? it.url ?? it.title + '|' + loc}`, title: strip(it.title), location: loc, url: it.url ?? url, publishedAt: it.datePosted ?? null })
      }
    } catch { /* invalid JSON-LD */ }
  }
  if (!out.size) {
    for (const m of Array.from(html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi))) {
      let href: string
      try { href = new URL(decodeHtml(m[1]), url).toString() } catch { continue }
      if (!/\/(job|jobs|stelle|stellen|vacanc\w*|position|offer|stellenangebot\w*)[\/_-]?[^\s]*\d|\/companies\/[^/]+\/\d/i.test(new URL(href).pathname + new URL(href).search)) continue
      const title = strip(m[2]).split(/\s{2,}| \| /)[0].slice(0, 160)
      if (title.length < 4 || NAV.test(title)) continue
      out.set(href, { ...base, externalId: `${feed.slug}:${href.replace(/^https?:\/\/[^/]+/, '').slice(0, 200)}`, title, location: null, url: href, publishedAt: null })
    }
  }
  return Array.from(out.values())
}
