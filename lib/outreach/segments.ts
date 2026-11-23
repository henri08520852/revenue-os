// Segments (company size / agency) and industry building blocks.
// Each segment has its own base text; the industry adds the problem that is typical for that sector.
import { sizeBucket } from './persona'

export type SegmentKey = 'small' | 'mid' | 'large' | 'agency'

export const SEGMENTS: Record<SegmentKey, string> = {
  small: 'Kleine Firma (unter 50)',
  mid: 'Mittelstand (50–999)',
  large: 'Großunternehmen (ab 1000)',
  agency: 'Personalvermittlung / Agentur',
}

// Size from the employee count; without it the number of open jobs is a rough hint
export function segmentFor(isAgency: boolean, size: unknown, openJobs?: number | null): SegmentKey {
  if (isAgency) return 'agency'
  const b = sizeBucket(size)
  if (b === '1-49') return 'small'
  if (b === '1000+') return 'large'
  if (b === '50-249' || b === '250-999') return 'mid'
  if ((openJobs ?? 0) >= 50) return 'large'
  return 'mid'
}

const SIGN = `Beste Grüße
{{absender}}`

export const DEFAULT_BASE_TEXTS: Record<SegmentKey, string> = {
  small: `{{anrede}}

{{anlass}} {{schmerz}}

Simon und ich haben selbst inhouse im Recruiting gearbeitet und wissen, wie viel Zeit die Vorauswahl frisst, wenn sie nebenbei läuft. Mit HireFlow: {{ergebnis}}

Schau gern rein: hireflow.one/business. {{frage}}

${SIGN}`,
  mid: `{{anrede}}

{{anlass}} {{schmerz}}

Mein Partner Simon und ich haben selbst inhouse in Recruiting und HR gearbeitet. Daraus ist HireFlow entstanden: {{ergebnis}}

Schau gern rein: hireflow.one/business. {{frage}}

${SIGN}`,
  large: `{{anrede}}

{{anlass}} {{schmerz}}

HireFlow setzt vor dem ersten Gespräch an: {{ergebnis}} Das sorgt für eine einheitliche, vergleichbare Vorauswahl über Standorte und Teams hinweg.

Einen Überblick gibt es unter hireflow.one/business. {{frage}}

${SIGN}`,
  agency: `{{anrede}}

{{anlass}} {{schmerz}}

Mit HireFlow werten Agenturen Interviews und Kandidatenantworten automatisch aus, vergleichen Kandidaten strukturiert und haben die wichtigsten Punkte direkt für die Kundenvorstellung parat. {{ergebnis}}

{{frage}}

${SIGN}`,
}

export type IndustryBlock = { key: string; label: string; pain: string; active: boolean }

// Keys match lib/discovery/industry.ts (classification of company name + job titles)
export const DEFAULT_INDUSTRIES: IndustryBlock[] = [
  { key: 'industry', label: 'Industrie & Produktion', active: true, pain: 'Fachkräfte wie Mechatroniker:innen oder Elektroniker:innen bewerben sich oft ohne vollständige Unterlagen und haben mehrere Angebote; Meister und Schichtleitungen müssen die Gespräche neben der Produktion führen.' },
  { key: 'construction', label: 'Handwerk & Bau', active: true, pain: 'Bewerbungen kommen per Telefon oder Mail, der Chef oder die Bauleitung prüft sie abends nebenbei; tagsüber ist niemand für Rückrufe da.' },
  { key: 'health', label: 'Gesundheit & Pflege', active: true, pain: 'Pflegekräfte haben viele Angebote, wer zuerst antwortet, gewinnt; Gespräche lassen sich im Schichtdienst schwer terminieren.' },
  { key: 'logistics', label: 'Logistik & Transport', active: true, pain: 'Hohes Bewerbungsvolumen für Fahrer und Lager, aber viele passen bei Führerschein, Schichtbereitschaft oder Verfügbarkeit nicht.' },
  { key: 'it', label: 'IT & Software', active: true, pain: 'Entwickler:innen bewerben sich parallel bei vielen Firmen, und die technische Vorqualifizierung bindet Zeit von Leuten, die eigentlich entwickeln sollen.' },
  { key: 'consulting', label: 'Beratung & Dienstleistung', active: true, pain: 'Die Qualifizierung von Berater:innen kostet Zeit von Senior-Leuten, die eigentlich beim Kunden abrechenbar sind.' },
  { key: 'finance', label: 'Finanzen & Versicherung', active: true, pain: 'Viele formal passende Bewerbungen, die Unterschiede liegen in Erfahrung und Arbeitsweise und zeigen sich erst im Gespräch.' },
  { key: 'retail', label: 'Handel & E-Commerce', active: true, pain: 'Viele Stellen mit hoher Fluktuation und saisonalen Spitzen, die schnell besetzt werden müssen.' },
  { key: 'hospitality', label: 'Gastronomie & Hotel', active: true, pain: 'Hohe Fluktuation und kurzfristiger Bedarf, Bewerber:innen springen ab, wenn die Rückmeldung länger als ein paar Tage dauert.' },
  { key: 'automotive', label: 'Automobil & Autohaus', active: true, pain: 'Werkstatt- und Servicekräfte sind knapp, und die Vorauswahl läuft beim Werkstatt- oder Serviceleiter nebenbei.' },
  { key: 'education', label: 'Bildung & Soziales', active: true, pain: 'Fachkräfte sind knapp, Leitungen führen Gespräche neben dem Betrieb, und Bewerber:innen erwarten eine schnelle, persönliche Rückmeldung.' },
  { key: 'energy', label: 'Energie & Umwelt', active: true, pain: 'Starkes Wachstum, technische Fachkräfte sind knapp, und neue Teams müssen schnell aufgebaut werden.' },
  { key: 'media', label: 'Medien & Marketing', active: true, pain: 'Viele Bewerbungen auf kreative Rollen, die Qualität zeigt sich erst bei genauerem Hinsehen.' },
]

export function mergeIndustries(saved: unknown): IndustryBlock[] {
  const list = Array.isArray(saved) ? (saved as IndustryBlock[]) : []
  return DEFAULT_INDUSTRIES.map(d => ({ ...d, ...(list.find(x => x?.key === d.key) || {}) }))
}

export function mergeBaseTexts(saved: unknown, legacy?: unknown): Record<SegmentKey, string> {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<SegmentKey, string>>
  const out = { ...DEFAULT_BASE_TEXTS }
  for (const k of Object.keys(out) as SegmentKey[]) if (typeof s[k] === 'string' && s[k]!.trim()) out[k] = s[k]!
  // Single base text from before segments existed → Mittelstand
  if (!s.mid && typeof legacy === 'string' && legacy.trim()) out.mid = legacy
  return out
}
