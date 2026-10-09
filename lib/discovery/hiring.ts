// Hiring discovery — "Heiße Firmen": employers in DACH with many open roles right now.
// Sources: BA Jobbörse (DE, free), Google Jobs via SerpApi (DE/AT/CH, optional: SERPAPI_KEY),
// public job feeds of applicant tracking systems (Personio, Greenhouse, … — exact counts).
// Postings are stored in job_postings, grouped per employer, scored and written to
// candidate_companies (source_type 'hiring'). Known CRM companies also get a signal.
// Server-only, service role client.
import { feedOf, fetchAtsJobs } from './ats'

const BA_URL = process.env.BA_JOBS_URL || 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs'
const BA_KEY = 'jobboerse-jobsuche' // public key of the BA job search
const SERPAPI_KEY = process.env.SERPAPI_KEY

// Searches rotate daily; each run takes a slice so the whole list is covered every few days.
// Focus on roles with many applicants per opening (ICP: screening pressure).
const BA_QUERIES: { was: string; angebotsart?: number }[] = [
  { was: 'Werkstudent' }, { was: 'Trainee' }, { was: '', angebotsart: 4 }, // 4 = Ausbildung / duales Studium
  { was: 'Vertrieb' }, { was: 'Kundenservice' }, { was: 'Sachbearbeiter' }, { was: 'Kaufmann' },
  { was: 'Marketing' }, { was: 'Personal' }, { was: 'Buchhaltung' }, { was: 'Projektmanager' },
  { was: 'Softwareentwickler' }, { was: 'Pflegefachkraft' }, { was: 'Erzieher' }, { was: 'Elektroniker' },
  { was: 'Mechatroniker' }, { was: 'Logistik' }, { was: 'Assistenz' }, { was: 'Consultant' }, { was: 'Ingenieur' },
]
// Google Jobs: role × city across DACH (AT/CH first — the BA only covers Germany)
const GOOGLE_ROLES = ['Werkstudent', 'Trainee', 'Lehrling', 'Vertrieb', 'Kundenservice', 'Sachbearbeiter', 'Marketing', 'Personal', 'Buchhaltung', 'Projektmanager', 'Softwareentwickler', 'Pflege']
const GOOGLE_CITIES: { city: string; gl: string }[] = [
  { city: 'Wien, Austria', gl: 'at' }, { city: 'Zürich, Switzerland', gl: 'ch' }, { city: 'Graz, Austria', gl: 'at' },
  { city: 'Basel, Switzerland', gl: 'ch' }, { city: 'Linz, Austria', gl: 'at' }, { city: 'Bern, Switzerland', gl: 'ch' },
  { city: 'Salzburg, Austria', gl: 'at' }, { city: 'Luzern, Switzerland', gl: 'ch' }, { city: 'Innsbruck, Austria', gl: 'at' },
  { city: 'St. Gallen, Switzerland', gl: 'ch' },
  { city: 'Berlin, Germany', gl: 'de' }, { city: 'Hamburg, Germany', gl: 'de' }, { city: 'München, Germany', gl: 'de' },
  { city: 'Köln, Germany', gl: 'de' }, { city: 'Frankfurt, Germany', gl: 'de' }, { city: 'Stuttgart, Germany', gl: 'de' },
]
const GOOGLE_QUERIES = GOOGLE_CITIES.flatMap(c => GOOGLE_ROLES.map(q => ({ q, location: c.city, gl: c.gl })))
const BA_QUERIES_PER_RUN = 5
const BA_PAGES = 2               // × 100 postings
const EMPLOYER_LOOKUPS = 12      // full posting count for the most promising employers
// SerpApi searches per day (each = 10 postings). 2 ≈ 60/month; Starter plan (1,000/month) → 30
const GOOGLE_QUERIES_PER_RUN = Math.max(0, Number(process.env.SERPAPI_SEARCHES_PER_DAY) || 2)
const ATS_FEEDS_PER_RUN = 10      // exact counts from applicant tracking systems
const ATS_REFRESH_DAYS = 3
const WINDOW_DAYS = 30
const MIN_OPEN = 4               // below this an employer is not "hot"
const MAX_OPEN = 80              // above this it is a large company, outside the ICP (10–200 employees)

export type Posting = {
  source: string; externalId: string; employer: string; title: string
  location: string | null; country: string; url: string | null; publishedAt: string | null
}

// ---------- normalizing ----------

const LEGAL = /\b(gmbh\s*&\s*co\.?\s*kg(aa)?|gmbh|mbh|ag|se|kgaa|kg|ohg|gbr|ug(\s*\(haftungsbeschränkt\))?|e\.?\s?v\.?|e\.?\s?k\.?|ltd\.?|inc\.?|llc|sarl|sàrl|sa|holding)\b/gi
export const employerKey = (name: string) =>
  name.toLowerCase().replace(/\(.*?\)/g, ' ').replace(LEGAL, ' ').replace(/[^a-z0-9äöüß]+/g, ' ').replace(/\s+/g, ' ').trim()

export const roleKey = (title: string) =>
  title.toLowerCase()
    .replace(/\((m|w|d|f|x|all|gn|div)[^)]*\)/g, ' ').replace(/\b(m\/w\/d|w\/m\/d|m\/f\/d|all genders?)\b/g, ' ')
    .replace(/[*:_\/]in(nen)?\b/g, '').replace(/\(.*?\)/g, ' ')
    .split(/\s[-–|@]\s|\s+in\s+(?=[A-ZÄÖÜa-zäöü]+$)/)[0]
    .replace(/\b(vollzeit|teilzeit|befristet|unbefristet|remote|hybrid)\b/g, ' ')
    .replace(/[^a-z0-9äöüß ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ')

// Staffing agencies and the public sector post for others or are not the ICP
const AGENCY = /(personal(dienst|service|vermittl|leasing|partner|management)|zeitarbeit|arbeitnehmerüberlassung|staffing|recruit|headhunt|jobs? ?(service|agentur)|randstad|adecco|manpower|hays\b|amadeus fire|orizon|persona service|tempton|brunel|dekra arbeit|gi group|jobactive|piening|ferchau|trenkwalder|avantgarde experts|robert half|page personnel|michael page|\bpersonal\b|synergie|engineering people|bertrandt|akkodis|\balten\b|expleo|ingenieurdienst|personalberatung|jobcenter)/i
const PUBLIC = /^(stadt|landeshauptstadt|landkreis|kreis|gemeinde|markt|bundes|bundesagentur|land |freistaat|universität|hochschule|technische universität|max-planck|fraunhofer|helmholtz|bundeswehr|polizei|deutsche rentenversicherung|aok|landratsamt|bezirksamt)/i
const LARGE = /^(deutsche bahn|db |lidl|aldi|edeka|rewe|kaufland|netto|penny|dm-drogerie|rossmann|amazon|dhl|deutsche post|siemens|bosch|robert bosch|bmw|mercedes|volkswagen|audi|porsche|sap|telekom|deutsche telekom|vodafone|allianz|ergo|axa|sparkasse|volksbank|commerzbank|deutsche bank|mcdonald|burger king|ikea|obi|bauhaus|hornbach|decathlon|h&m|zalando|otto|tui|lufthansa|basf|bayer|henkel|thyssenkrupp|continental|schaeffler|zf |würth|helios|asklepios|sana|fresenius|vivantes|charité|ameos|johanniter|malteser|drk|deutsches rotes kreuz|caritas|diakonie|awo|arbeiterwohlfahrt)/i
const PUBLIC_ANY = /(landesbetrieb|\baör\b|anstalt des öffentlichen rechts|körperschaft des öffentlichen|des bundes\b|des landes\b|landesamt|bundesamt|kreisverwaltung|stadtverwaltung|stadtwerke)/i
// Group brands that show up with only a handful of BA postings per legal entity
const LARGE_ANY = /(dormakaba|nestl[eé]|infineon|bechtle|knorr-bremse|media-?saturn|mediamarkt|\bdpd\b|\btüv\b|\bdekra\b|lkw walter|\badesso\b|nagel-group|autobahn gmbh|deutsche bahn|siemens|\bbosch\b|\bbmw\b|\bsap\b|\bdhl\b|\bups\b|hermes|fedex|accenture|deloitte|\bpwc\b|\bkpmg\b|ernst & young|\bey\b|capgemini|\bibm\b|t-systems|telekom)/i
export const excluded = (name: string) => LARGE_ANY.test(name) || AGENCY.test(name) || PUBLIC.test(name.trim()) || PUBLIC_ANY.test(name) || LARGE.test(name.trim())

const VOLUME = /werkstudent|trainee|ausbildung|azubi|lehrling|lehrstelle|duales studium|dual|praktik|aushilfe|minijob|kundenservice|kundenberat|call ?center|vertrieb|sales|verkäuf|sachbearbeit|kaufm|empfang|assistenz|lager|logistik|fahrer|pflege|erzieh|service/i

const ATS: [RegExp, string][] = [
  [/personio\./, 'Personio'], [/softgarden\./, 'softgarden'], [/greenhouse\.io/, 'Greenhouse'], [/lever\.co/, 'Lever'],
  [/smartrecruiters\./, 'SmartRecruiters'], [/workable\./, 'Workable'], [/join\.com/, 'JOIN'], [/recruitee\./, 'Recruitee'],
  [/dvinci|d-vinci/, 'd.vinci'], [/rexx-systems|rexx\./, 'rexx'], [/concludis\./, 'concludis'], [/successfactors|sapsf/, 'SuccessFactors'],
  [/myworkday|workday\./, 'Workday'], [/onlyfy|prescreen/, 'onlyfy'], [/umantis|abacus/, 'Abacus Umantis'], [/kenjo\./, 'Kenjo'],
  [/factorial/, 'Factorial'], [/jobs\.b-ite|b-ite\./, 'BITE'], [/hrworks|hr-works/, 'HRworks'], [/heyrecruit/, 'heyrecruit'],
  [/talention/, 'talention'], [/coveto/, 'coveto'], [/perbility/, 'perbility'], [/ashbyhq/, 'Ashby'], [/teamtailor/, 'Teamtailor'],
]
export const atsOf = (url: string | null) => {
  const u = (url || '').toLowerCase()
  return ATS.find(([re]) => re.test(u))?.[1] ?? null
}

// ---------- sources ----------

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`)
  return res.json()
}

// The BA API answered 403 (empty body) from Vercel for the plain key request → try the other
// publicly documented access paths (API version, OAuth client of the BA job search app) once,
// keep the first that works; errors carry the BA's answers for diagnosis.
const BA_UA = { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS-JobSignals/1.0)', 'Accept-Language': 'de-DE,de;q=0.9' }
const BA_PATHS = ['/pc/v4/jobs', '/pc/v4/app/jobs', '/pc/v6/jobs', '/pc/v5/jobs']
const BA_OAUTH = { url: 'https://rest.arbeitsagentur.de/oauth/gettoken_cc', id: 'c003a37f-024f-462a-b36d-b001be4cd24a', secret: '32a39620-32b3-4307-9aa1-511e3d7f48a8' }
const BA_VARIANTS: { path: string; auth: 'key' | 'oauth' }[] = [
  ...BA_PATHS.map(path => ({ path, auth: 'key' as const })),
  ...BA_PATHS.slice(0, 2).map(path => ({ path, auth: 'oauth' as const })),
]
let baVariant: number | null = null
export let baSample: string | null = null // shape of one BA job, to see which fields the API offers
let baToken: { value: string; until: number } | null = null

async function baBearer() {
  if (baToken && baToken.until > Date.now()) return baToken.value
  const res = await fetch(BA_OAUTH.url, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...BA_UA },
    body: new URLSearchParams({ client_id: BA_OAUTH.id, client_secret: BA_OAUTH.secret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Token ${res.status}`)
  const d = await res.json()
  baToken = { value: d.access_token, until: Date.now() + ((d.expires_in ?? 600) - 60) * 1000 }
  return baToken.value
}

async function baGet(q: URLSearchParams) {
  const tried: string[] = []
  const base = BA_URL.replace(/\/pc\/v\d+\/(app\/)?jobs$/, '')
  for (const i of baVariant != null ? [baVariant] : BA_VARIANTS.map((_, i) => i)) {
    const v = BA_VARIANTS[i]
    try {
      const auth: Record<string, string> = v.auth === 'key' ? { 'X-API-Key': BA_KEY } : { Authorization: `Bearer ${await baBearer()}`, OAuthAccessToken: await baBearer() }
      const res = await fetch(`${base}${v.path}?${q}`, { headers: { Accept: 'application/json', ...BA_UA, ...auth }, signal: AbortSignal.timeout(12_000) })
      if (res.ok) { baVariant = i; return res.json() }
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80)
      tried.push(`${v.path.replace('/pc/', '')}+${v.auth} ${res.status}${body ? ` „${body}“` : ''}`)
    } catch (e: any) {
      tried.push(`${v.path.replace('/pc/', '')}+${v.auth} ${e?.message || e}`)
    }
  }
  throw new Error(`BA-Jobbörse: ${tried.join(' | ')}`)
}

export async function fetchBA(params: { was?: string; angebotsart?: number; arbeitgeber?: string; page?: number }): Promise<Posting[]> {
  const q = new URLSearchParams({ size: '100', page: String(params.page ?? 1), veroeffentlichtseit: String(WINDOW_DAYS), zeitarbeit: 'false', pav: 'false' })
  if (params.was) q.set('was', params.was)
  if (params.angebotsart) q.set('angebotsart', String(params.angebotsart))
  if (params.arbeitgeber) q.set('arbeitgeber', params.arbeitgeber)
  const data = await baGet(q)
  // v4 calls the list "stellenangebote", v6 "ergebnisliste"; field names differ between versions
  const list = Array.isArray(data?.stellenangebote) ? data.stellenangebote : Array.isArray(data?.ergebnisliste) ? data.ergebnisliste : null
  if (!list) {
    const v = baVariant != null ? `${BA_VARIANTS[baVariant].path}+${BA_VARIANTS[baVariant].auth}` : '?'
    baVariant = null
    throw new Error(`BA-Antwort (${v}) ohne Stellenliste – {${shapeOf(data)}}`)
  }
  if (list[0] && !baSample) baSample = shapeOf(list[0], 2).slice(0, 600)
  const postings: Posting[] = list.map(baPosting).filter(Boolean) as Posting[]
  if (list.length && !postings.length) throw new Error(`BA-Stelle unbekannt aufgebaut – {${shapeOf(list[0], 2)}}`)
  return postings
}

const shapeOf = (x: any, depth = 1): string => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.entries(x).slice(0, 14).map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.length}]` : v && typeof v === 'object' ? (depth > 1 ? `{${shapeOf(v, depth - 1)}}` : 'object') : typeof v}`).join(', ')
  : Array.isArray(x) ? `[${x.length}]` : typeof x

const str = (...xs: any[]) => { for (const x of xs) if (typeof x === 'string' && x.trim()) return x.trim(); return null }

function baPosting(s: any): Posting | null {
  const ort = s.arbeitsort ?? s.arbeitsorte?.[0] ?? s.stellenlokationen?.[0]?.adresse ?? s.stellenlokationen?.[0] ?? null
  const refnr = str(s.refnr, s.referenznummer, s.refNr, s.id, s.hashId)
  const employer = str(s.arbeitgeber, s.arbeitgeber?.name, s.arbeitgeberName, s.arbeitgeberdarstellung?.name, s.firma)
  const title = str(s.titel, s.stellenangebotsTitel, s.stellentitel, s.beruf, s.hauptberuf)
  if (!refnr || !employer || !title) return null
  const published = str(s.aktuelleVeroeffentlichungsdatum, s.veroeffentlichungsdatum, s.datumErsteVeroeffentlichung, s.modifikationsTimestamp)
  return {
    source: 'ba', externalId: refnr, employer, title,
    location: str(ort?.ort, ort?.ortsname, ort?.stadt, ort?.region, typeof ort === 'string' ? ort : null), country: 'DE',
    url: str(s.externeUrl, s.allianzpartnerUrl, s.externeURL) ?? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`,
    publishedAt: published && !isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
  }
}

// "vor 3 Tagen" / "3 days ago" → ISO date
function ago(text: string | undefined) {
  const m = String(text || '').match(/(\d+)\s*(stunde|hour|tag|day|woche|week|monat|month)/i)
  if (!m) return null
  const unit = m[2].toLowerCase()
  const days = /stunde|hour/.test(unit) ? 0 : /tag|day/.test(unit) ? +m[1] : /woche|week/.test(unit) ? +m[1] * 7 : +m[1] * 30
  return new Date(Date.now() - days * 86400000).toISOString()
}

export async function fetchGoogleJobs(q: string, location: string, gl: string): Promise<Posting[]> {
  if (!SERPAPI_KEY) return []
  const p = new URLSearchParams({ engine: 'google_jobs', q, location, gl, hl: 'de', api_key: SERPAPI_KEY })
  const data = await fetchJson(`https://serpapi.com/search.json?${p}`)
  return (data.jobs_results || []).filter((j: any) => j.company_name && j.title).map((j: any) => {
    const link = j.apply_options?.find((o: any) => atsOf(o.link))?.link ?? j.apply_options?.[0]?.link ?? j.share_link ?? null
    return {
      source: 'google_jobs', externalId: String(j.job_id || `${j.company_name}|${j.title}|${j.location}`).slice(0, 300),
      employer: String(j.company_name).trim(), title: String(j.title).trim(), location: j.location ?? null,
      country: gl.toUpperCase(), url: link, publishedAt: ago(j.detected_extensions?.posted_at),
    }
  })
}

// ---------- scoring ----------

type Row = { employer_name: string; title: string; role_key: string | null; location: string | null; country: string | null; url: string | null; ats: string | null; published_at: string | null; first_seen_at: string; last_seen_at?: string; source: string }

const BOARDS = ['ba', 'google_jobs']

// The applicant tracking system's feed is the complete list; otherwise merge the job boards
// and drop the same job listed on several of them
function openRoles(all: Row[]) {
  const fresh = new Date(Date.now() - 2 * ATS_REFRESH_DAYS * 86400000).toISOString()
  const feed = all.filter(r => !BOARDS.includes(r.source) && (r.last_seen_at ?? r.first_seen_at) >= fresh)
  if (feed.length) return feed
  // Same title + place on another board = the same job; several postings on one board are separate openings
  const key = (r: Row) => `${r.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim()}|${(r.location || '').toLowerCase()}`
  const ba = new Set(all.filter(r => r.source === 'ba').map(key))
  return all.filter(r => r.source === 'ba' || !ba.has(key(r)))
}

export function scoreEmployer(all: Row[]) {
  const rows = openRoles(all)
  const feed = all.map(r => feedOf(r.url)).find(Boolean) ?? null
  const open = rows.length
  const since14 = Date.now() - 14 * 86400000
  const new14 = rows.filter(r => Date.parse(r.published_at || r.first_seen_at) >= since14).length
  const byRole = new Map<string, number>()
  for (const r of rows) if (r.role_key) byRole.set(r.role_key, (byRole.get(r.role_key) || 0) + 1)
  const repeated = Array.from(byRole.entries()).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([role, count]) => ({ role, count }))
  const volume = rows.filter(r => VOLUME.test(r.title)).length
  const ats = Array.from(new Set(rows.map(r => r.ats).filter(Boolean))) as string[]
  const count = (xs: (string | null)[]) => Array.from(xs.reduce((m, x) => x ? m.set(x, (m.get(x) || 0) + 1) : m, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).map(([x]) => x)

  let score = Math.min(50, open * 3)
  // Legal form / branch wording of a large group → likely outside 10–200 employees
  if (/\b(ag|se|kgaa)\b|zentrale|depot|niederlassung|filiale/i.test(rows[0]?.employer_name || '')) score -= 20
  score += Math.min(20, repeated.length * 7)
  if (volume / open >= 0.3) score += 10
  if (new14 >= 3) score += 10
  if (!ats.length) score += 5 // no known applicant system → screening likely by hand
  score = Math.max(0, Math.min(100, score))

  const parts = [`${open} offene Stellen`]
  if (new14) parts.push(`${new14} neu in 14 Tagen`)
  if (repeated[0]) parts.push(`${repeated[0].count}× ${repeated[0].role}`)
  return {
    score, reason: parts.join(' · '),
    hiring: {
      open, new14, repeated: repeated.slice(0, 5), volumeRoles: volume, ats,
      locations: count(rows.map(r => r.location)).slice(0, 4), countries: count(rows.map(r => r.country)),
      sources: count(all.map(r => r.source)), feed, updatedAt: new Date().toISOString(),
    },
    evidence: rows.slice().sort((a, b) => Date.parse(b.published_at || b.first_seen_at) - Date.parse(a.published_at || a.first_seen_at))
      .slice(0, 6).map(r => ({ title: r.title, link: r.url, source: r.location || r.country || '' })),
  }
}

// ---------- run ----------

export function toRows(projectId: string, postings: Posting[]) {
  const now = new Date().toISOString()
  const seen = new Set<string>()
  return postings.filter(p => !excluded(p.employer) && employerKey(p.employer))
    .filter(p => { const k = `${p.source}|${p.externalId}`; return !seen.has(k) && (seen.add(k), true) })
    .map(p => ({
      project_id: projectId, source: p.source, external_id: p.externalId, employer_key: employerKey(p.employer),
      employer_name: p.employer, title: p.title.slice(0, 300), role_key: roleKey(p.title) || null, location: p.location,
      country: p.country, url: p.url, ats: atsOf(p.url) ?? (BOARDS.includes(p.source) ? null : p.source),
      published_at: p.publishedAt && !isNaN(Date.parse(p.publishedAt)) ? new Date(p.publishedAt).toISOString() : null, last_seen_at: now,
    }))
}

export async function save(svc: any, rows: any[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await svc.from('job_postings').upsert(rows.slice(i, i + 200), { onConflict: 'project_id,source,external_id' })
    if (error) throw new Error(error.message)
  }
}

export async function runHiringDiscovery(svc: any, projectId: string, opts: { budgetMs?: number; day?: number } = {}) {
  const started = Date.now(), budget = opts.budgetMs ?? 45_000
  const left = () => budget - (Date.now() - started)
  const day = opts.day ?? Math.floor(Date.now() / 86400000)
  const stats = { postings: 0, employers: 0, candidates: 0, signals: 0, errors: [] as string[], baAccess: null as string | null }

  // 0) Candidates that today's filters would drop (agencies, groups, public bodies) leave the list
  const { data: pending } = await svc.from('candidate_companies').select('id, name').eq('project_id', projectId).eq('source_type', 'hiring').eq('status', 'pending')
  const drop = (pending || []).filter((c: any) => excluded(c.name)).map((c: any) => c.id)
  if (drop.length) await svc.from('candidate_companies').update({ status: 'rejected', notes: 'Automatisch aussortiert (Agentur/Konzern/Behörde)', reviewed_at: new Date().toISOString() }).in('id', drop)

  // 1) Broad search: role keywords across Germany (+ AT/CH via Google Jobs)
  const fetched: Posting[] = []
  let baDown = false // no request variant got through → don't hammer the API
  for (let i = 0; i < BA_QUERIES_PER_RUN && left() > 25_000 && !baDown; i++) {
    const q = BA_QUERIES[(day * BA_QUERIES_PER_RUN + i) % BA_QUERIES.length]
    for (let page = 1; page <= BA_PAGES; page++) {
      try { fetched.push(...await fetchBA({ ...q, page })) } catch (e: any) { stats.errors.push(`BA ${q.was || q.angebotsart}: ${e.message}`); baDown = baVariant == null; break }
    }
  }
  for (let i = 0; i < GOOGLE_QUERIES_PER_RUN && SERPAPI_KEY && left() > 20_000; i++) {
    // Step through the list with a stride so consecutive searches hit different cities and roles
    const q = GOOGLE_QUERIES[((day * GOOGLE_QUERIES_PER_RUN + i) * 7) % GOOGLE_QUERIES.length]
    try { fetched.push(...await fetchGoogleJobs(q.q, q.location, q.gl)) } catch (e: any) { stats.errors.push(`Google ${q.q}: ${e.message}`) }
  }
  stats.baAccess = baVariant != null ? `${BA_VARIANTS[baVariant].path}+${BA_VARIANTS[baVariant].auth}, ${fetched.length} Stellen roh` : null
  let rows = toRows(projectId, fetched)
  await save(svc, rows)
  stats.postings += rows.length

  // 2) Employers that show up repeatedly → fetch all their BA postings for the true count
  const sample = new Map<string, { name: string; n: number }>()
  for (const r of rows) sample.set(r.employer_key, { name: r.employer_name, n: (sample.get(r.employer_key)?.n || 0) + 1 })
  const promising = Array.from(sample.values()).filter(e => e.n >= 2).sort((a, b) => b.n - a.n).slice(0, EMPLOYER_LOOKUPS)
  for (const e of promising) {
    if (left() < 12_000) break
    try {
      const more = toRows(projectId, await fetchBA({ arbeitgeber: e.name }))
      await save(svc, more)
      stats.postings += more.length
    } catch (err: any) { stats.errors.push(`BA ${e.name}: ${err.message}`) }
  }

  // 3) Load all postings of the last 30 days for every employer seen in this run
  const keys = Array.from(new Set(rows.map(r => r.employer_key)))
  const byEmployer = await loadEmployers(svc, projectId, keys)

  // 4) Exact counts from applicant tracking systems for the biggest employers (refreshed every few days);
  //    every feed found is also registered for the regular feed rotation (ats-feeds.ts)
  const fresh = new Date(Date.now() - ATS_REFRESH_DAYS * 86400000).toISOString()
  const feeds = Array.from(byEmployer.entries())
    .map(([key, list]) => ({ key, list, feed: list.map(r => feedOf(r.url)).find(Boolean) ?? null }))
    .filter(e => e.feed)
  if (feeds.length) {
    await svc.from('ats_accounts').upsert(feeds.map(e => ({
      project_id: projectId, ats: e.feed!.ats, slug: e.feed!.slug, employer_name: e.list[0].employer_name, employer_key: e.key,
    })), { onConflict: 'project_id,ats,slug', ignoreDuplicates: true })
  }
  const withFeed = feeds
    .filter(e => e.list.length >= 2 && !e.list.some(r => r.source === e.feed!.ats && (r.last_seen_at ?? '') >= fresh))
    .sort((a, b) => b.list.length - a.list.length).slice(0, ATS_FEEDS_PER_RUN)
  for (const e of withFeed) {
    if (left() < 6_000) break
    try {
      const jobs = toRows(projectId, await fetchAtsJobs(e.feed!, e.list[0].employer_name, e.list[0].country || 'DE'))
      if (!jobs.length) continue
      await save(svc, jobs)
      stats.postings += jobs.length
      byEmployer.set(e.key, [...e.list, ...jobs.map(j => ({ ...j, first_seen_at: new Date().toISOString() }))])
    } catch (err: any) { stats.errors.push(`${e.feed!.ats} ${e.feed!.slug}: ${err.message}`) }
  }

  await storeScores(svc, projectId, byEmployer, stats)
  return stats
}

// All postings of the last 30 days per employer
export async function loadEmployers(svc: any, projectId: string, keys: string[]) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
  const byEmployer = new Map<string, Row[]>()
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await svc.from('job_postings')
      .select('employer_key, employer_name, title, role_key, location, country, url, ats, published_at, first_seen_at, last_seen_at, source')
      .eq('project_id', projectId).in('employer_key', keys.slice(i, i + 100)).gte('last_seen_at', since).limit(5000)
    for (const r of data || []) byEmployer.set(r.employer_key, [...(byEmployer.get(r.employer_key) || []), r])
  }
  return byEmployer
}

// Score employers → candidate_companies ("Heiße Firmen") + signal on known CRM companies
export async function storeScores(svc: any, projectId: string, byEmployer: Map<string, Row[]>, stats: { employers: number; candidates: number; signals: number }) {
  const { data: companies } = await svc.from('companies').select('id, name').eq('project_id', projectId)
  const companyByKey = new Map<string, string>((companies || []).map((c: any) => [employerKey(c.name), c.id]))

  for (const [key, list] of Array.from(byEmployer.entries())) {
    const n = openRoles(list).length
    if (n < MIN_OPEN || n > MAX_OPEN) continue
    stats.employers++
    const s = scoreEmployer(list)
    const name = list[0].employer_name
    const companyId = companyByKey.get(key) ?? null

    const { data: existing } = await svc.from('candidate_companies').select('id, status')
      .eq('project_id', projectId).eq('hiring->>key', key).limit(1)
    const patch = {
      hiring: { ...s.hiring, key }, score: s.score, confidence: s.score, signal_hint: 'hiring_pressure', evidence: s.evidence,
      existing_company_id: companyId, updated_at: new Date().toISOString(),
    }
    if (existing?.length) {
      await svc.from('candidate_companies').update(patch).eq('id', existing[0].id)
    } else {
      const { error } = await svc.from('candidate_companies').insert({
        project_id: projectId, name, source_type: 'hiring', status: 'pending', ...patch,
      })
      if (!error) stats.candidates++
    }

    // Known company → signal in its timeline (at most once a week)
    if (companyId) {
      const { data: recent } = await svc.from('signals').select('id').eq('company_id', companyId).eq('signal_type', 'hiring_pressure')
        .gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString()).limit(1)
      if (!recent?.length) {
        await svc.from('signals').insert({
          project_id: projectId, company_id: companyId, signal_type: 'hiring_pressure', strength: s.score, confidence: 80,
          reason: s.reason, evidence: { ...s.hiring, jobs: s.evidence }, expires_at: new Date(Date.now() + 21 * 86400000).toISOString(),
        })
        stats.signals++
      }
    }
  }
}

// Last run of a discovery job, kept as a row of ats_discovery_state so it can be checked later
export async function logRun(svc: any, projectId: string, kind: string, result: unknown) {
  await svc.from('ats_discovery_state').upsert({
    project_id: projectId, pattern: `_status:${kind}`, collection: JSON.stringify({ at: new Date().toISOString(), result }).slice(0, 4000),
    page: 0, updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,pattern' })
}
