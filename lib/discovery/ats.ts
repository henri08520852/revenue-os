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
]

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
    if (ats === 'personio') {
      const html: string = await get(`https://${slug}.jobs.personio.de/`, 'text/html')
      const raw = (html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i) || [])[1]
      return raw ? raw.replace(/&amp;/g, '&').replace(/^(jobs|karriere|career|careers|stellenangebote|offene stellen)\s*(bei|at|@|[-–|:])?\s*/i, '').replace(/\s*[-–|:]\s*(jobs|karriere|career|careers|personio).*$/i, '').trim() || null : null
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
