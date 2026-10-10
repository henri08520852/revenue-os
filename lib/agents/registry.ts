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

export const DEFAULT_PITCH = 'HireFlow ist eine Recruiting-Software für Unternehmen im DACH-Raum: Stellenanzeigen, Bewerbermanagement und automatisches Vorab-Screening per Fragen – damit HR-Teams auch bei vielen Bewerbungen schnell die passenden Kandidaten finden.'

export const DEFAULT_OFFER = 'einen kostenlosen Kurz-Check ihrer aktuellen Stellenanzeigen (was auffällt, wo Bewerbende abspringen)'

export const DEFAULT_LETTER = `{{anrede}},

{{anlass}}

{{absatz}}

Gern zeige ich Ihnen in 20 Minuten, wie das bei {{firma}} aussehen könnte – unverbindlich und ganz konkret an Ihren aktuellen Stellen. Ich melde mich dazu in den nächsten Tagen telefonisch bei Ihnen.`

export type LetterConfig = { sender: string; subject: string; template: string; closing: string; signer: string; signerTitle: string; contact: string }

export type AgentConfig = {
  first_message: { pitch: string; style: string; examples: string; address: 'Sie' | 'du'; autoDraft: boolean; offer: string }
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
  first_message: { pitch: DEFAULT_PITCH, style: '', examples: '', address: 'Sie', autoDraft: true, offer: DEFAULT_OFFER },
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
