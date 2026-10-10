// Agents & workflows shown in the command center (/agents).
// Workflows are fixed rules (no AI, free, predictable); agents use the Claude API and cost a little per run.
// Everything that would leave the house (messages) lands in the approval queue first.

export type SequenceStep = { day: number; title: string; type: 'todo' | 'call' | 'email' | 'follow_up'; draft?: boolean }

export const DEFAULT_STEPS: SequenceStep[] = [
  { day: 0, title: 'LinkedIn: Vernetzungsanfrage senden', type: 'todo', draft: true },
  { day: 2, title: 'LinkedIn: Erste Nachricht senden', type: 'todo', draft: true },
  { day: 5, title: 'Anrufen', type: 'call' },
  { day: 10, title: 'Nachfassen (LinkedIn oder Telefon)', type: 'follow_up' },
]

export const DEFAULT_PITCH = 'HireFlow ist eine Recruiting-Software für Unternehmen im DACH-Raum: Stellenanzeigen, Bewerbermanagement und automatisches Vorab-Screening per Fragen – damit HR-Teams auch bei vielen Bewerbungen schnell die passenden Kandidaten finden.'

export type AgentConfig = {
  first_message: { pitch: string; style: string; examples: string; address: 'Sie' | 'du'; autoDraft: boolean }
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
    key: 'sequence', kind: 'workflow', label: 'Akquise-Abfolge',
    description: 'Legt für neue Leads Schritt für Schritt Aufgaben an: vernetzen, Nachricht, Anruf, nachfassen. Der nächste Schritt kommt, sobald der vorige erledigt ist. Stoppt automatisch bei Antwort oder wenn der Lead weiterrückt.',
    when: 'Neuer Lead in „Ansprache“ · Aufgabe erledigt · täglich',
  },
  {
    key: 'follow_up_guard', kind: 'workflow', label: 'Follow-up-Wächter',
    description: 'Findet offene Leads und Deals ohne Aktivität und ohne offene Aufgabe und legt dem Zuständigen eine Nachfass-Aufgabe an.',
    when: 'Täglich morgens',
  },
]

export const DEFAULTS: AgentConfig = {
  first_message: { pitch: DEFAULT_PITCH, style: '', examples: '', address: 'Sie', autoDraft: true },
  sequence: { steps: DEFAULT_STEPS },
  follow_up_guard: { days: 7 },
}

export type AgentSettings = { [K in AgentKey]: { enabled: boolean; config: AgentConfig[K] } }

export async function loadSettings(supabase: any, projectId: string): Promise<AgentSettings> {
  const { data } = await supabase.from('agent_settings').select('agent_key, enabled, config').eq('project_id', projectId)
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
  const { data } = await supabase.from('agent_runs').insert({ project_id: projectId, agent_key: key, trigger }).select('id').single()
  return (data?.id as string) ?? null
}

export async function finishRun(supabase: any, runId: string | null, r: { status?: 'ok' | 'error' | 'skipped'; items?: number; summary?: string; error?: string; costUsd?: number }) {
  if (!runId) return
  await supabase.from('agent_runs').update({
    status: r.status ?? (r.error ? 'error' : 'ok'), items: r.items ?? 0, summary: r.summary ?? null,
    error: r.error ?? null, cost_usd: Math.round((r.costUsd ?? 0) * 100000) / 100000, finished_at: new Date().toISOString(),
  }).eq('id', runId)
}
