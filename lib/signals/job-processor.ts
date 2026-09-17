// Job Processor — converts raw observations into structured job records
// Pure deterministic logic — no Claude, no LLM

import { Observation } from '@/lib/connectors/types'
import crypto from 'crypto'

export async function processJobObservations(
  supabase: any,
  projectId: string,
  companyId: string,
  dataSourceId: string,
  observations: Observation[],
): Promise<{ jobsAdded: number; jobsRemoved: number }> {

  // Store raw observations first (append-only)
  const obsToStore = observations.map(obs => ({
    project_id: projectId,
    company_id: companyId,
    data_source_id: dataSourceId,
    observation_type: obs.observationType,
    metric_name: obs.metricName,
    value_numeric: obs.valueNumeric ?? null,
    value_text: obs.valueText ?? null,
    value_json: obs.valueJson ?? null,
    source_url: obs.sourceUrl ?? null,
    content_hash: obs.contentHash ?? null,
    observed_at: obs.observedAt.toISOString(),
    confidence: obs.confidence,
  }))

  await supabase.from('observations').insert(obsToStore)

  // Extract job detail observations
  const jobObservations = observations.filter(o => o.observationType === 'job_listing' && o.valueJson)
  if (jobObservations.length === 0) {
    return { jobsAdded: 0, jobsRemoved: 0 }
  }

  // Get current active jobs from DB for this company+source
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id, content_hash, title, status')
    .eq('company_id', companyId)
    .eq('data_source_id', dataSourceId)
    .eq('status', 'active')

  const existingHashes = new Set((existingJobs || []).map((j: any) => j.content_hash))
  const seenHashes = new Set<string>()

  let jobsAdded = 0
  let jobsRemoved = 0

  // Upsert each observed job
  for (const obs of jobObservations) {
    const jobData = obs.valueJson as any
    const hash = jobData.hash || crypto.createHash('md5').update(
      `${jobData.title}|${jobData.location || ''}|${jobData.department || ''}`
    ).digest('hex')

    seenHashes.add(hash)

    const normalizedTitle = (jobData.title as string).toLowerCase().trim()

    // Classify role (using DB function for consistency)
    const { data: roleData } = await supabase.rpc('classify_job_role', { p_title: jobData.title })
    const roleCategory = roleData || 'other'

    const jobRecord = {
      project_id: projectId,
      company_id: companyId,
      data_source_id: dataSourceId,
      title: jobData.title,
      normalized_title: normalizedTitle,
      department: jobData.department || null,
      location: jobData.location || null,
      location_city: extractCity(jobData.location),
      job_type: jobData.job_type || null,
      role_category: roleCategory,
      source_url: jobData.source_url || null,
      external_id: jobData.external_id || null,
      status: 'active',
      last_seen_at: new Date().toISOString(),
      content_hash: hash,
    }

    if (!existingHashes.has(hash)) {
      // New job
      const { error } = await supabase.from('jobs').upsert(
        { ...jobRecord, first_seen_at: new Date().toISOString() },
        { onConflict: 'company_id,data_source_id,content_hash' }
      )
      if (!error) jobsAdded++
    } else {
      // Existing job — update last_seen
      await supabase.from('jobs')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('data_source_id', dataSourceId)
        .eq('content_hash', hash)
    }
  }

  // Mark jobs no longer in feed as removed
  const hashesToRemove = [...existingHashes].filter(h => !seenHashes.has(h))
  if (hashesToRemove.length > 0) {
    const { error } = await supabase.from('jobs')
      .update({ status: 'removed', removed_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('data_source_id', dataSourceId)
      .in('content_hash', hashesToRemove)

    if (!error) jobsRemoved = hashesToRemove.length
  }

  // Update company current_metrics with job counts
  await updateCompanyMetrics(supabase, companyId)

  return { jobsAdded, jobsRemoved }
}

async function updateCompanyMetrics(supabase: any, companyId: string): Promise<void> {
  // Count jobs by category (pure SQL, no LLM)
  const { data: counts } = await supabase
    .from('jobs')
    .select('role_category')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!counts) return

  const grouped = (counts as Array<{ role_category: string }>).reduce((acc, j) => {
    acc[j.role_category] = (acc[j.role_category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const openJobs = counts.length

  // Detect repeated roles (same normalized title 3+ times)
  const { data: allJobs } = await supabase
    .from('jobs')
    .select('normalized_title')
    .eq('company_id', companyId)
    .eq('status', 'active')

  const titleCounts: Record<string, number> = {}
  for (const job of (allJobs || [])) {
    const t = job.normalized_title || ''
    titleCounts[t] = (titleCounts[t] || 0) + 1
  }
  const repeatedRoles = Object.entries(titleCounts)
    .filter(([, count]) => count >= 3)
    .map(([title]) => title)

  await supabase.from('companies')
    .update({
      current_metrics: {
        open_jobs: openJobs,
        commercial_jobs: grouped.commercial || 0,
        recruiter_jobs: grouped.recruiter || 0,
        engineering_jobs: grouped.engineering || 0,
        hr_jobs: grouped.hr || 0,
        leadership_jobs: grouped.leadership || 0,
        marketing_jobs: grouped.marketing || 0,
        repeated_roles: repeatedRoles,
        jobs_updated_at: new Date().toISOString(),
      },
    })
    .eq('id', companyId)
}

function extractCity(location?: string): string | null {
  if (!location) return null
  // Simple extraction: take first part before comma
  const city = location.split(',')[0].trim()
  return city.length > 0 ? city : null
}
