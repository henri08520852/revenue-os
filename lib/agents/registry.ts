// Agents & workflows shown in the command center (/agents).
// Workflows are fixed rules (no AI, free, predictable); agents use the Claude API and cost a little per run.
// Everything that would leave the house (messages) lands in the approval queue first.

export type SequenceStep = { day: number; title: string; type: 'todo' | 'call' | 'email' | 'follow_up'; draft?: boolean; letter?: boolean }

// Tuned for "Heiße Firmen": no cold e-mail – LinkedIn first, phone via the switchboard, letter to the management
export const DEFAULT_STEPS: SequenceStep[] = [
  { day: 0, title: 'Ansprechpartner finden & auf LinkedIn vernetzen (HR + Geschäftsführung)', type: 'todo', draft: true },
  { day: 3, title: 'LinkedIn: Erste Nachricht senden (nach Annahme)', type: 'todo', draft: true },
  { day: 6, title: 'Anrufen (Zentrale → Personalabteilung)', type: 'call' },
  { day: 8, title: 'Brief an die Geschäftsführung senden', type: 'todo', letter: true },
  { day: 14, title: 'Nachfassen auf LinkedIn', type: 'follow_up' },
]

export const DEFAULT_PITCH = 'HireFlow (hireflow.one) ist ein KI-Prescreening fürs Recruiting: Bewerbende beantworten rollenbezogene Fragen, HireFlow strukturiert die Antworten, macht sie vergleichbar und zeigt vor dem ersten Gespräch, wer wirklich passt – z. B. aus 20 Bewerbungen die drei relevantesten Profile. So entstehen weniger Erstgespräche ohne Match. Gegründet von Henri und Simon, die selbst inhouse in Recruiting und HR gearbeitet haben.'

export const DEFAULT_OFFER = ''
export const DEFAULT_LINK = 'hireflow.one/business'
export const DEFAULT_STYLE = 'Kurz und auf Augenhöhe, nicht verkäuferisch. Ein Gedanke pro Absatz, einfache Wörter statt Fachjargon. Nicht mit „Ich“ beginnen. Nie „kein Sales Pitch“ schreiben. Abschluss: Link, dann eine offene Frage, wie sie es heute lösen.'

// Henri's messages that worked – the agent copies the style, not the wording
export const DEFAULT_EXAMPLES = `Hallo Tessa,

ich bin über deine Verantwortung für People und Recruiting bei CON-iNG gestolpert. Gerade bei Engineering- und Beratungsrollen kann die erste Qualifizierung schnell viel Zeit binden.

HireFlow strukturiert Kandidatenantworten rollenbezogen, macht sie vergleichbar und liefert vor dem ersten Gespräch konkrete Evidenz. So entstehen schneller belastbare Shortlists.

Ein kurzer Überblick: hireflow.one/business. Wie löst ihr die Vorauswahl aktuell?

Beste Grüße
Henri

---

Hi Lennard,

ich habe gesehen, dass ihr Unterstützung im Recruiting und in People Operations sucht. Da Recruiting noch nah am Gründungsteam liegt, bindet die erste Auswahl schnell wertvolle Zeit.

Mein Partner Simon und ich haben selbst inhouse in Recruiting und HR gearbeitet. Daraus ist HireFlow entstanden: ein Prescreening mit KI, das aus 20 Bewerbungen die drei relevantesten Profile herausfiltert, bevor ein Kalendertermin entsteht.

Schau gern rein: hireflow.one/business. Mich interessiert, wie ihr Prescreening aktuell löst.

Beste Grüße
Henri`

export const DEFAULT_LETTER = `{{anrede}},

{{anlass}}

{{absatz}}

Gern zeige ich Ihnen in 20 Minuten, wie das bei {{firma}} aussehen könnte – unverbindlich und ganz konkret an Ihren aktuellen Stellen. Ich melde mich dazu in den nächsten Tagen telefonisch bei Ihnen.`

export type LetterConfig = { sender: string; subject: string; template: string; closing: string; signer: string; signerTitle: string; contact: string }

export type AgentConfig = {
  first_message: { pitch: string; style: string; examples: string; address: 'auto' | 'Sie' | 'du'; autoDraft: boolean; offer: string; link: string }
  letter: LetterConfig
  sequence: { steps: SequenceStep[] }
  follow_up_guard: { days: number }
}

export type AgentKey = keyof AgentConfig

export const AGENTS: { key: AgentKey; kind: 'agent' | 'workflow'; label: string; description: string; when: string }[] = [
  {
    key: 'first_message', kind: 'agent', label: 'Erstnachricht',
    description: 'Recherchiert Firma und Kontakt (Website, offene Stellen, Signale) und schreibt eine Vernetzungsnotiz und eine erste LinkedIn-Nachricht. Entwürfe landen in den Freigaben – verschickt wird nichts automatisch.',
    when: 'Neuer Lead aus LinkedIn oder Heiße Firmen · täglich für Leads in Ansprache ohne Entwurf',
  },
  {
    key: 'letter', kind: 'agent', label: 'Brief',
    description: 'Füllt eure Brief-Vorlage für eine Firma aus: Anschrift aus dem Impressum, Ansprechpartner aus der Geschäftsführung und ein Absatz zum konkreten Anlass. Ergebnis ist ein druckfertiger Brief (DIN 5008) zum Prüfen.',
    when: 'Schritt „Brief“ in der Akquise-Abfolge · auf Knopfdruck bei einer Company',
  },
  {
    key: 'sequence', kind: 'workflow', label: 'Akquise-Abfolge',
    description: 'Legt für neue Leads Schritt für Schritt Aufgaben an: Ansprechpartner finden und vernetzen, Nachricht, Anruf, Brief, nachfassen. Der nächste Schritt kommt, sobald der vorige erledigt ist. Stoppt automatisch bei Antwort oder wenn der Lead weiterrückt.',
    when: 'Neuer Lead in „Ansprache“ · Aufgabe erledigt · täglich',
  },
  {
    key: 'follow_up_guard', kind: 'workflow', label: 'Follow-up-Wächter',
    description: 'Findet offene Leads und Deals ohne Aktivität und ohne offene Aufgabe und legt dem Zuständigen eine Nachfass-Aufgabe an.',
    when: 'Täglich morgens',
  },
]

export const DEFAULTS: AgentConfig = {
  first_message: { pitch: DEFAULT_PITCH, style: DEFAULT_STYLE, examples: DEFAULT_EXAMPLES, address: 'auto', autoDraft: true, offer: DEFAULT_OFFER, link: DEFAULT_LINK },
  letter: { sender: 'HireFlow\nStraße Hausnummer\nPLZ Ort', subject: 'Ihre offenen Stellen – eine Idee für {{firma}}', template: DEFAULT_LETTER, closing: 'Mit freundlichen Grüßen', signer: '', signerTitle: '', contact: '' },
  sequence: { steps: DEFAULT_STEPS },
  follow_up_guard: { days: 7 },
}

export type AgentSettings = { [K in AgentKey]: { enabled: boolean; config: AgentConfig[K] } }

export async function loadSettings(supabase: any, projectId: string): Promise<AgentSettings> {
  const { data } = await supabase.from('automation_settings').select('agent_key, enabled, config').eq('project_id', projectId)
  const out = {} as AgentSettings
  for (const a of AGENTS) {
    const row = (data || []).find((r: any) => r.agent_key === a.key)
    ;(out as any)[a.key] = { enabled: row ? row.enabled : true, config: { ...DEFAULTS[a.key], ...(row?.config || {}) } }
  }
  const steps = out.sequence.config.steps
  if (!Array.isArray(steps) || !steps.length) out.sequence.config.steps = DEFAULT_STEPS
  return out
}

// ---------- run log ----------

export async function startRun(supabase: any, projectId: string, key: AgentKey, trigger: 'manual' | 'cron' | 'event') {
  const { data } = await supabase.from('automation_runs').insert({ project_id: projectId, agent_key: key, trigger }).select('id').single()
  return (data?.id as string) ?? null
}

export async function finishRun(supabase: any, runId: string | null, r: { status?: 'ok' | 'error' | 'skipped'; items?: number; summary?: string; error?: string; costUsd?: number }) {
  if (!runId) return
  await supabase.from('automation_runs').update({
    status: r.status ?? (r.error ? 'error' : 'ok'), items: r.items ?? 0, summary: r.summary ?? null,
    error: r.error ?? null, cost_usd: Math.round((r.costUsd ?? 0) * 100000) / 100000, finished_at: new Date().toISOString(),
  }).eq('id', runId)
}
