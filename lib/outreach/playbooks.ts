// Playbooks: per persona the angle (pain → outcome → closing question) and 2–3 variants we test.
// The first-message agent picks persona + strongest signal + least used variant; the AI writes the words.
import type { Persona } from './persona'

export type PlaybookVariant = { key: string; angle: string }
export type Playbook = {
  key: string; name: string; personas: Persona[]
  pain: string; outcome: string; question: string
  address: 'auto' | 'du' | 'Sie'
  variants: PlaybookVariant[]; active: boolean
}

export const DEFAULT_PLAYBOOKS: Playbook[] = [
  {
    key: 'gf_small', name: 'GF / Inhaber, kleine Firma', personas: ['gf_small'], address: 'auto', active: true,
    pain: 'Recruiting läuft beim Chef nebenbei, Abende gehen für Bewerbungen und Telefonate drauf.',
    outcome: 'Nur noch mit den drei Leuten sprechen, die wirklich passen.',
    question: 'Wie die Vorauswahl gerade läuft – alles selbst am Telefon?',
    variants: [
      { key: 'A', angle: 'Zeit des Inhabers: wer macht das Recruiting neben dem Tagesgeschäft.' },
      { key: 'B', angle: 'Tempo: gute Bewerber:innen sind nach ein paar Tagen weg, ein sofortiges erstes Gespräch hält sie.' },
    ],
  },
  {
    key: 'gf_mid', name: 'Geschäftsführung, Mittelstand', personas: ['gf_mid'], address: 'auto', active: true,
    pain: 'Offene Stellen bremsen Aufträge und Wachstum, mehr HR-Personal ist teuer.',
    outcome: 'Stellen schneller besetzen, ohne zusätzliche Leute im Personalbereich.',
    question: 'Wer bei ihnen heute die Erstgespräche führt und wie lange es bis zur Zusage dauert.',
    variants: [
      { key: 'A', angle: 'Wachstum: unbesetzte Stellen kosten Umsatz.' },
      { key: 'B', angle: 'Entlastung: das Team im Personalbereich schafft das Volumen kaum.' },
    ],
  },
  {
    key: 'hr_lead', name: 'HR-Leitung', personas: ['hr_lead'], address: 'auto', active: true,
    pain: 'Viele Stellen parallel, Fachbereiche drängeln, Bewerbungen sind schwer vergleichbar.',
    outcome: 'Strukturierte, vergleichbare Vorauswahl für alle Stellen gleichzeitig.',
    question: 'Wo die Vorauswahl aktuell am meisten Zeit kostet.',
    variants: [
      { key: 'A', angle: 'Volumen: viele Stellen gleichzeitig, wenig Zeit pro Bewerbung.' },
      { key: 'B', angle: 'Vergleichbarkeit: Fachbereiche bekommen eine klare Auswahl statt eines Stapels.' },
      { key: 'C', angle: 'Kandidatenerlebnis: jede Bewerbung bekommt sofort eine Rückmeldung und ein erstes Gespräch.' },
    ],
  },
  {
    key: 'recruiter', name: 'Recruiter / TA', personas: ['recruiter'], address: 'du', active: true,
    pain: 'Telefon-Screenings und Terminabstimmung fressen den Tag.',
    outcome: 'Vorinterviews laufen rund um die Uhr, ohne Terminsuche.',
    question: 'Wie viele Erstgespräche pro Woche gerade anfallen.',
    variants: [
      { key: 'A', angle: 'Gründergeschichte: wir kommen selbst aus dem In-house-Recruiting und kennen das Screening-Volumen.' },
      { key: 'B', angle: 'Kalender: kein Ping-Pong mehr für 15-Minuten-Telefonate.' },
    ],
  },
  {
    key: 'hiring_manager', name: 'Fachbereichsleitung', personas: ['hiring_manager'], address: 'auto', active: true,
    pain: 'Das Team arbeitet unterbesetzt, passende Leute sind schnell wieder weg.',
    outcome: 'Nur Kandidat:innen sehen, die fachlich passen – am Tag nach der Bewerbung.',
    question: 'Wie schnell es heute von der Bewerbung bis zum ersten Gespräch geht.',
    variants: [
      { key: 'A', angle: 'Tempo bis zum ersten Gespräch.' },
      { key: 'B', angle: 'Fachliche Passung statt Lebenslauf-Stapel.' },
    ],
  },
  {
    key: 'agency_owner', name: 'Agentur-Inhaber', personas: ['agency_owner'], address: 'du', active: true,
    pain: 'Wer die Shortlist zuerst beim Kunden hat, gewinnt das Mandat.',
    outcome: 'Mehr Mandate pro Recruiter:in, weil die ersten Interviews und Profile automatisch laufen.',
    question: 'Wo zwischen Bewerbung und Kundenvorstellung die meiste Zeit verloren geht.',
    variants: [
      { key: 'A', angle: 'Tempo bis zur Shortlist beim Kunden.' },
      { key: 'B', angle: 'Marge: mehr Vermittlungen pro Kopf.' },
    ],
  },
  {
    key: 'agency_recruiter', name: 'Agentur-Recruiter', personas: ['agency_recruiter'], address: 'du', active: true,
    pain: 'Interviews führen, Notizen tippen, Kandidatenprofile für den Kunden bauen.',
    outcome: 'Fertiges Kandidatenprofil direkt nach dem Interview.',
    question: 'Wie lange ein Profil für den Kunden heute dauert.',
    variants: [
      { key: 'A', angle: 'Notizen und Profile schreiben sich selbst.' },
      { key: 'B', angle: 'Mehr Interviews pro Tag ohne Überstunden.' },
    ],
  },
  {
    key: 'general', name: 'Allgemein (Rolle unklar)', personas: ['other'], address: 'auto', active: true,
    pain: 'Bewerbungen kommen rein, aber vieles passt nicht und die Vorauswahl kostet Zeit.',
    outcome: 'Aus 20 Bewerbungen die drei relevantesten.',
    question: 'Wer bei ihnen die Vorauswahl macht und ob das gerade ein Thema ist.',
    variants: [{ key: 'A', angle: 'Vorauswahl entlasten.' }],
  },
]

// Saved playbooks (settings) merged over the defaults, so new defaults appear automatically
export function mergePlaybooks(saved: unknown): Playbook[] {
  const list = Array.isArray(saved) ? (saved as Playbook[]) : []
  const byKey = new Map(list.filter(p => p?.key).map(p => [p.key, p]))
  const merged = DEFAULT_PLAYBOOKS.map(d => ({ ...d, ...(byKey.get(d.key) || {}) }))
  for (const p of list) if (p?.key && !DEFAULT_PLAYBOOKS.some(d => d.key === p.key)) merged.push(p)
  return merged.map(p => ({ ...p, variants: Array.isArray(p.variants) && p.variants.length ? p.variants : [{ key: 'A', angle: '' }] }))
}

export function playbookFor(playbooks: Playbook[], persona: Persona): Playbook {
  const active = playbooks.filter(p => p.active)
  return active.find(p => p.personas?.includes(persona))
    || active.find(p => p.key === 'general')
    || active[0] || DEFAULT_PLAYBOOKS[DEFAULT_PLAYBOOKS.length - 1]
}

// Least used variant so far (ties → first)
export function pickVariant(pb: Playbook, used: Record<string, number>): PlaybookVariant {
  return pb.variants.slice().sort((a, b) => (used[a.key] ?? 0) - (used[b.key] ?? 0))[0]
}

// ---------- signals: why now ----------

export type SignalKey = 'personal' | 'repeated_role' | 'builds_recruiting' | 'long_open' | 'new_jobs' | 'many_jobs' | 'news' | 'history' | 'none' | 'reposted' | 'no_hr' | 'volume'

export const SIGNALS: Record<SignalKey, string> = {
  personal: 'Persönlicher Bezug',
  repeated_role: 'Rolle mehrfach gesucht',
  builds_recruiting: 'Baut Recruiting auf',
  long_open: 'Stelle lange offen',
  new_jobs: 'Viele neue Stellen',
  many_jobs: 'Viele offene Stellen',
  news: 'News / Expansion',
  history: 'Bisheriger Kontakt',
  none: 'Kein Signal (Branche)',
  reposted: 'Stelle erneut ausgeschrieben',
  no_hr: 'Kein HR – Leitung macht es selbst',
  volume: 'Volumen-Rollen',
}

export type Signal = { key: SignalKey; text: string }

export type SignalFacts = {
  hiring?: { open?: number; new14?: number; repeated?: { role: string; count: number }[]; hrRoles?: string[] } | null
  jobs?: { title?: string; published_at?: string; first_seen_at?: string }[]
  signalReasons?: { reason: string; created_at: string; type?: string }[]
  hasHistory?: boolean
  personal?: string | null
}

// Strongest fresh signal first
export function pickSignal(f: SignalFacts): Signal {
  const h = f.hiring
  if (f.personal) return { key: 'personal', text: `Persönlicher Bezug vom Team (bevorzugt als Anlass nutzen): ${f.personal}` }
  if (f.hasHistory) return { key: 'history', text: 'Es gab schon Kontakt – daran anknüpfen statt neu vorstellen.' }
  if (h?.repeated?.length) return { key: 'repeated_role', text: `Sucht ${h.repeated[0].count}× ${h.repeated[0].role} gleichzeitig.` }
  if (h?.hrRoles?.length) return { key: 'builds_recruiting', text: `Sucht selbst Verstärkung im HR/Recruiting (${h.hrRoles[0]}) – das Volumen zieht an.` }
  const old = (f.jobs || []).map(j => ({ t: j.title, d: Date.parse(j.published_at || j.first_seen_at || '') }))
    .filter(j => j.t && Number.isFinite(j.d) && Date.now() - j.d > 45 * 86400000).sort((a, b) => a.d - b.d)[0]
  if (old) return { key: 'long_open', text: `Die Stelle „${old.t}“ ist seit über ${Math.floor((Date.now() - old.d) / (30 * 86400000)) || 1} Monat(en) ausgeschrieben.` }
  if ((h?.new14 ?? 0) >= 3) return { key: 'new_jobs', text: `${h!.new14} neue Stellen in den letzten 14 Tagen.` }
  if ((h?.open ?? 0) >= 5) return { key: 'many_jobs', text: `${h!.open} offene Stellen gleichzeitig.` }
  const news = (f.signalReasons || []).find(s => s.type !== 'hiring_pressure' && Date.now() - Date.parse(s.created_at) < 60 * 86400000)
  if (news) return { key: 'news', text: news.reason }
  return { key: 'none', text: 'Kein konkretes Signal – Branche oder Website als Aufhänger nutzen, nichts erfinden.' }
}

// ---------- personalisation score ----------

const FLOSKEL = /ich hoffe,? (es geht|diese nachricht)|innovative lösung|revolution|game[- ]?changer|kein sales ?pitch|synergie|ich wollte mich (kurz )?vorstellen|zögern sie nicht|hätten sie 15 minuten/i

// 0–100: concrete fact, real role/number, name, length, no filler. < 60 = generic.
export function personalizationScore(message: string, opts: { signal: SignalKey; firstName?: string | null; facts: string[] }): number {
  const m = message || ''
  const body = m.replace(/\n*Beste Grüße[\s\S]*$/, '')
  let s = 0
  if (opts.signal !== 'none') s += 35
  const lower = m.toLowerCase()
  if (opts.facts.some(f => f && f.length >= 4 && lower.includes(f.toLowerCase()))) s += 25
  else if (/\d/.test(body)) s += 10
  if (opts.firstName && m.includes(opts.firstName)) s += 10
  if (body.length >= 250 && body.length <= 650) s += 15
  if (!FLOSKEL.test(m)) s += 15
  return Math.min(100, s)
}
