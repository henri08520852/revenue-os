// Hireflow Signal Engine — deterministic rules, no LLM
// Generates signals from job observations using project config thresholds

interface ProjectConfig {
  signal_weights: Record<string, number>
  scoring: {
    hiring_acceleration_threshold_pct: number
    hiring_acceleration_threshold_abs: number
    hiring_acceleration_window_days: number
    repeated_role_min_count: number
    commercial_role_min_count: number
    recruiter_role_min_count: number
  }
}

export async function generateHireflowSignals(
  supabase: any,
  projectId: string,
  companyId: string,
): Promise<number> {
  // Get project config for thresholds
  const { data: project } = await supabase
    .from('projects')
    .select('config')
    .eq('id', projectId)
    .single()

  const config = (project?.config as ProjectConfig) || {
    signal_weights: {
      hiring_acceleration: 25,
      commercial_hiring: 20,
      recruiter_vacancy: 20,
      repeated_role: 15,
      new_head_of_people: 20,
    },
    scoring: {
      hiring_acceleration_threshold_pct: 40,
      hiring_acceleration_threshold_abs: 4,
      hiring_acceleration_window_days: 14,
      repeated_role_min_count: 3,
      commercial_role_min_count: 2,
      recruiter_role_min_count: 1,
    },
  }

  // Get current metrics
  const { data: company } = await supabase
    .from('companies')
    .select('current_metrics, account_status')
    .eq('id', companyId)
    .single()

  if (!company) return 0

  const metrics = company.current_metrics as Record<string, any>
  const signals: Array<{
    project_id: string
    company_id: string
    signal_type: string
    strength: number
    confidence: number
    reason: string
    evidence: Record<string, unknown>
    detected_at: string
    expires_at: string
    status: string
  }> = []

  const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days

  // ── Signal 1: Hiring Acceleration ─────────────────────────────
  await checkHiringAcceleration(supabase, projectId, companyId, config, metrics, signals, expiry)

  // ── Signal 2: Commercial Hiring ────────────────────────────────
  if ((metrics.commercial_jobs || 0) >= config.scoring.commercial_role_min_count) {
    const count = metrics.commercial_jobs as number
    signals.push({
      project_id: projectId,
      company_id: companyId,
      signal_type: 'commercial_hiring',
      strength: Math.min(100, 50 + count * 10),
      confidence: 85,
      reason: `${count} commercial roles currently open (Sales, CS, BD)`,
      evidence: {
        commercial_jobs: count,
        threshold: config.scoring.commercial_role_min_count,
      },
      detected_at: new Date().toISOString(),
      expires_at: expiry,
      status: 'active',
    })
  }

  // ── Signal 3: Recruiter Vacancy ────────────────────────────────
  if ((metrics.recruiter_jobs || 0) >= config.scoring.recruiter_role_min_count) {
    const count = metrics.recruiter_jobs as number
    signals.push({
      project_id: projectId,
      company_id: companyId,
      signal_type: 'recruiter_vacancy',
      strength: Math.min(100, 55 + count * 15),
      confidence: 90,
      reason: `${count} open recruiter/talent acquisition role${count > 1 ? 's' : ''} — they need recruiting capacity`,
      evidence: {
        recruiter_jobs: count,
        threshold: config.scoring.recruiter_role_min_count,
        hiring_pressure_indicator: true,
      },
      detected_at: new Date().toISOString(),
      expires_at: expiry,
      status: 'active',
    })
  }

  // ── Signal 4: Repeated Role ────────────────────────────────────
  const repeatedRoles = (metrics.repeated_roles as string[]) || []
  if (repeatedRoles.length > 0) {
    for (const roleTitle of repeatedRoles) {
      signals.push({
        project_id: projectId,
        company_id: companyId,
        signal_type: 'repeated_role',
        strength: 65,
        confidence: 85,
        reason: `"${roleTitle}" posted multiple times — high demand or churn indicator`,
        evidence: {
          repeated_role: roleTitle,
          threshold: config.scoring.repeated_role_min_count,
        },
        detected_at: new Date().toISOString(),
        expires_at: expiry,
        status: 'active',
      })
    }
  }

  // ── Signal 5: New Head of People ───────────────────────────────
  const leadershipJobs = await getLeadershipJobsByKeyword(
    supabase, companyId,
    ['head of people', 'head of hr', 'vp people', 'chief people', 'hr director',
     'personalleiter', 'leiter hr', 'head of talent']
  )
  if (leadershipJobs.length > 0) {
    signals.push({
      project_id: projectId,
      company_id: companyId,
      signal_type: 'new_head_of_people',
      strength: 80,
      confidence: 80,
      reason: `Hiring a Head of People — potential new stakeholder, change window open`,
      evidence: {
        job_titles: leadershipJobs.map(j => j.title),
        job_ids: leadershipJobs.map(j => j.id),
      },
      detected_at: new Date().toISOString(),
      expires_at: expiry,
      status: 'active',
    })
  }

  if (signals.length === 0) return 0

  // Upsert signals (one per type per company per day — handled by unique index)
  const { error } = await supabase
    .from('signals')
    .upsert(signals, {
      onConflict: 'company_id,signal_type,date_trunc(\'day\',detected_at)::date',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('[signals] Upsert error:', error)
    return 0
  }

  // Update company account_score and signal_score
  await updateAccountScore(supabase, projectId, companyId, signals, config)

  return signals.length
}

async function checkHiringAcceleration(
  supabase: any,
  projectId: string,
  companyId: string,
  config: ProjectConfig,
  metrics: Record<string, any>,
  signals: any[],
  expiry: string,
): Promise<void> {
  const windowDays = config.scoring.hiring_acceleration_window_days
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  // Get earliest and latest job count observations in window
  const { data: observations } = await supabase
    .from('observations')
    .select('value_numeric, observed_at')
    .eq('company_id', companyId)
    .eq('metric_name', 'open_jobs')
    .gte('observed_at', windowStart)
    .order('observed_at', { ascending: true })

  if (!observations || observations.length < 2) return

  const earliest = observations[0].value_numeric as number
  const latest = observations[observations.length - 1].value_numeric as number

  if (earliest <= 0 || latest <= earliest) return

  const absGrowth = latest - earliest
  const pctGrowth = Math.round(((latest - earliest) / earliest) * 100)

  const meetsThreshold =
    pctGrowth >= config.scoring.hiring_acceleration_threshold_pct ||
    absGrowth >= config.scoring.hiring_acceleration_threshold_abs

  if (!meetsThreshold) return

  const strength = Math.min(100, Math.round(
    (pctGrowth / 100) * 40 + (absGrowth / 10) * 30 + 30
  ))

  signals.push({
    project_id: projectId,
    company_id: companyId,
    signal_type: 'hiring_acceleration',
    strength,
    confidence: 88,
    reason: `Open jobs grew from ${earliest} to ${latest} (+${pctGrowth}%) in ${windowDays} days`,
    evidence: {
      prev_count: earliest,
      curr_count: latest,
      abs_growth: absGrowth,
      pct_growth: pctGrowth,
      window_days: windowDays,
      observation_count: observations.length,
    },
    detected_at: new Date().toISOString(),
    expires_at: expiry,
    status: 'active',
  })
}

async function getLeadershipJobsByKeyword(
  supabase: any,
  companyId: string,
  keywords: string[],
): Promise<Array<{ id: string; title: string }>> {
  const { data } = await supabase
    .from('jobs')
    .select('id, title')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .eq('role_category', 'leadership')

  if (!data) return []

  return (data as Array<{ id: string; title: string }>).filter(job =>
    keywords.some(kw => job.title.toLowerCase().includes(kw))
  )
}

async function updateAccountScore(
  supabase: any,
  projectId: string,
  companyId: string,
  newSignals: any[],
  config: ProjectConfig,
): Promise<void> {
  // Get all active signals for scoring
  const { data: allSignals } = await supabase
    .from('signals')
    .select('signal_type, strength')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!allSignals) return

  // Weighted additive score
  const weights = config.signal_weights
  let signalScore = 0
  for (const signal of allSignals as Array<{ signal_type: string; strength: number }>) {
    const weight = weights[signal.signal_type] || 10
    signalScore += Math.round((signal.strength / 100) * weight)
  }
  signalScore = Math.min(100, signalScore)

  // Get company for ICP score
  const { data: company } = await supabase
    .from('companies')
    .select('icp_score, account_status')
    .eq('id', companyId)
    .single()

  const icpScore = company?.icp_score || 50

  // Combined account score: 40% ICP fit + 60% current signals
  const accountScore = Math.round(icpScore * 0.4 + signalScore * 0.6)

  await supabase.from('companies').update({
    signal_score: signalScore,
    account_score: accountScore,
    last_signal_at: new Date().toISOString(),
  }).eq('id', companyId)
}
