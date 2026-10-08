// Win/loss reasons and the slim qualification checklist (migration 025)

export const LOST_REASONS = [
  { key: 'budget', label: 'Budget / Preis' },
  { key: 'timing', label: 'Kein Bedarf / Timing' },
  { key: 'competitor', label: 'Wettbewerber' },
  { key: 'no_decision_maker', label: 'Entscheider nicht erreicht' },
  { key: 'missing_feature', label: 'Funktion fehlt' },
  { key: 'no_response', label: 'Funkstille' },
] as const

export const WON_REASONS = [
  { key: 'product', label: 'Produkt / Funktionen' },
  { key: 'price', label: 'Preis' },
  { key: 'relationship', label: 'Beziehung / Vertrauen' },
  { key: 'speed', label: 'Schnelle Umsetzung' },
  { key: 'referral', label: 'Empfehlung / Referenz' },
] as const

export function closeReasonLabel(stage: string | null, key: string | null) {
  if (!key) return null
  const list: readonly { key: string; label: string }[] = stage === 'won' ? WON_REASONS : LOST_REASONS
  return list.find(r => r.key === key)?.label ?? key
}

export const QUALI_CRITERIA = [
  { key: 'pain', label: 'Pain / Bedarf', hint: 'Gibt es ein konkretes Recruiting-Problem?' },
  { key: 'budget', label: 'Budget', hint: 'Gibt es eine Budget-Indikation?' },
  { key: 'decision_maker', label: 'Entscheider', hint: 'Kennen wir den Economic Buyer?' },
  { key: 'timing', label: 'Timing / Trigger', hint: 'Gibt es einen Anlass oder Zeitpunkt?' },
  { key: 'champion', label: 'Champion', hint: 'Treibt jemand das Thema intern für uns?' },
] as const

export type QualiKey = typeof QUALI_CRITERIA[number]['key']
export type QualiStatus = 'yes' | 'unknown' | 'no'
export type Qualification = Partial<Record<QualiKey, { status: QualiStatus; note?: string | null }>>

export function qualiScore(q: Qualification | null | undefined) {
  return QUALI_CRITERIA.filter(c => q?.[c.key]?.status === 'yes').length
}

// Only known keys and values survive (input comes from the browser / the model)
export function cleanQualification(input: unknown): Qualification {
  const out: Qualification = {}
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  for (const c of QUALI_CRITERIA) {
    const v = src[c.key]
    if (!v || !['yes', 'unknown', 'no'].includes(v.status)) continue
    const note = typeof v.note === 'string' ? v.note.trim().slice(0, 300) : ''
    out[c.key] = { status: v.status, note: note || null }
  }
  return out
}
