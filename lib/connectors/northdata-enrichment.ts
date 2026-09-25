// lib/connectors/northdata-enrichment.ts
// Enriches high-confidence candidate companies with North Data API.
// North Data aggregates Handelsregister + Bundesanzeiger for DACH companies.
// Key signals: management changes, capital increases, employee estimates.
//
// Cost: ~€0.10 per company lookup.
// Cost guard: MAX_PER_DAY limits daily spend (default: 20 = €2/day max).
// Only runs on candidates with confidence >= MIN_CONFIDENCE.

const NORTHDATA_API_KEY = process.env.NORTHDATA_API_KEY

const MIN_CONFIDENCE  = 75   // Only enrich pre-selected candidates
const MAX_PER_DAY     = 20   // Hard limit: 20 enrichments/day = €2/day max

interface NorthdataEvent {
  type:        string
  date?:       string
  description?: string
}

interface NorthdataCompany {
  name?:       string
  legalForm?:  string
  status?:     string
  address?: {
    city?:       string
    postalCode?: string
    street?:     string
    country?:    string
  }
  register?: {
    city?: string
    id?:   string
  }
  financials?: Array<{
    year?:      number
    employees?: number
    revenue?:   number
  }>
  events?: NorthdataEvent[]
}

async function fetchNorthData(companyName: string): Promise<NorthdataCompany | null> {
  if (!NORTHDATA_API_KEY) return null
  try {
    const params = new URLSearchParams({
      name:    companyName,
      api_key: NORTHDATA_API_KEY,
    })
    const res = await fetch(
      `https://www.northdata.de/api/company/v1/company?${params}`,
      {
        headers: { 'Accept': 'application/json' },
        signal:  AbortSignal.timeout(12_000),
      },
    )
    if (res.status === 404) return null // Company not found — not an error
    if (!res.ok) {
      console.error('[northdata] API error:', res.status)
      return null
    }
    return await res.json()
  } catch {
    return null
  }
}

function extractSignals(data: NorthdataCompany): { signals: string[]; confidenceBoost: number } {
  const signals: string[] = []
  let confidenceBoost = 0

  const events = data.events ?? []

  // 1. Management change = strongest buying signal (new decision-makers buy new tools)
  const mgmtChange = events.find(e =>
    e.type === 'management-change' ||
    (e.description ?? '').toLowerCase().includes('geschäftsführer') ||
    (e.description ?? '').toLowerCase().includes('vorstand'),
  )
  if (mgmtChange) {
    signals.push(`Führungswechsel ${mgmtChange.date ?? ''}`.trim())
    confidenceBoost += 10
  }

  // 2. Capital increase = growth / investment signal
  const capitalEvent = events.find(e =>
    e.type === 'capital-change' ||
    (e.description ?? '').toLowerCase().includes('kapitalerhöhung'),
  )
  if (capitalEvent) {
    signals.push('Kapitalerhöhung')
    confidenceBoost += 5
  }

  // 3. New location = expansion signal
  const locationEvent = events.find(e =>
    e.type === 'address-change' ||
    (e.description ?? '').toLowerCase().includes('sitzverlegung'),
  )
  if (locationEvent) {
    signals.push('Standorterweiterung')
    confidenceBoost += 3
  }

  // 4. Employee count (if available)
  const latestFinancials = data.financials?.[0]
  if (latestFinancials?.employees) {
    signals.push(`~${latestFinancials.employees} Mitarbeiter`)
  }

  // 5. Active Handelsregister entry
  if (data.register?.id) {
    signals.push(`HRB ${data.register.id} ${data.register.city ?? ''}`.trim())
  }

  return { signals, confidenceBoost }
}

export async function runNorthdataEnrichment(
  supabase: any,
  projectId: string,
): Promise<{ enriched: number; skipped: number }> {
  if (!NORTHDATA_API_KEY) {
    // Silently skip — key not configured yet
    return { enriched: 0, skipped: 0 }
  }

  // Daily budget check
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count: usedToday } = await supabase
    .from('candidate_companies')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .gte('northdata_enriched_at', todayStart.toISOString())

  const remaining = MAX_PER_DAY - (usedToday ?? 0)
  if (remaining <= 0) return { enriched: 0, skipped: 0 }

  // Find unenriched high-confidence candidates
  const { data: candidates } = await supabase
    .from('candidate_companies')
    .select('id, name')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .gte('confidence', MIN_CONFIDENCE)
    .is('northdata_enriched_at', null)
    .order('confidence', { ascending: false })
    .limit(remaining)

  if (!candidates?.length) return { enriched: 0, skipped: 0 }

  let enriched = 0
  let skipped  = 0

  for (const candidate of candidates) {
    const data = await fetchNorthData(candidate.name)
    const now  = new Date().toISOString()

    if (!data) {
      // Mark as attempted so we don't retry every run
      await supabase.from('candidate_companies')
        .update({ northdata_enriched_at: now })
        .eq('id', candidate.id)
      skipped++
      continue
    }

    const { signals, confidenceBoost } = extractSignals(data)

    const enrichmentData = {
      northdata: {
        legalForm:  data.legalForm,
        status:     data.status,
        address:    data.address,
        register:   data.register,
        employees:  data.financials?.[0]?.employees ?? null,
        revenue:    data.financials?.[0]?.revenue ?? null,
        signals,
        fetchedAt:  now,
      },
    }

    await supabase.from('candidate_companies')
      .update({
        northdata_enriched_at: now,
        enrichment_data:       enrichmentData,
      })
      .eq('id', candidate.id)

    // Boost confidence if strong signals found
    if (confidenceBoost > 0) {
      await supabase
        .from('candidate_companies')
        .update({
          confidence: supabase
            .raw?.(`LEAST(confidence + ${confidenceBoost}, 95)`) ?? undefined,
        })
        .eq('id', candidate.id)
        .catch(() => {}) // non-critical — confidence stays as-is if this fails
    }

    enriched++
    await new Promise(r => setTimeout(r, 300)) // Be polite to the API
  }

  return { enriched, skipped }
}
