// Who we write to: persona from job title + company size + agency or not.
// Rules only (no AI); a persona set by hand on the contact wins.

export type Persona =
  | 'gf_small' | 'gf_mid' | 'hr_lead' | 'recruiter' | 'hiring_manager'
  | 'agency_owner' | 'agency_recruiter' | 'other'

export const PERSONAS: Record<Persona, string> = {
  gf_small: 'GF / Inhaber (klein)',
  gf_mid: 'Geschäftsführung (Mittelstand)',
  hr_lead: 'HR-Leitung',
  recruiter: 'Recruiter / TA',
  hiring_manager: 'Fachbereichsleitung',
  agency_owner: 'Agentur-Inhaber',
  agency_recruiter: 'Agentur-Recruiter',
  other: 'Sonstige',
}

export type SizeBucket = '1-49' | '50-249' | '250-999' | '1000+' | 'unbekannt'

// "50-200", "ca. 120", 85 → bucket by the first number found
export function sizeBucket(size: unknown): SizeBucket {
  const n = typeof size === 'number' ? size : Number(String(size ?? '').replace(/\./g, '').match(/\d+/)?.[0])
  if (!Number.isFinite(n) || n <= 0) return 'unbekannt'
  return n < 50 ? '1-49' : n < 250 ? '50-249' : n < 1000 ? '250-999' : '1000+'
}

const OWNER = /gesch[äa]ftsf[üu]hr|inhaber|gr[üu]nder|founder|\bceo\b|managing director|\bowner\b|vorstand|gesch[äa]ftsleit|\bmd\b|partner(in)?\b|prokurist/i
const HR_LEAD = /(leit|head|director|direktor|\bvp\b|chief|lead).{0,25}(personal|\bhr\b|people|human|talent)|(personal|\bhr\b|people|human resources|talent).{0,25}(leit|head|director|direktor|lead|manager)|personalchef|\bchro\b|\bcpo\b/i
const RECRUITER = /recruit|talent acquisition|\bta\b|personalreferent|personalsachbearb|personalmarketing|hr[- ]?(business ?partner|generalist|specialist|spezialist|referent|coordinator|koordinator|assistant|assistenz)|sourc(er|ing)|people (partner|operations)|employer branding/i
const LEADER = /leiter|leitung|\bhead\b|team ?lead|teamleit|bereichsleit|abteilungsleit|werksleit|niederlassungsleit|filialleit|director|direktor|\bcto\b|\bcoo\b|\bcfo\b|pflegedienstleit|chefarzt|meister/i

export function personaOf(jobTitle: string | null | undefined, size: unknown, isAgency: boolean): Persona {
  const t = (jobTitle || '').trim()
  if (isAgency) return OWNER.test(t) ? 'agency_owner' : 'agency_recruiter'
  if (!t) return 'other'
  if (HR_LEAD.test(t)) return 'hr_lead'
  if (RECRUITER.test(t)) return 'recruiter'
  if (OWNER.test(t)) {
    const b = sizeBucket(size)
    return b === '1-49' ? 'gf_small' : 'gf_mid'
  }
  if (LEADER.test(t)) return 'hiring_manager'
  return 'other'
}

// role_category already exists on people; keep it in sync with the persona
export function roleCategoryOf(p: Persona): string {
  return p === 'gf_small' || p === 'gf_mid' || p === 'agency_owner' ? 'executive'
    : p === 'hr_lead' || p === 'recruiter' || p === 'agency_recruiter' ? 'hr'
    : p === 'hiring_manager' ? 'operations' : 'other'
}
