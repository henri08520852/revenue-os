// Website + Impressum for "Heiße Firmen": managing directors (contacts for the lead),
// register entry, central e-mail/phone and a size hint ("über 120 Mitarbeitende").
// Website: link on the company's Personio career page, else a checked guess from the name.
// Server-only, service role client.
import { employerKey } from './hiring'

export type Impressum = {
  website: string | null; domain: string | null; managers: string[]; register: string | null
  email: string | null; phone: string | null; employees: number | null; checkedAt: string; note?: string
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS-CompanyInfo/1.0)', 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5' }
const SOCIAL = /personio|linkedin|xing|facebook|instagram|youtube|twitter|x\.com|kununu|google|apple|tiktok|glassdoor|indeed|stepstone|gstatic|cloudflare|cookiebot|usercentrics|jsdelivr|w3\.org|schema\.org|onetrust|hotjar|vimeo|wa\.me|maps\./i

async function fetchHtml(url: string, timeoutMs = 7_000): Promise<{ html: string; url: string } | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'text/html', ...UA }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null
    return { html: (await res.text()).slice(0, 600_000), url: res.url || url }
  } catch { return null }
}

const decode = (s: string) => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&uuml;/g, 'ü').replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä')
  .replace(/&Uuml;/g, 'Ü').replace(/&Ouml;/g, 'Ö').replace(/&Auml;/g, 'Ä').replace(/&szlig;/g, 'ß').replace(/&#64;|&commat;/g, '@').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
export const textOf = (html: string) => decode(html
  .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|section|span)>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return null } }
const links = (html: string, base: string) => Array.from(html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi))
  .map(m => { try { return { href: new URL(decode(m[1]), base).toString(), text: textOf(m[2]).toLowerCase() } } catch { return null } })
  .filter(Boolean) as { href: string; text: string }[]

// ---------- website ----------

async function websiteFromPersonio(slug: string) {
  const page = await fetchHtml(`https://${slug}.jobs.personio.de/`)
  if (!page) return null
  const ext = links(page.html, page.url).map(l => l.href).filter(h => /^https?:/.test(h) && !SOCIAL.test(hostOf(h) || ''))
  // The logo / "Website" link points at the company's root
  const root = ext.find(h => { try { const u = new URL(h); return u.pathname === '/' || u.pathname === '' } catch { return false } }) ?? ext[0]
  return root ? `https://${hostOf(root)}` : null
}

const STOP = new Set(['gmbh', 'deutschland', 'germany', 'austria', 'schweiz', 'gruppe', 'group', 'holding', 'und', 'the', 'co', 'kg', 'ag', 'se', 'zentrale', 'standort', 'werk'])
const ascii = (s: string) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '')

// "Kögel Trailer GmbH" → koegel-trailer.de, koegeltrailer.de, koegel.de … — accepted only if the page names the company
async function websiteByGuess(name: string, country: string | null) {
  const words = employerKey(name).split(' ').filter(w => w.length > 1 && !STOP.has(w)).slice(0, 3)
  if (!words.length) return null
  const bases = Array.from(new Set([words.map(ascii).join('-'), words.map(ascii).join(''), words.slice(0, 2).map(ascii).join('-'), ascii(words[0])])).filter(b => b.length >= 3)
  const tlds = country === 'AT' ? ['at', 'com'] : country === 'CH' ? ['ch', 'com'] : ['de', 'com']
  const main = ascii(words[0])
  for (const b of bases.slice(0, 3)) for (const tld of tlds) {
    const page = await fetchHtml(`https://www.${b}.${tld}/`, 5_000)
    if (!page) continue
    const t = ascii(textOf(page.html).toLowerCase().slice(0, 20_000))
    if (main.length >= 3 && t.includes(main)) return `https://${hostOf(page.url) || `${b}.${tld}`}`
  }
  return null
}

// ---------- impressum ----------

const STOP_FIELD = /(registergericht|handelsregister|amtsgericht|sitz der|ust|umsatzsteuer|telefon|tel\.|e-mail|email|fax|hrb|steuer|aufsichtsrat|verantwortlich|inhaltlich|registernummer|firmenbuch)/i
export function managersOf(text: string): string[] {
  const out = new Set<string>()
  const re = /(geschäftsführ(?:er|erin|ung|ende[rn]?)?(?: gesellschafter(?:in)?)?|vertreten durch(?: die geschäftsführ\w*)?|vertretungsberechtigt\w*|managing directors?|ceo|inhaber(?:in)?)\s*[:\-–]?\s*([^\n]{3,160})/gi
  for (const m of Array.from(text.matchAll(re))) {
    let seg = m[2].split(STOP_FIELD)[0].replace(/^\s*(personen|person|die|der|den)\b\s*:?\s*/i, '')
    seg = seg.replace(/\b(dr|prof|dipl|ing|mba|mag|dkfm)\.?(-\w+\.?)?\s*/gi, '').replace(/\(.*?\)/g, ' ')
    for (const part of seg.split(/,|;|\bund\b|&|\/|\bsowie\b/)) {
      const n = part.replace(/^[\s:–-]+|[\s.:–-]+$/g, '').trim()
      const words = n.split(/\s+/)
      if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-ZÄÖÜ][\wäöüßéèáàç'.-]+$/.test(w)) && !/gmbh|ag\b|kg\b|holding|verwaltung|officer|executive|director|chief|managing|president|vorstand|geschäftsführ|gesellschaft/i.test(n)) out.add(n)
    }
    if (out.size >= 4) break
  }
  return Array.from(out).slice(0, 4)
}

export function registerOf(text: string) {
  const hr = text.match(/\b(HR[AB])\s*[:.]?\s*(\d{2,7}\s?[A-Z]?)\b/)
  const court = text.match(/Amtsgericht[ \t]+([A-ZÄÖÜ][\wäöüß.-]+(?:[ \t][A-ZÄÖÜ(][\wäöüß.)-]+)?)/)
  if (hr) return `${hr[1]} ${hr[2].trim()}${court ? `, AG ${court[1]}` : ''}`
  const fn = text.match(/\bFN\s*(\d{3,7}\s?[a-z])\b/i)
  if (fn) return `FN ${fn[1]}`
  const che = text.match(/\bCHE[-\s]?\d{3}\.\d{3}\.\d{3}\b/)
  return che ? che[0] : null
}

export function employeesOf(text: string) {
  let best: number | null = null
  for (const m of Array.from(text.matchAll(/(?:über|mehr als|rund|ca\.?|circa|knapp|>|more than|over)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{1,6})\s*\+?\s*(?:mitarbeiter(?:innen)?|mitarbeitende[n]?|beschäftigte[n]?|kolleg(?:inn)?en|employees|team members|menschen arbeiten)/gi))) {
    const n = +m[1].replace(/[.,]/g, '')
    if (n >= 3 && n <= 500_000) best = Math.max(best ?? 0, n)
  }
  return best
}

const pickEmail = (text: string, domain: string | null) => {
  const all = Array.from(new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e => e.toLowerCase())))
    .filter(e => !/example|beispiel|sentry|wixpress|\.png|\.jpg/.test(e))
  const own = domain ? all.filter(e => e.endsWith(domain)) : all
  const list = own.length ? own : all
  return list.find(e => /^(info|kontakt|contact|office|hello|hallo|mail|hr|jobs|karriere|bewerbung)@/.test(e)) ?? list[0] ?? null
}
const pickPhone = (text: string) => (text.match(/(?:tel(?:efon)?\.?|phone|fon|t)\s*[:.]?\s*(\+?\(?\d[\d\s/().-]{6,20}\d)/i) || [])[1]?.replace(/\s+/g, ' ').trim() ?? null

export async function readCompany(name: string, country: string | null, personioSlug: string | null): Promise<Impressum> {
  const checkedAt = new Date().toISOString()
  const website = (personioSlug ? await websiteFromPersonio(personioSlug) : null) ?? await websiteByGuess(name, country)
  if (!website) return { website: null, domain: null, managers: [], register: null, email: null, phone: null, employees: null, checkedAt, note: 'Website nicht gefunden' }
  const domain = hostOf(website)
  const home = await fetchHtml(website)
  if (!home) return { website, domain, managers: [], register: null, email: null, phone: null, employees: null, checkedAt, note: 'Website nicht erreichbar' }
  const homeLinks = links(home.html, home.url)
  const imp = homeLinks.find(l => /impressum|imprint|legal[- ]?notice|rechtliche hinweise/i.test(l.href + ' ' + l.text))
  const about = homeLinks.find(l => /über uns|ueber-uns|about|unternehmen|karriere|career/i.test(l.href + ' ' + l.text) && hostOf(l.href) === hostOf(home.url))
  const [impPage, aboutPage] = await Promise.all([imp ? fetchHtml(imp.href) : null, about ? fetchHtml(about.href) : null])
  const impText = impPage ? textOf(impPage.html) : ''
  const homeText = textOf(home.html)
  const all = [impText, homeText, aboutPage ? textOf(aboutPage.html) : ''].join('\n')
  return {
    website, domain, managers: managersOf(impText || homeText), register: registerOf(impText || all),
    email: pickEmail(impText || all, domain), phone: pickPhone(impText || all), employees: employeesOf(all),
    checkedAt, note: impPage ? undefined : 'Kein Impressum gefunden',
  }
}

// ---------- batch for the cron / button ----------

export async function enrichCandidates(svc: any, projectId: string, opts: { budgetMs?: number; ids?: string[] } = {}) {
  const started = Date.now(), budget = opts.budgetMs ?? 40_000
  let q = svc.from('candidate_companies').select('id, name, hiring, score, enrichment_data').eq('project_id', projectId).eq('source_type', 'hiring')
  q = opts.ids ? q.in('id', opts.ids) : q.eq('status', 'pending').is('enrichment_data->impressum', null).order('score', { ascending: false }).limit(20)
  const { data: list } = await q
  const queue = [...(list || [])]
  let done = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length && Date.now() - started < budget - 9_000) {
      const c = queue.shift()
      const feed = c.hiring?.feed
      const info = await readCompany(c.name, c.hiring?.countries?.[0] ?? null, feed?.ats === 'personio' ? feed.slug : null)
      const big = (info.employees ?? 0) > 300 && !(c.enrichment_data?.impressum?.employees > 300)
      await svc.from('candidate_companies').update({
        enrichment_data: { ...(c.enrichment_data || {}), impressum: info },
        ...(big && c.score != null ? { score: Math.max(0, c.score - 30), confidence: Math.max(0, c.score - 30) } : {}),
      }).eq('id', c.id)
      done++
    }
  }))
  return { enriched: done, left: queue.length }
}
