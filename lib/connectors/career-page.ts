// Career Page Connector — orchestrates ATS detection + fetching
// This is the main connector registered in the registry.

import { Connector, ConnectorContext, ConnectorResult, ConnectorHealth, DiscoveryResult, registry } from './types'
import { discoverLever, fetchLever } from './adapters/lever'
import { discoverPersonio, fetchPersonio } from './adapters/personio'
import { discoverGreenhouse, fetchGreenhouse } from './adapters/greenhouse'
import { discoverGeneric, fetchGeneric } from './adapters/generic'

const ATS_ADAPTERS: Record<string, {
  discover: (domain: string) => Promise<DiscoveryResult | null>
  fetch: (ctx: ConnectorContext) => Promise<ConnectorResult>
}> = {
  lever: { discover: discoverLever, fetch: fetchLever },
  personio: { discover: discoverPersonio, fetch: fetchPersonio },
  greenhouse: { discover: discoverGreenhouse, fetch: fetchGreenhouse },
}

class CareerPageConnector implements Connector {
  readonly id = 'career_page_http'
  readonly name = 'Career Page Connector'
  readonly version = '1.0.0'
  readonly supportsDiscovery = true

  async discover(context: ConnectorContext): Promise<DiscoveryResult> {
    const { domain, websiteUrl } = context.company

    // Try each known ATS in parallel — fastest wins
    const atsResults = await Promise.allSettled(
      Object.entries(ATS_ADAPTERS).map(async ([atsType, adapter]) => {
        const result = await adapter.discover(domain)
        return result ? { atsType, ...result } : null
      })
    )

    for (const result of atsResults) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value
      }
    }

    // Fallback: generic HTTP scraping
    const generic = await discoverGeneric(domain, websiteUrl || undefined)
    if (generic) return generic

    return {
      confidence: 0,
      requiresJs: false,
    }
  }

  async fetch(context: ConnectorContext): Promise<ConnectorResult> {
    const atsType = context.subscription.config.ats_type as string | undefined

    // Route to specific ATS adapter if known
    if (atsType && atsType !== 'generic' && ATS_ADAPTERS[atsType]) {
      return ATS_ADAPTERS[atsType].fetch(context)
    }

    // Generic fallback
    return fetchGeneric(context)
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now()
    try {
      // Ping a known stable ATS endpoint
      const res = await fetch('https://jobs.lever.co/acme?format=json', {
        signal: AbortSignal.timeout(5000),
      })
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
      }
    } catch (err) {
      return {
        healthy: false,
        errorMessage: String(err),
        checkedAt: new Date(),
      }
    }
  }
}

// Register the connector
export const careerPageConnector = new CareerPageConnector()
registry.register(careerPageConnector)
