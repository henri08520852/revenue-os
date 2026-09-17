// ============================================================
// Connector Interface — the contract every connector must implement
// ============================================================

export interface ConnectorContext {
  company: {
    id: string
    name: string
    domain: string
    websiteUrl?: string | null
    currentMetrics: Record<string, unknown>
    accountStatus: string
  }
  subscription: {
    id: string
    config: Record<string, unknown>
    lastCheckedAt?: string | null
    lastSuccessAt?: string | null
  }
  projectId: string
}

export interface Observation {
  observationType: string
  metricName: string
  valueNumeric?: number
  valueText?: string
  valueJson?: Record<string, unknown>
  sourceUrl?: string
  contentHash?: string
  observedAt: Date
  confidence: number // 0-100
}

export interface ConnectorResult {
  success: boolean
  observations: Observation[]
  metadata: {
    recordsFetched: number
    recordsChanged: number
    atsTypeDetected?: string
    requiresJs?: boolean
    estimatedCostEur: number
    llmTokensUsed: number
    extra?: Record<string, unknown>
  }
  error?: {
    code: string // 'fetch_failed' | 'parse_failed' | 'rate_limited' | 'requires_js' | 'no_career_page'
    message: string
    retryable: boolean
  }
}

export interface DiscoveryResult {
  careerPageUrl?: string
  feedUrl?: string    // direct JSON/XML feed URL if ATS detected
  atsType?: string    // 'personio' | 'lever' | 'greenhouse' | 'workable' | 'smartrecruiters' | 'generic'
  requiresJs?: boolean
  confidence: number  // 0-100
}

export interface ConnectorHealth {
  healthy: boolean
  latencyMs?: number
  errorMessage?: string
  checkedAt: Date
}

// The contract every connector must fulfill
export interface Connector {
  readonly id: string      // matches data_sources.slug
  readonly name: string
  readonly version: string
  readonly supportsDiscovery: boolean

  // Find career page URL for a company (run once, result stored in subscription.config)
  discover?(context: ConnectorContext): Promise<DiscoveryResult>

  // Fetch data and return normalized observations (idempotent — safe to run multiple times)
  fetch(context: ConnectorContext): Promise<ConnectorResult>

  // Liveness check
  healthCheck(): Promise<ConnectorHealth>
}

// Registry
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>()

  register(connector: Connector): void {
    this.connectors.set(connector.id, connector)
  }

  get(id: string): Connector | undefined {
    return this.connectors.get(id)
  }

  list(): Connector[] {
    return Array.from(this.connectors.values())
  }
}

export const registry = new ConnectorRegistry()
