// NBA Engine — Next Best Action, purely deterministic
// Converts signals + opportunities + relationships into ranked, time-budgeted actions
// NO LLM calls — all rules in code. Claude is called later for enrichment only.
//
// Rule priority:
//   1. Deal momentum (active_deal with overdue next step) — revenue protection
//   2. Hot signals on warm/hot accounts — revenue creation
//   3. Relationship leverage (warm intro possible) — efficiency multiplier
//   4. Pipeline hygiene (stale deals, missing champions) — health
//   5. Market presence (event prep, content triggers) — long game

interface NbaContext {
  projectId: string
  minutesAvailable?: number   // Time budget for today. Default: 30
}

interface GeneratedAction {
  company_id: string
  opportunity_id?: string
  person_id?: string
  action_type: string
  priority: number             // 1-5 (1 = highest)
  estimated_minutes: number
  reason: {
    why_account: string
    why_now: string
    why_person: string
    why_channel: string
    why_action: string
  }
  suggested_message?: string  // Pre-written opener (no LLM, template-based)
  signal_ids: string[]
  expires_at: string
}

const DEFAULT_MINUTES = 30

// Action time estimates (minutes)
const ACTION_DURATIONS: Record<string, number> = {
  linkedin_message:     5,
  email:               10,
  call:                20,
  linkedin_comment:     3,
  intro_request:       10,
  meeting_prep:        15,
  follow_up:           10,
  update_crm:           5,
  manual_research:     20,
  wait:                 0,
}

export async function generateActions(
  supabase: any,
  { projectId, minutesAvailable = DEFAULT_MINUTES }: NbaContext,
): Promise<number> {
  const actions: GeneratedAction[] = []
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() // 24h

  // ── Load active signals ────────────────────────────────────────────────────
  const { data: signals } = await supabase
    .from('signals')
    .select('*, companies(id, name, domain, account_status, icp_score, account_score)')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('strength', { ascending: false })

  if (!signals || signals.length === 0) return 0

  // ── Load overdue opportunities ─────────────────────────────────────────────
  const { data: overdueOpps } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, account_status)')
    .eq('project_id', projectId)
    .in('stage', ['discovery', 'evaluation', 'proposal', 'negotiation'])
    .lt('next_step_due_at', now.toISOString())

  // ── Load intro-possible relationships ─────────────────────────────────────
  const { data: introRels } = await supabase
    .from('relationships')
    .select('*, target_person:people!target_person_id(id, first_name, last_name, company_id)')
    .eq('relationship_type', 'intro_possible')

  const introCompanyIds = new Set(
    (introRels || []).map((r: any) => r.target_person?.company_id).filter(Boolean)
  )

  // ── Rule 1: Overdue deal next steps ───────────────────────────────────────
  for (const opp of (overdueOpps || [])) {
    const company = opp.companies
    const daysOverdue = Math.floor(
      (now.getTime() - new Date(opp.next_step_due_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    actions.push({
      company_id: company.id,
      opportunity_id: opp.id,
      action_type: daysOverdue > 3 ? 'call' : 'follow_up',
      priority: 1,
      estimated_minutes: daysOverdue > 3 ? 20 : 10,
      reason: {
        why_account: `Active deal — ${opp.stage} stage, €${opp.value_eur || '?'} value`,
        why_now: `Next step overdue by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} — deal momentum at risk`,
        why_person: opp.champion_person_id ? 'Reach champion to confirm status' : 'No champion identified yet — find one',
        why_channel: daysOverdue > 3 ? 'Call — urgency warrants direct contact' : 'Email or LinkedIn — polite nudge',
        why_action: 'Revenue protection: keep deal from going cold',
      },
      signal_ids: [],
      expires_at: expiresAt,
    })
  }

  // ── Group signals by company ───────────────────────────────────────────────
  const signalsByCompany: Record<string, any[]> = {}
  for (const sig of signals) {
    if (!signalsByCompany[sig.company_id]) signalsByCompany[sig.company_id] = []
    signalsByCompany[sig.company_id].push(sig)
  }

  // ── Rule 2: High-signal outreach ──────────────────────────────────────────
  for (const [companyId, companySignals] of Object.entries(signalsByCompany)) {
    const company = companySignals[0].companies
    if (!company) continue

    // Skip customers and inactive
    if (['customer', 'inactive'].includes(company.account_status)) continue

    const topSignal = companySignals.reduce((a: any, b: any) => a.strength > b.strength ? a : b)
    const totalStrength = companySignals.reduce((sum: number, s: any) => sum + s.strength, 0)
    const hasIntro = introCompanyIds.has(companyId)
    const isHot = company.account_status === 'hot' || company.account_status === 'active_deal'

    // Only act on companies with strong enough signal
    if (company.account_score < 30 && !isHot) continue

    let actionType: string
    let priority: number
    let whyNow: string
    let whyChannel: string
    let whyAction: string

    // Determine action type based on account status
    if (company.account_status === 'target' || company.account_status === 'warm') {
      actionType = hasIntro ? 'intro_request' : 'linkedin_message'
      priority = isHot ? 2 : 3
      whyNow = buildWhyNow(companySignals)
      whyChannel = hasIntro
        ? 'Warm intro available — highest conversion channel'
        : 'LinkedIn cold outreach — best for DACH B2B first contact'
      whyAction = 'First touch: convert target to warm conversation'
    } else {
      // warm/hot accounts already in pipeline
      actionType = 'email'
      priority = 2
      whyNow = buildWhyNow(companySignals)
      whyChannel = 'Email — familiar channel, reference their job postings naturally'
      whyAction = 'Advance relationship: signal-triggered touchpoint increases relevance'
    }

    const signalSummary = companySignals.map((s: any) => s.signal_type).join(', ')

    actions.push({
      company_id: companyId,
      action_type: actionType,
      priority,
      estimated_minutes: ACTION_DURATIONS[actionType] || 10,
      reason: {
        why_account: `${company.name} — score ${company.account_score}/100, signals: ${signalSummary}`,
        why_now: whyNow,
        why_person: hasIntro ? 'Warm path exists via relationship network' : 'Target hiring manager or People Lead',
        why_channel: whyChannel,
        why_action: whyAction,
      },
      suggested_message: buildSuggestedMessage(company, companySignals, hasIntro),
      signal_ids: companySignals.map((s: any) => s.id),
      expires_at: expiresAt,
    })
  }

  // ── Rule 3: Stale pipeline hygiene ────────────────────────────────────────
  const { data: staleOpps } = await supabase
    .from('opportunities')
    .select('*, companies(id, name)')
    .eq('project_id', projectId)
    .in('stage', ['discovery', 'evaluation'])
    .lt('updated_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()) // 14 days stale

  for (const opp of (staleOpps || [])) {
    // Skip if already have a higher-priority action for this company
    const existing = actions.find(a => a.company_id === opp.companies.id)
    if (existing && existing.priority <= 2) continue

    actions.push({
      company_id: opp.companies.id,
      opportunity_id: opp.id,
      action_type: 'update_crm',
      priority: 4,
      estimated_minutes: 5,
      reason: {
        why_account: `${opp.companies.name} — deal in ${opp.stage} for 14+ days without update`,
        why_now: 'Pipeline hygiene: stale deals distort forecasts and get forgotten',
        why_person: 'You know the contact — reflect on real status',
        why_channel: 'Internal — update CRM, decide: advance, pause, or close lost',
        why_action: 'Keep pipeline honest: move forward or close out',
      },
      signal_ids: [],
      expires_at: expiresAt,
    })
  }

  if (actions.length === 0) return 0

  // ── Deduplicate: one action per company per day ─────────────────────────
  const deduped: GeneratedAction[] = []
  const seenCompanies = new Set<string>()
  const sorted = actions.sort((a, b) => a.priority - b.priority || b.estimated_minutes - a.estimated_minutes)

  for (const action of sorted) {
    const key = `${action.company_id}:${action.opportunity_id || ''}`
    if (!seenCompanies.has(key)) {
      seenCompanies.add(key)
      deduped.push(action)
    }
  }

  // ── Persist actions ────────────────────────────────────────────────────────
  const toInsert = deduped.map(a => ({
    project_id: projectId,
    company_id: a.company_id,
    opportunity_id: a.opportunity_id || null,
    person_id: a.person_id || null,
    action_type: a.action_type,
    priority: a.priority,
    estimated_minutes: a.estimated_minutes,
    reason: a.reason,
    suggested_message: a.suggested_message || null,
    signal_ids: a.signal_ids,
    status: 'pending',
    expires_at: a.expires_at,
    generated_at: now.toISOString(),
  }))

  // Expire previous pending actions first
  await supabase.from('actions')
    .update({ status: 'expired' })
    .eq('project_id', projectId)
    .eq('status', 'pending')

  const { error } = await supabase.from('actions').insert(toInsert)
  if (error) {
    console.error('[nba] Insert error:', error)
    return 0
  }

  return deduped.length
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildWhyNow(signals: any[]): string {
  const parts: string[] = []
  for (const sig of signals) {
    switch (sig.signal_type) {
      case 'hiring_acceleration':
        parts.push(`growing headcount fast (+${sig.evidence?.pct_growth}% in ${sig.evidence?.window_days}d)`)
        break
      case 'commercial_hiring':
        parts.push(`building commercial team (${sig.evidence?.commercial_jobs} open roles)`)
        break
      case 'recruiter_vacancy':
        parts.push(`hiring recruiter(s) — needs recruiting capacity NOW`)
        break
      case 'repeated_role':
        parts.push(`repeatedly posting "${sig.evidence?.repeated_role}" — high demand or churn`)
        break
      case 'new_head_of_people':
        parts.push(`searching for Head of People — new stakeholder, change window open`)
        break
    }
  }
  return parts.length > 0
    ? `Signal triggered: ${parts.join('; ')}`
    : 'Account score above threshold — time-sensitive outreach window'
}

function buildSuggestedMessage(
  company: any,
  signals: any[],
  hasIntro: boolean,
): string {
  const topSignal = signals[0]

  // Template-based openers — no LLM, personalisation from signals
  if (topSignal?.signal_type === 'recruiter_vacancy') {
    return `Hi [Name], noticed ${company.name} is looking for a Recruiter right now — the timing caught my eye. We work with a few DACH scale-ups in exactly that growth phase. Happy to share what's working for them. Worth a quick call?`
  }

  if (topSignal?.signal_type === 'hiring_acceleration') {
    const growth = topSignal.evidence?.pct_growth
    return `Hi [Name], saw ${company.name} has grown open positions by ${growth}% recently — impressive scaling. We help teams at that velocity hire faster without burning out the team. Would you be open to a 20-min chat?`
  }

  if (topSignal?.signal_type === 'new_head_of_people') {
    return `Hi [Name], I saw you're looking for a Head of People at ${company.name} — curious moment to reach out. We help People leaders hit the ground running with better hiring infrastructure. If the timing works, happy to connect.`
  }

  if (topSignal?.signal_type === 'commercial_hiring') {
    return `Hi [Name], noticed ${company.name} is scaling the commercial team. Fast-growing GTM orgs often feel the recruiting squeeze before it hits revenue. We've helped similar DACH teams solve exactly that. Open to a chat?`
  }

  // Generic fallback
  return `Hi [Name], ${company.name}'s hiring activity caught my attention — looks like an interesting growth phase. We help DACH companies hire smarter with AI-powered recruiting. Would love to share what we're seeing across similar companies. Worth 20 minutes?`
}
