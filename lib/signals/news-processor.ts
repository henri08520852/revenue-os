import type { SupabaseClient } from '@supabase/supabase-js'
import type { Observation } from '@/lib/connectors/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalRule {
  id: string
  project_id: string | null   // null = global default
  observation_type: string
  match_field: string
  match_keywords: string[]    // empty array = wildcard (catch-all)
  signal_type: string
  strength: number
  confidence: number
  expires_days: number
  priority: number
}

// ---------------------------------------------------------------------------
// Rule loader  (cached per invocation — no cross-request caching needed)
// ---------------------------------------------------------------------------

async function loadRules(
  supabase: SupabaseClient,
  projectId: string,
  observationType: string,
): Promise<SignalRule[]> {
  // Load global rules (project_id IS NULL) and project-specific rules separately
  // (avoids PostgREST .or() null-check issues)
  const [{ data: globalData, error: e1 }, { data: projData, error: e2 }] = await Promise.all([
    supabase.from('signal_rules').select('*')
      .eq('observation_type', observationType).eq('enabled', true).is('project_id', null)
      .order('priority', { ascending: false }),
    supabase.from('signal_rules').select('*')
      .eq('observation_type', observationType).eq('enabled', true).eq('project_id', projectId)
      .order('priority', { ascending: false }),
  ])

  if (e1) console.error('[news-processor] failed to load global rules:', e1.message)
  if (e2) console.error('[news-processor] failed to load project rules:', e2.message)

  const projectRules = projData ?? []
  const globalRules = globalData ?? []

  const overriddenTypes = new Set(projectRules.map((r: SignalRule) => r.signal_type))
  const effectiveGlobals = globalRules.filter((r: SignalRule) => !overriddenTypes.has(r.signal_type))

  // Merge and re-sort by priority desc
  return [...projectRules, ...effectiveGlobals].sort((a, b) => b.priority - a.priority)
}

// ---------------------------------------------------------------------------
// Rule matcher  — returns first matching rule for the observation
// ---------------------------------------------------------------------------

function matchRule(observation: Observation, rules: SignalRule[]): SignalRule | null {
  for (const rule of rules) {
    // Resolve the field to inspect
    let fieldValue = ''
    if (rule.match_field === 'value_text') {
      fieldValue = (observation.value_text ?? '').toLowerCase()
    } else if (rule.match_field === 'source_url') {
      fieldValue = (observation.source_url ?? '').toLowerCase()
    } else if (rule.match_field.startsWith('value_json.')) {
      const key = rule.match_field.replace('value_json.', '')
      const json = observation.value_json as Record<string, unknown> | null
      fieldValue = String(json?.[key] ?? '').toLowerCase()
    } else {
      fieldValue = (observation.value_text ?? '').toLowerCase()
    }

    // Empty keywords = wildcard (catch-all rule)
    if (rule.match_keywords.length === 0) return rule

    // Any keyword match → rule fires
    if (rule.match_keywords.some((kw) => fieldValue.includes(kw.toLowerCase()))) {
      return rule
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

export async function processNewsObservations(
  supabase: SupabaseClient,
  projectId: string,
  companyId: string,
  dataSourceId: string,
  observations: Observation[],
): Promise<{ signalsCreated: number; observationsSaved: number }> {
  const newsObs = observations.filter((o) => o.observation_type === 'news_mention')
  if (newsObs.length === 0) return { signalsCreated: 0, observationsSaved: 0 }

  // ── 1. Load rules from DB ────────────────────────────────────────────────
  const rules = await loadRules(supabase, projectId, 'news_mention')
  if (rules.length === 0) {
    console.warn('[news-processor] No signal_rules found for news_mention — skipping signal generation')
  }

  // ── 2. Deduplicate by content_hash ───────────────────────────────────────
  const hashes = newsObs.map((o) => o.content_hash).filter(Boolean)

  const { data: existing } = await supabase
    .from('observations')
    .select('content_hash')
    .eq('project_id', projectId)
    .eq('company_id', companyId)
    .in('content_hash', hashes)

  const seenHashes = new Set((existing ?? []).map((r: { content_hash: string }) => r.content_hash))
  const newObs = newsObs.filter((o) => o.content_hash && !seenHashes.has(o.content_hash))

  if (newObs.length === 0) return { signalsCreated: 0, observationsSaved: 0 }

  // ── 3. Insert new observations ───────────────────────────────────────────
  const obsRows = newObs.map((o) => ({
    project_id: projectId,
    company_id: companyId,
    data_source_id: dataSourceId,
    observation_type: o.observation_type,
    metric_name: o.metric_name,
    value_text: o.value_text ?? null,
    value_json: o.value_json ?? null,
    source_url: o.source_url ?? null,
    content_hash: o.content_hash ?? null,
    observed_at: o.observed_at ?? new Date().toISOString(),
    confidence: o.confidence ?? 85,
  }))
  await supabase.from('observations').insert(obsRows)

  // ── 4. Classify + create signals ─────────────────────────────────────────
  if (rules.length === 0) return { signalsCreated: 0, observationsSaved: newObs.length }

  const signalRows = newObs.flatMap((o) => {
    const rule = matchRule(o, rules)
    if (!rule) return []

    const title = (o.value_text ?? '') as string
    const meta = o.value_json as Record<string, string> | null
    const observedAt = o.observed_at ?? new Date().toISOString()

    const expiresAt = new Date(observedAt)
    expiresAt.setDate(expiresAt.getDate() + rule.expires_days)

    return [{
      project_id: projectId,
      company_id: companyId,
      signal_type: rule.signal_type,
      strength: rule.strength,
      confidence: rule.confidence,
      reason: 'News: ' + title.slice(0, 120),
      evidence: {
        title,
        link: meta?.link ?? o.source_url,
        published: meta?.published,
        source: meta?.source,
        rule_id: rule.id,
      },
      detected_at: observedAt,
      detected_date: observedAt.slice(0, 10),
      expires_at: expiresAt.toISOString(),
      status: 'active',
    }]
  })

  let signalsCreated = 0
  if (signalRows.length > 0) {
    const { data: inserted, error: sigErr } = await supabase
      .from('signals')
      .insert(signalRows)
      .select('id')

    if (sigErr) console.error('[news-processor] signal insert error:', sigErr.message)
    signalsCreated = inserted?.length ?? 0
  }

  // ── 5. Update company last_signal_at ─────────────────────────────────────
  if (signalsCreated > 0) {
    await supabase
      .from('companies')
      .update({ last_signal_at: new Date().toISOString() })
      .eq('id', companyId)
      .eq('project_id', projectId)
  }

  return { signalsCreated, observationsSaved: newObs.length }
}
