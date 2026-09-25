// lib/connectors/google-places-discovery.ts
// Discovers DACH companies via Google Places Text Search API.
// Searches ICP-relevant business types in target cities.
// Throttled: once per 24h via discovery_searches marker.
// Cost guard: MAX_QUERIES_PER_RUN limits API calls per cron tick.

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

// Rotate through these queries — 3 per run, so full cycle = 4 days
const PLACE_QUERIES = [
  'Personalvermittlung Hamburg',
  'Personalvermittlung München',
  'Personalvermittlung Berlin',
  'Recruiting Agentur Frankfurt',
  'HR Software Unternehmen Deutschland',
  'Personaldienstleister Köln',
  'Unternehmensberatung Stuttgart',
  'Personalberatung Düsseldorf',
  'Zeitarbeit Unternehmen Hamburg',
  'Headhunter München',
  'Talent Management Software',
  'Bewerbermanagement System Anbieter',
]

const MAX_QUERIES_PER_RUN = 3   // Cost guard: 3 × ~$0.02 = ~$0.06 per cron tick
const MAX_RESULTS_PER_QUERY = 8 // Top 8 results per query

interface PlaceResult {
  name: string
  address: string
  placeId: string
  website?: string
}

async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!GOOGLE_PLACES_API_KEY) return []
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=de&region=de&key=${GOOGLE_PLACES_API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    const data = await res.json()
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[places] API status:', data.status, data.error_message)
      return []
    }
    return (data.results ?? []).slice(0, MAX_RESULTS_PER_QUERY).map((r: any) => ({
      name: r.name,
      address: r.formatted_address ?? '',
      placeId: r.place_id,
    }))
  } catch {
    return []
  }
}

async function getWebsite(placeId: string): Promise<string | null> {
  if (!GOOGLE_PLACES_API_KEY) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website&key=${GOOGLE_PLACES_API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = await res.json()
    return data.result?.website ?? null
  } catch {
    return null
  }
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(gmbh|ag|se|kg|ohg|gbr|ltd|inc|corp|s\.a\.|bv|nv|ug|e\.v\.|ev|co\.)\b/gi, '')
    .replace(/[^a-zäöü0-9]/g, '')
    .trim()
}

export async function runGooglePlacesDiscovery(
  supabase: any,
  projectId: string,
): Promise<{ candidatesCreated: number; placesScanned: number }> {
  if (!GOOGLE_PLACES_API_KEY) {
    // Silently skip — key not configured yet
    return { candidatesCreated: 0, placesScanned: 0 }
  }

  // Throttle: once per 24h
  const { data: marker } = await supabase
    .from('discovery_searches')
    .select('id, next_run_at, meta')
    .eq('project_id', projectId)
    .eq('signal_type', 'google_places_scan')
    .maybeSingle()

  const now = new Date()

  if (marker) {
    if (marker.next_run_at && new Date(marker.next_run_at) > now)
      return { candidatesCreated: 0, placesScanned: 0 }
  } else {
    await supabase.from('discovery_searches').insert({
      project_id:  projectId,
      query:       'google_places_scan',
      signal_type: 'google_places_scan',
      enabled:     true,
      next_run_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    })
  }

  // Rotate through queries across runs
  const lastIndex: number = marker?.meta?.last_query_index ?? -1
  const startIndex = (lastIndex + 1) % PLACE_QUERIES.length
  const queriesToRun = Array.from(
    { length: MAX_QUERIES_PER_RUN },
    (_, i) => PLACE_QUERIES[(startIndex + i) % PLACE_QUERIES.length],
  )

  let placesScanned = 0
  let candidatesCreated = 0

  for (const query of queriesToRun) {
    const results = await searchPlaces(query)
    placesScanned += results.length

    for (const place of results) {
      const normalized = normalizeCompanyName(place.name)
      if (!normalized || normalized.length < 2) continue

      const { data: existing } = await supabase
        .from('candidate_companies')
        .select('id')
        .eq('project_id', projectId)
        .eq('normalized_name', normalized)
        .maybeSingle()
      if (existing) continue

      // Fetch website (1 extra API call per new company — only for genuinely new ones)
      const website = await getWebsite(place.placeId)
      await new Promise(r => setTimeout(r, 150))

      const { error } = await supabase.from('candidate_companies').insert({
        project_id:   projectId,
        name:         place.name,
        signal_hint:  'directory',
        confidence:   50, // Low base — needs corroboration from other signals
        evidence: [{
          source:   'Google Places',
          query,
          address:  place.address,
          website:  website ?? undefined,
          fetchedAt: now.toISOString(),
        }],
        status:              'pending',
        existing_company_id: null,
        places_query:        query,
      })
      if (!error) candidatesCreated++
    }

    await new Promise(r => setTimeout(r, 400))
  }

  // Update throttle marker
  const nextRun = new Date(now.getTime() + 24 * 3600 * 1000).toISOString()
  if (marker) {
    await supabase.from('discovery_searches')
      .update({
        next_run_at:  nextRun,
        last_run_at:  now.toISOString(),
        meta: { last_query_index: (startIndex + MAX_QUERIES_PER_RUN - 1) % PLACE_QUERIES.length },
      })
      .eq('id', marker.id)
  }

  return { candidatesCreated, placesScanned }
}
