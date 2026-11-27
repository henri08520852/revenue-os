// ICP fit of a "Heiße Firma": SMEs and growing startups in DACH, industry first.
// Size counts only when it is known (website/Impressum, BA job ad, Northdata or set by hand) – no guessing.

export type SizeKey = 'small' | 'mid' | 'large' | 'enterprise'

// Points by employee count: 10–249 is the sweet spot, groups and corporates drop far back
export function sizeAdjust(employees: number | null | undefined): number {
  if (employees == null || !(employees > 0)) return 0
  if (employees < 10) return -10
  if (employees < 250) return 15
  if (employees < 500) return -5
  if (employees < 1000) return -25
  return -50
}
const BUCKET_POINTS: Record<SizeKey, number> = { small: 10, mid: 15, large: -15, enterprise: -50 }

export function knownEmployees(enrichment: any): number | null {
  const n = enrichment?.impressum?.employees ?? enrichment?.northdata?.employees ?? null
  return n != null && n > 0 ? n : null
}

// Final score = hiring score (stored as hiring.baseScore) + size points
export function finalScore(base: number, enrichment: any): number {
  const n = knownEmployees(enrichment)
  const manual = enrichment?.sizeManual as SizeKey | undefined
  const d = n != null ? sizeAdjust(n) : manual && manual in BUCKET_POINTS ? BUCKET_POINTS[manual] : 0
  return Math.max(0, Math.min(100, Math.round(base + d)))
}

// Names that point to an international group or a subsidiary of one ("… Deutschland GmbH", "IONOS DE", "… Inc.")
export const CORPORATE = /\b(inc|corp|corporation|llc|ltd|plc|n\.?v\.?|b\.?v\.?|s\.?a\.?|international|global|worldwide|europe|emea)\b\.?|\b(germany|deutschland|austria|österreich|schweiz|switzerland|dach)\b(\s*(gmbh|ag|se|kg|& co\.? kg))*\s*$|\s(de|en|at|ch)$/i
// Placement / staffing wording the hard filter does not catch → far back for now (talk to industry first)
export const AGENCY_SOFT = /placement|talents?\b|staffing|workforce|personnel|interim|vermittlung|outsourcing|karriere|career|jobs?\b|recruiting|personal(?!is)/i
