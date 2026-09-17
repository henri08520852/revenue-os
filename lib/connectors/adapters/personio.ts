// Personio ATS Adapter
// Public API: https://<company>.jobs.personio.com/xml
// Returns XML feed — no scraping needed, very reliable.

import { ConnectorContext, ConnectorResult, DiscoveryResult, Observation } from '../types'
import crypto from 'crypto'

export async function discoverPersonio(domain: string): Promise<DiscoveryResult | null> {
  const slug = domain.split('.')[0]
  const url = `https://${slug}.jobs.personio.com/xml`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok && res.headers.get('content-type')?.includes('xml')) {
      return {
        atsType: 'personio',
        feedUrl: url,
        careerPageUrl: `https://${slug}.jobs.personio.com`,
        requiresJs: false,
        confidence: 90,
      }
    }
  } catch {}
  return null
}

export async function fetchPersonio(context: ConnectorContext): Promise<ConnectorResult> {
  const feedUrl = context.subscription.config.feed_url as string
  if (!feedUrl) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'no_feed_url', message: 'No Personio feed URL configured', retryable: false },
    }
  }

  let xml: string
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
    xml = await res.text()
  } catch (err) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'fetch_failed', message: String(err), retryable: true },
    }
  }

  const jobs = parsePersonioXml(xml)
  const observations: Observation[] = jobs.map(job => ({
    observationType: 'job_listing',
    metricName: 'job_detail',
    valueJson: {
      ...job,
      ats_type: 'personio',
      hash: crypto.createHash('md5').update(
        `${job.title}|${job.location || ''}|${job.department || ''}`
      ).digest('hex'),
    },
    sourceUrl: feedUrl,
    observedAt: new Date(),
    confidence: 90,
  }))

  const jobCountHash = crypto.createHash('md5').update(
    JSON.stringify(jobs.map(j => j.external_id).sort())
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
      atsTypeDetected: 'personio',
      requiresJs: false,
      estimatedCostEur: 0,
      llmTokensUsed: 0,
    },
  }
}

function parsePersonioXml(xml: string): Array<{
  external_id: string
  title: string
  department?: string
  location?: string
  job_type?: string
  source_url?: string
}> {
  const jobs: Array<{
    external_id: string
    title: string
    department?: string
    location?: string
    job_type?: string
    source_url?: string
  }> = []

  // Simple regex-based XML parsing (avoids heavy dependencies)
  const jobMatches = xml.matchAll(/<position[^>]*>([\s\S]*?)<\/position>/gi)

  for (const match of jobMatches) {
    const content = match[1]
    const id = extractXmlTag(content, 'id') || extractXmlTag(content, 'jobId') || crypto.randomUUID()
    const title = extractXmlTag(content, 'name') || extractXmlTag(content, 'title')
    if (!title) continue

    jobs.push({
      external_id: id,
      title,
      department: extractXmlTag(content, 'department') || extractXmlTag(content, 'team'),
      location: extractXmlTag(content, 'office') || extractXmlTag(content, 'location'),
      job_type: extractXmlTag(content, 'employmentType') || extractXmlTag(content, 'schedule'),
      source_url: extractXmlTag(content, 'url') || extractXmlTag(content, 'applyUrl'),
    })
  }

  return jobs
}

function extractXmlTag(content: string, tag: string): string | undefined {
  const match = content.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'))
  return match?.[1]?.trim() || undefined
}
