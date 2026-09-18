import { createHash } from 'crypto'
import { registry } from './types'
import type { Connector, ConnectorContext, ConnectorResult, Observation } from './types'

// ---------------------------------------------------------------------------
// Simple RSS parser — no external deps, works server-side
// ---------------------------------------------------------------------------

interface RssItem {
  title: string
  link: string
  pubDate: string
  description: string
  sourceName: string
}

function cdataDecode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '')
    .trim()
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  return cdataDecode(xml.match(re)?.[1] ?? '')
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []

  for (const block of blocks) {
    const title = extractTag(block, 'title')
    // Google News RSS uses plain <link> (not in CDATA)
    const linkRaw = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
    const link = cdataDecode(linkRaw)
    const pubDate = extractTag(block, 'pubDate')
    const description = extractTag(block, 'description')
    const sourceName = extractTag(block, 'source')

    if (title && link) {
      items.push({ title, link, pubDate, description, sourceName })
    }
  }

  return items
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

class GoogleNewsConnector implements Connector {
  readonly id = 'google_news'
  readonly name = 'Google News RSS'
  readonly version = '1.0.0'
  readonly supportsDiscovery = false

  async discover() {
    // News connector doesn't need discovery — search is by company name
    return { url: '', atsType: null as unknown as string, confidence: 0 }
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const { company } = ctx
    const queryName = company.name ?? ''
    if (!queryName) {
      return {
        success: false,
        observations: [],
        metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
        error: { code: 'no_company_name', message: 'Company has no name', retryable: false },
      }
    }

    // Build RSS URL — quoted exact-match query
    const q = encodeURIComponent(`"${queryName}"`)
    const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en&num=20`

    let xml: string
    try {
      const res = await fetch(rssUrl, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HireflowBot/1.0)' },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      xml = await res.text()
    } catch (err) {
      return {
        success: false,
        observations: [],
        metadata: { recordsFetched: 0, recordsChanged: 0, estimatedCostEur: 0, llmTokensUsed: 0 },
        error: { code: 'fetch_error', message: String(err), retryable: true },
      }
    }

    const items = parseRssItems(xml)

    const observations: Observation[] = items.map((item) => {
      // Stable hash of the article link — same article = same hash, dedup in processor
      const contentHash = createHash('sha256').update(item.link).digest('hex').slice(0, 32)

      let observedAt: string
      try {
        observedAt = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
      } catch {
        observedAt = new Date().toISOString()
      }

      return {
        observation_type: 'news_mention',
        metric_name: 'news_article',
        value_text: item.title,
        value_json: {
          title: item.title,
          link: item.link,
          published: item.pubDate,
          description: item.description.slice(0, 500),
          source: item.sourceName,
        },
        source_url: item.link,
        content_hash: contentHash,
        observed_at: observedAt,
        confidence: 90,
      }
    })

    return {
      success: true,
      observations,
      metadata: {
        recordsFetched: items.length,
        recordsChanged: 0,
        estimatedCostEur: 0,
        llmTokensUsed: 0,
      },
    }
  }

  async healthCheck() {
    const start = Date.now()
    try {
      const res = await fetch('https://news.google.com/rss/search?q=test&num=1', {
        signal: AbortSignal.timeout(8_000),
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }
  }
}

export const googleNewsConnector = new GoogleNewsConnector()
registry.register(googleNewsConnector)
