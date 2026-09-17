// Generic Career Page Adapter
// Fallback when no known ATS is detected.
// Uses HTML parsing via cheerio — no headless browser required.
// Handles ~70% of career pages that use standard HTML structure.

import { ConnectorContext, ConnectorResult, DiscoveryResult, Observation } from '../types'
import { load } from 'cheerio'
import crypto from 'crypto'

// Common career page URL patterns to try
const CAREER_URL_PATTERNS = [
  '/jobs',
  '/careers',
  '/stellenangebote',
  '/karriere',
  '/offene-stellen',
  '/jobs/all',
  '/work-with-us',
  '/join-us',
  '/join',
  '/team',
]

export async function discoverGeneric(domain: string, websiteUrl?: string): Promise<DiscoveryResult | null> {
  const base = websiteUrl || `https://${domain}`

  for (const path of CAREER_URL_PATTERNS) {
    const url = `${base.replace(/\/$/, '')}${path}`
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue

      const html = await res.text()
      // If page has job-like content and is not a 404 redirect
      if (html.length > 1000 && looksLikeCareerPage(html, res.url)) {
        const requiresJs = detectRequiresJs(html)
        return {
          atsType: 'generic',
          careerPageUrl: res.url,
          requiresJs,
          confidence: requiresJs ? 40 : 65,
        }
      }
    } catch {}
  }

  // Try subdomains
  for (const sub of ['careers', 'jobs', 'work']) {
    const url = `https://${sub}.${domain}`
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS/1.0)' },
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const html = await res.text()
        if (looksLikeCareerPage(html, res.url)) {
          return {
            atsType: 'generic',
            careerPageUrl: res.url,
            requiresJs: detectRequiresJs(html),
            confidence: 60,
          }
        }
      }
    } catch {}
  }

  return null
}

export async function fetchGeneric(context: ConnectorContext): Promise<ConnectorResult> {
  const careerPageUrl = context.subscription.config.career_page_url as string
  if (!careerPageUrl) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'no_career_page', message: 'No career page URL configured', retryable: false },
    }
  }

  // Check if JS required — if so, skip gracefully (no headless in V1)
  if (context.subscription.config.requires_js === true) {
    return {
      success: false,
      observations: [],
      metadata: {
        recordsFetched: 0, recordsChanged: 0,
        requiresJs: true, estimatedCostEur: 0, llmTokensUsed: 0,
      },
      error: { code: 'requires_js', message: 'Page requires JavaScript — manual check needed', retryable: false },
    }
  }

  let html: string
  try {
    const res = await fetch(careerPageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOS/1.0)' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) {
      return {
        success: false,
        observations: [],
        metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
        error: { code: 'fetch_failed', message: `HTTP ${res.status}`, retryable: res.status >= 500 },
      }
    }
    html = await res.text()
  } catch (err) {
    return {
      success: false,
      observations: [],
      metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
      error: { code: 'fetch_failed', message: String(err), retryable: true },
    }
  }

  // Content hash for change detection (compare on next run)
  const contentHash = crypto.createHash('md5').update(html).digest('hex')
  const prevHash = context.subscription.config.last_content_hash as string | undefined

  if (prevHash && contentHash === prevHash) {
    // No change — skip expensive parsing
    return {
      success: true,
      observations: [{
        observationType: 'job_snapshot',
        metricName: 'page_hash',
        valueText: contentHash,
        contentHash,
        sourceUrl: careerPageUrl,
        observedAt: new Date(),
        confidence: 80,
      }],
      metadata: {
        recordsFetched: 0, recordsChanged: 0,
        atsTypeDetected: 'generic', estimatedCostEur: 0, llmTokensUsed: 0,
        extra: { no_change: true },
      },
    }
  }

  // Parse jobs from HTML
  const jobs = parseJobsFromHtml(html, careerPageUrl)
  const observations: Observation[] = [
    // Store page hash for future change detection
    {
      observationType: 'job_snapshot',
      metricName: 'page_hash',
      valueText: contentHash,
      contentHash,
      sourceUrl: careerPageUrl,
      observedAt: new Date(),
      confidence: 80,
    },
    // Job count
    {
      observationType: 'job_snapshot',
      metricName: 'open_jobs',
      valueNumeric: jobs.length,
      sourceUrl: careerPageUrl,
      contentHash: crypto.createHash('md5').update(
        JSON.stringify(jobs.map(j => j.hash).sort())
      ).digest('hex'),
      observedAt: new Date(),
      confidence: 60, // Lower confidence for generic parsing
    },
    // Individual job details
    ...jobs.map(job => ({
      observationType: 'job_listing' as const,
      metricName: 'job_detail',
      valueJson: { ...job, ats_type: 'generic' },
      sourceUrl: careerPageUrl,
      observedAt: new Date(),
      confidence: 60,
    })),
  ]

  return {
    success: true,
    observations,
    metadata: {
      recordsFetched: jobs.length,
      recordsChanged: prevHash && contentHash !== prevHash ? 1 : 0,
      atsTypeDetected: 'generic',
      requiresJs: false,
      estimatedCostEur: 0,
      llmTokensUsed: 0,
      extra: { content_hash: contentHash },
    },
  }
}

function parseJobsFromHtml(html: string, baseUrl: string): Array<{
  title: string
  location?: string
  department?: string
  source_url?: string
  hash: string
}> {
  const $ = load(html)
  const jobs: Array<{
    title: string
    location?: string
    department?: string
    source_url?: string
    hash: string
  }> = []

  // Common job listing selectors (ordered by specificity)
  const selectors = [
    '[class*="job-listing"] a, [class*="job_listing"] a',
    '[class*="position"] a[href*="job"], [class*="role"] a[href*="job"]',
    'li[class*="job"] a, li[class*="position"] a, li[class*="role"] a',
    '[data-job-id] a, [data-job] a, [data-position] a',
    'a[href*="/job/"], a[href*="/jobs/"], a[href*="/position/"], a[href*="/careers/"]',
    '[class*="opening"] h3, [class*="vacancy"] h3',
    'h3[class*="job"], h4[class*="job"], h2[class*="position"]',
  ]

  const seen = new Set<string>()

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el)
      const title = $el.text().trim()

      if (!title || title.length < 3 || title.length > 120) return
      if (!looksLikeJobTitle(title)) return

      const hash = crypto.createHash('md5').update(title.toLowerCase()).digest('hex')
      if (seen.has(hash)) return
      seen.add(hash)

      // Try to find location nearby
      const $parent = $el.parent().parent()
      const location = $parent.find('[class*="location"], [class*="ort"], [class*="city"]').first().text().trim() || undefined
      const department = $parent.find('[class*="department"], [class*="team"], [class*="abteilung"]').first().text().trim() || undefined

      // Try to resolve job URL
      const href = $el.attr('href') || ($el.is('a') ? $el.attr('href') : $el.find('a').attr('href'))
      let source_url: string | undefined
      if (href) {
        try {
          source_url = new URL(href, baseUrl).href
        } catch {}
      }

      jobs.push({ title, location, department, source_url, hash })
    })

    if (jobs.length > 5) break // Stop at first selector that finds jobs
  }

  return jobs.slice(0, 200) // Safety cap
}

function looksLikeCareerPage(html: string, url: string): boolean {
  const lower = html.toLowerCase()
  const urlLower = url.toLowerCase()

  const careerKeywords = ['job', 'career', 'stelle', 'position', 'opening', 'vacancy',
    'karriere', 'bewerbung', 'bewerb', 'arbeiten', 'stellen']
  const nonJobKeywords = ['404', 'not found', 'page not found', 'fehler']

  const hasCareerKeyword = careerKeywords.some(kw => lower.includes(kw))
  const isErrorPage = nonJobKeywords.some(kw => lower.includes(kw))
  const urlIsCareerLike = careerKeywords.some(kw => urlLower.includes(kw))

  return (hasCareerKeyword || urlIsCareerLike) && !isErrorPage
}

function detectRequiresJs(html: string): boolean {
  const lower = html.toLowerCase()
  // Signs that content is loaded dynamically
  return (
    (lower.includes('id="root"') || lower.includes("id='root'")) &&
    lower.includes('bundle.js')
  ) || (
    html.includes('__NEXT_DATA__') // Next.js app — might work with server rendering
    ? false
    : (lower.includes('react-dom') && !lower.includes('<li') && !lower.includes('<a href'))
  )
}

function looksLikeJobTitle(text: string): boolean {
  // Reject navigation elements, section headers, and obviously non-job text
  const rejectPatterns = [
    /^(home|about|contact|imprint|datenschutz|impressum|blog|news|team|press|media)$/i,
    /^see all|view all|alle jobs|mehr|more$/i,
    /^\d+$/, // just a number
    /^(filter|sort|search|suche|kategorie|standort)$/i,
  ]
  return !rejectPatterns.some(p => p.test(text.trim()))
}
