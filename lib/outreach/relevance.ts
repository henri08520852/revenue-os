// Relevance check before a first message: evidence from the company's job postings → likely pain → how strong.
// No evidence (and nothing the team knows) = no reason to write.
import { employerKey, HR_ROLE, VOLUME, fetchBADetails } from '@/lib/discovery/hiring'
import { fetchHtml, textOf, descriptionOf } from '@/lib/discovery/enrich'

import { PAINS, type PainKey } from './pains'
export { PAINS, type PainKey }

export type Evidence = { key: PainKey; fact: string; strength: number; job?: Job | null }
export type Relevance = { evidence: Evidence[]; open: number; hasHr: boolean; jobAd: { title: string; text: string } | null }
type Job = { title: string; role_key: string | null; url: string | null; source: string; external_id: string; published_at: string | null; first_seen_at: string; last_seen_at: string }

const DAY = 86400000
const EVERGREEN = /initiativ|talent ?pool|spontan|blindbewerbung|open application/i
const start = (j: Job) => Date.parse(j.published_at || j.first_seen_at)
const fmt = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })

export async function collectEvidence(supabase: any, a: {
  projectId: string; companyId: string; companyName: string; hiringKey?: string | null
  hiring?: { open?: number; new14?: number; repeated?: { role: string; count: number }[]; hrRoles?: string[] } | null
  isTeam?: (email: unknown) => boolean
}): Promise<Relevance> {
  const key = a.hiringKey || employerKey(a.companyName)
  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from('job_postings').select('title, role_key, url, source, external_id, published_at, first_seen_at, last_seen_at')
      .eq('project_id', a.projectId).eq('employer_key', key).gte('last_seen_at', new Date(Date.now() - 365 * DAY).toISOString())
      .order('last_seen_at', { ascending: false }).limit(1000),
    supabase.from('people').select('job_title, persona, email').eq('company_id', a.companyId),
  ])
  const all = ((rows || []) as Job[]).filter(j => j.title && !EVERGREEN.test(j.title))
  const openCut = Date.now() - 14 * DAY
  // Same title on several boards = one job
  const seen = new Set<string>()
  const open = all.filter(j => Date.parse(j.last_seen_at) >= openCut).filter(j => {
    const k = j.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim()
    return seen.has(k) ? false : (seen.add(k), true)
  })
  const closed = all.filter(j => Date.parse(j.last_seen_at) < openCut)
  const ev: Evidence[] = []

  // Same role online again after an earlier posting went offline
  for (const j of open) {
    const before = j.role_key && closed.find(c => c.role_key === j.role_key && Date.parse(c.last_seen_at) < start(j) - 7 * DAY)
    if (before) { ev.push({ key: 'reposted', strength: 90, job: j, fact: `„${j.title}“ ist erneut ausgeschrieben – eine frühere Anzeige für die Rolle war bis ${fmt(Date.parse(before.last_seen_at))} online.` }); break }
  }
  // Longest open role within a year (older dates are mostly evergreen postings)
  const age = (j: Job) => Math.floor((Date.now() - start(j)) / DAY)
  const oldest = open.filter(j => age(j) >= 45 && age(j) <= 365).sort((x, y) => start(x) - start(y))[0]
  const days = oldest ? age(oldest) : 0
  if (oldest) ev.push({ key: 'long_open', strength: days >= 60 ? 85 : 70, job: oldest, fact: `„${oldest.title}“ ist seit ${days} Tagen ausgeschrieben (seit ${fmt(start(oldest))}).` })

  const hrJobs = open.filter(j => HR_ROLE.test(j.title))
  const hrRoles = hrJobs.length ? hrJobs.map(j => j.title) : (a.hiring?.hrRoles || [])
  if (hrRoles.length) ev.push({ key: 'builds_recruiting', strength: 80, job: hrJobs[0] ?? null, fact: `Sucht selbst Verstärkung im HR/Recruiting: ${hrRoles.slice(0, 2).join(', ')}.` })

  const byRole = new Map<string, Job[]>()
  for (const j of open) if (j.role_key) byRole.set(j.role_key, [...(byRole.get(j.role_key) || []), j])
  const top = Array.from(byRole.values()).sort((x, y) => y.length - x.length)[0]
  if (top && top.length >= 2) ev.push({ key: 'repeated_role', strength: top.length >= 3 ? 75 : 65, job: top[0], fact: `Sucht ${top.length}× „${top[0].title}“ gleichzeitig.` })
  else if (!open.length && a.hiring?.repeated?.[0]) ev.push({ key: 'repeated_role', strength: 60, fact: `Sucht ${a.hiring.repeated[0].count}× ${a.hiring.repeated[0].role} gleichzeitig.` })

  const n14 = open.filter(j => start(j) >= Date.now() - 14 * DAY).length || (open.length ? 0 : a.hiring?.new14 ?? 0)
  if (n14 >= 3) ev.push({ key: 'new_jobs', strength: 55, fact: `${n14} neue Stellen in den letzten 14 Tagen.` })

  const vol = open.filter(j => VOLUME.test(j.title))
  if (vol.length >= 3 || (open.length >= 3 && vol.length / open.length >= 0.4)) ev.push({ key: 'volume', strength: 50, job: vol[0], fact: `${vol.length} Stellen mit hohem Bewerbungsvolumen, z. B. „${vol[0].title}“.` })

  const openCount = open.length || a.hiring?.open || 0
  const team = a.isTeam ?? (() => false)
  const hasHr = !!hrRoles.length || (people || []).some((p: any) => !team(p.email) && (HR_ROLE.test(p.job_title || '') || ['hr_lead', 'recruiter'].includes(p.persona)))
  if (!hasHr && openCount >= 2) ev.push({ key: 'no_hr', strength: 55, fact: `${openCount} offene Stellen, aber keine HR-Stelle und kein HR-Kontakt bekannt – die Vorauswahl liegt vermutlich bei Leitung oder Fachbereich.` })
  if (openCount >= 8 && !ev.some(e => e.key === 'repeated_role' || e.key === 'new_jobs')) ev.push({ key: 'many_jobs', strength: 40, fact: `${openCount} offene Stellen gleichzeitig.` })

  ev.sort((x, y) => y.strength - x.strength)
  const job = ev.find(e => e.job)?.job ?? oldest ?? open[0] ?? null
  return { evidence: ev, open: openCount, hasHr, jobAd: job ? await jobAdText(job) : null }
}

// Text of one job ad (BA details or the posting page) – shows urgency words like "ab sofort", shifts, career changers
async function jobAdText(j: Job): Promise<{ title: string; text: string } | null> {
  // At most 8 s – the draft must not wait on a slow job board
  return Promise.race([fetchJobAd(j), new Promise<null>(r => setTimeout(() => r(null), 8000))])
}
async function fetchJobAd(j: Job): Promise<{ title: string; text: string } | null> {
  try {
    let text = ''
    if (j.source === 'ba' && j.external_id) text = descriptionOf(await fetchBADetails(j.external_id))
    else if (j.url) { const page = await fetchHtml(j.url, 6000); if (page) text = textOf(page.html) }
    text = text.replace(/\s+/g, ' ').trim().slice(0, 2500)
    return text.length > 200 ? { title: j.title, text } : null
  } catch { return null }
}

export class NoReasonError extends Error {
  noReason = true
  constructor(message: string) { super(message); this.name = 'NoReasonError' }
}
