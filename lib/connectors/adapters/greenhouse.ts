// Greenhouse ATS Adapter
// Public API: https://boards-api.greenhouse.io/v1/boards/<company-token>/jobs
// JSON API — very reliable.

import { ConnectorContext, ConnectorResult, DiscoveryResult, Observation } from '../types'
import crypto from 'crypto'

interface GreenhouseJob {
  id: number
  title: string
  updated_at: string
  location: { name: string }
  departments: Array<{ name: string }>
  offices: Array<{ name: string; location: { name?: string } }>
  absolute_url: string
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[]
  meta?: { total: number }
}

export async function discoverGreenhouse(domain: string): Promise<DiscoveryResult | null> {
  // Greenhouse board slug usually matches company name or domain slug
  const slug = domain.replace(/\.(com|de|io|co|net|org|ai)$/, '').replace(/[^a-z0-9-]/g, '-')
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const data: GreenhouseResponse = await res.json()
      if (Array.isArray(data.jobs)) {
        return {
          atsType: 'greenhouse',
          feedUrl: url,
          careerPageUrl: `https://boards.greenhouse.io/${slug}`,
          requiresJs: false,
          confidence: 90,
        }
      }
    }
  } catch {}
  return null
}

export async function fetchGreenhouse(context: ConnectorContext): Promise<ConnectorResult> {
  const feedUrl = context.subscription.config.feed_url as string
  if (!feedUrl) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'no_feed_url', message: 'No Greenhouse feed URL configured', retryable: false },
    }
  }

  let data: GreenhouseResponse
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return {
        success: false,
        observations: [],
        metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
        error: { code: 'fetch_failed', message: `HTTP ${res.status}`, retryable: res.status >= 500 },
      }
    }
    data = await res.json()
  } catch (err) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'fetch_failed', message: String(err), retryable: true },
    }
  }

  const jobs = data.jobs || []
  const observations: Observation[] = jobs.map(job => ({
    observationType: 'job_listing',
    metricName: 'job_detail',
    valueJson: {
      external_id: String(job.id),
      title: job.title,
      department: job.departments?.[0]?.name,
      location: job.location?.name,
      source_url: job.absolute_url,
      ats_type: 'greenhouse',
      hash: crypto.createHash('md5').update(
        `${job.title}|${job.location?.name || ''}|${job.departments?.[0]?.name || ''}`
      ).digest('hex'),
    },
    sourceUrl: job.absolute_url,
    observedAt: new Date(),
    confidence: 90,
  }))

  const jobCountHash = crypto.createHash('md5').update(
    JSON.stringify(jobs.map(j => j.id).sort())
  ).digest('hex')

  observations.push({
    observationType: 'job_snapshot',
    metricName: 'open_jobs',
    valueNumeric: jobs.length,
    sourceUrl: feedUrl,
    contentHash: jobCountHash,
    observedAt: new Date(),
    confidence: 90,
  })

  return {
    success: true,
    observations,
    metadata: {
      recordsFetched: jobs.length,
      recordsChanged: 0,
      atsTypeDetected: 'greenhouse',
      requiresJs: false,
      estimatedCostEur: 0,
      llmTokensUsed: 0,
    },
  }
}
