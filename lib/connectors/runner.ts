// Queue Runner — processes due source subscriptions
// Called by /api/cron/process-queue every 15 minutes
// Uses service role client — ONLY call from server-side API routes

import { createServiceClient } from '@/lib/supabase/server'
import { registry } from './types'
import { ConnectorContext } from './types'
import { processJobObservations } from '@/lib/signals/job-processor'

// Import connectors to register them
import '@/lib/connectors/career-page'

const BATCH_SIZE = 20        // Process up to N subscriptions per cron tick
const TIMEOUT_MS = 50_000    // 50s — Vercel Pro limit is 60s

export async function processQueue(projectId?: string): Promise<{
  processed: number
  succeeded: number
  failed: number
  skipped: number
}> {
  const supabase = createServiceClient()
  const stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 }

  // Fetch due subscriptions
  let query = supabase
    .from('source_subscriptions')
    .select(`
      *,
      companies(*),
      data_sources(slug, connector_type)
    `)
    .eq('enabled', true)
    .lt('failure_count', 5)
    .lte('next_check_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('next_check_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: subscriptions, error } = await query
  if (error || !subscriptions) {
    console.error('[runner] Failed to fetch queue:', error)
    return stats
  }

  const startTime = Date.now()

  // Process subscriptions (sequentially to avoid overwhelming target servers)
  for (const sub of subscriptions) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.log('[runner] Time limit approaching, stopping batch')
      break
    }

    stats.processed++
    const company = sub.companies as any
    const dataSource = sub.data_sources as any

    if (!company || !dataSource) {
      stats.skipped++
      continue
    }

    const connector = registry.get(dataSource.slug)
    if (!connector) {
      console.warn(`[runner] No connector for source: ${dataSource.slug}`)
      stats.skipped++
      continue
    }

    // Build context
    const context: ConnectorContext = {
      company: {
        id: company.id,
        name: company.name,
        domain: company.domain || '',
        websiteUrl: company.website_url,
        currentMetrics: (company.current_metrics as Record<string, unknown>) || {},
        accountStatus: company.account_status,
      },
      subscription: {
        id: sub.id,
        config: (sub.config as Record<string, unknown>) || {},
        lastCheckedAt: sub.last_checked_at,
        lastSuccessAt: sub.last_success_at,
      },
      projectId: sub.project_id,
    }

    // If discovery hasn't been done yet, run it first
    if (connector.supportsDiscovery && !sub.config.discovery_done && !sub.config.ats_type) {
      await runDiscovery(supabase, sub, connector, context)
    }

    // Run discovery again if needed
    const refreshedConfig = await refreshConfig(supabase, sub.id)
    if (refreshedConfig) {
      context.subscription.config = refreshedConfig
    }

    // Skip if discovery determined no career page exists
    if (sub.config.discovery_done && !sub.config.career_page_url && !sub.config.feed_url) {
      await scheduleNextCheck(supabase, sub.id, true, company.account_status)
      stats.skipped++
      continue
    }

    // Run the connector
    const runStart = Date.now()
    const runRecord = await supabase.from('connector_runs').insert({
      project_id: sub.project_id,
      company_id: company.id,
      data_source_id: sub.data_source_id,
      source_subscription_id: sub.id,
      started_at: new Date().toISOString(),
    }).select('id').single()

    let result
    try {
      result = await connector.fetch(context)
    } catch (err) {
      result = {
        success: false,
        observations: [],
        metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
        error: { code: 'exception', message: String(err), retryable: true },
      }
    }

    const duration = Date.now() - runStart

    // Store observations
    let signalsCreated = 0
    if (result.success && result.observations.length > 0) {
      const { jobsAdded, jobsRemoved } = await processJobObservations(
        supabase,
        sub.project_id,
        company.id,
        sub.data_source_id,
        result.observations,
      )
      signalsCreated = await generateSignals(supabase, sub.project_id, company.id)
      result.metadata.recordsChanged = jobsAdded + jobsRemoved
    }

    // Update connector run
    if (runRecord.data) {
      await supabase.from('connector_runs').update({
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        status: result.success ? 'success' : (result.error?.code === 'requires_js' ? 'skipped' : 'failed'),
        records_fetched: result.metadata.recordsFetched,
        records_changed: result.metadata.recordsChanged,
        signals_created: signalsCreated,
        estimated_cost_eur: result.metadata.estimatedCostEur,
        llm_tokens_used: result.metadata.llmTokensUsed,
        error_message: result.error?.message || null,
        error_code: result.error?.code || null,
        meta: {
          ats_type: result.metadata.atsTypeDetected,
          requires_js: result.metadata.requiresJs,
          ...result.metadata.extra,
        },
      }).eq('id', runRecord.data.id)
    }

    // Schedule next check
    await scheduleNextCheck(supabase, sub.id, result.success, company.account_status)

    if (result.success) {
      stats.succeeded++
    } else {
      stats.failed++
    }

    // Small delay between requests to be a good citizen
    await sleep(500)
  }

  return stats
}

async function runDiscovery(
  supabase: any,
  sub: any,
  connector: any,
  context: ConnectorContext,
): Promise<void> {
  if (!connector.discover) return

  console.log(`[runner] Running discovery for ${context.company.domain}`)
  let discovery
  try {
    discovery = await connector.discover(context)
  } catch (err) {
    console.error('[runner] Discovery error:', err)
    discovery = { confidence: 0 }
  }

  // Store discovery results in subscription config
  const updatedConfig = {
    ...context.subscription.config,
    discovery_done: true,
    ats_type: discovery.atsType || 'generic',
    career_page_url: discovery.careerPageUrl || null,
    feed_url: discovery.feedUrl || null,
    requires_js: discovery.requiresJs || false,
    discovery_confidence: discovery.confidence,
    discovered_at: new Date().toISOString(),
  }

  await supabase.from('source_subscriptions')
    .update({ config: updatedConfig })
    .eq('id', sub.id)

  // Also update company current_metrics with ATS info
  if (discovery.atsType) {
    await supabase.from('companies')
      .update({
        current_metrics: {
          ...context.company.currentMetrics,
          ats_type: discovery.atsType,
          career_page_url: discovery.careerPageUrl,
        },
      })
      .eq('id', context.company.id)
  }
}

async function refreshConfig(supabase: any, subscriptionId: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from('source_subscriptions')
    .select('config')
    .eq('id', subscriptionId)
    .single()
  return data?.config || null
}

async function scheduleNextCheck(
  supabase: any,
  subscriptionId: string,
  success: boolean,
  accountStatus: string,
): Promise<void> {
  await supabase.rpc('schedule_next_check', {
    p_subscription_id: subscriptionId,
    p_success: success,
    p_account_status: accountStatus,
  })
}

async function generateSignals(supabase: any, projectId: string, companyId: string): Promise<number> {
  // Delegate to signal engine
  const { generateHireflowSignals } = await import('@/lib/signals/hireflow')
  return generateHireflowSignals(supabase, projectId, companyId)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
