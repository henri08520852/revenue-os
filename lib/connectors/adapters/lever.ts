// Lever ATS Adapter
// Public API: https://jobs.lever.co/<company-slug>?format=json
// Returns structured JSON — no HTML parsing needed.

import { ConnectorContext, ConnectorResult, DiscoveryResult, Observation } from '../types'
import crypto from 'crypto'

interface LeverJob {
  id: string
  text: string           // job title
  categories: {
    commitment?: string  // Full-time, Part-time, etc.
    department?: string
    location?: string
    team?: string
  }
  hostedUrl: string
  applyUrl: string
  createdAt: number     // unix ms
}

export async function discoverLever(domain: string): Promise<DiscoveryResult | null> {
  // Try common Lever slug patterns from the domain
  const slug = domain.replace(/\.(com|de|io|co|net|org)$/, '')
  const url = `https://jobs.lever.co/${slug}?format=json`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const jobs = await res.json()
      if (Array.isArray(jobs)) {
        return {
          atsType: 'lever',
          feedUrl: url,
          careerPageUrl: `https://jobs.lever.co/${slug}`,
          requiresJs: false,
          confidence: 95,
        }
      }
    }
  } catch {}
  return null
}

export async function fetchLever(context: ConnectorContext): Promise<ConnectorResult> {
  const feedUrl = context.subscription.config.feed_url as string
  if (!feedUrl) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'no_feed_url', message: 'No Lever feed URL configured', retryable: false },
    }
  }

  let jobs: LeverJob[]
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
    jobs = await res.json()
    if (!Array.isArray(jobs)) throw new Error('Unexpected response shape')
  } catch (err) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'parse_failed', message: String(err), retryable: true },
    }
  }

  const observations: Observation[] = normalizeJobs(jobs, feedUrl)
  const jobCountHash = crypto.createHash('md5').update(
    JSON.stringify(jobs.map(j => j.id).sort())
  ).digest('hex')

  // Add job count snapshot observation
  observations.push({
    observationType: 'job_snapshot',
    metricName: 'open_jobs',
    valueNumeric: jobs.length,
    sourceUrl: feedUrl,
    contentHash: jobCountHash,
    observedAt: new Date(),
    confidence: 95,
  })

  return {
    success: true,
    observations,
    metadata: {
      recordsFetched: jobs.length,
      recordsChanged: 0, // calculated by the runner after comparing with existing
      atsTypeDetected: 'lever',
      requiresJs: false,
      estimatedCostEur: 0,
      llmTokensUsed: 0,
    },
  }
}

function normalizeJobs(jobs: LeverJob[], feedUrl: string): Observation[] {
  return jobs.map(job => ({
    observationType: 'job_listing',
    metricName: 'job_detail',
    valueJson: {
      external_id: job.id,
      title: job.text,
      department: job.categories?.department,
      location: job.categories?.location,
      job_type: job.categories?.commitment,
      source_url: job.hostedUrl,
      ats_type: 'lever',
      hash: crypto.createHash('md5').update(
        `${job.text}|${job.categories?.location || ''}|${job.categories?.department || ''}`
      ).digest('hex'),
    },
    sourceUrl: job.hostedUrl,
    observedAt: new Date(),
    confidence: 95,
  }))
}
