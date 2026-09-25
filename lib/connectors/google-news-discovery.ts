import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RssItem {
  title: string
  link: string
  pubDate: string
  description: string
  sourceName: string
}

interface DiscoverySearch {
  id: string
  project_id: string
  name: string
  query: string
  geo: string
  language: string
  signal_hint: string | null
  refresh_hours: number
}

// ---------------------------------------------------------------------------
// Company name extraction  — heuristic, no LLM needed for v1
// ---------------------------------------------------------------------------

// German + English company suffixes (longest first to avoid partial matches)
const COMPANY_SUFFIXES = [
  'GmbH & Co. KGaA', 'GmbH & Co. KG', 'GmbH & Co. OHG',
  'Aktiengesellschaft', 'Kommanditgesellschaft',
  'GmbH', 'AG', 'SE', 'KGaA', 'KG', 'OHG', 'e.V.',
  'Ltd.', 'Ltd', 'Inc.', 'Inc', 'Corp.', 'Corp',
  'S.A.', 'S.A.S.', 'B.V.', 'N.V.', 'PLC', 'LLC',
]

// Words that usually precede the company name in headlines
// "COMPANY raises €10M" / "COMPANY appoints new CEO"
const TRIGGER_VERBS = [
  'raises', 'raised', 'secures', 'closes', 'receives',
  'appoints', 'names', 'hires', 'promotes', 'launches', 'acquires',
  'expands', 'opens', 'announces', 'reports', 'partners',
  'erhält', 'sichert', 'schließt', 'ernennt', 'eröffnet', 'expandiert',
]

function extractCompanyName(title: string): string | null {
  // Strategy 1: look for a suffix — take 1–4 words before it
  for (const suffix of COMPANY_SUFFIXES) {
    const idx = title.indexOf(suffix)
    if (idx === -1) continue
    const before = title.slice(0, idx).trim()
    // Take the last 1-4 capitalised words before the suffix
    const words = before.split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    const companyWords: string[] = []
    for (let i = words.length - 1; i >= 0 && companyWords.length < 4; i--) {
      const w = words[i]
      // Stop at punctuation or lowercase connector words
      if (/^[a-zäöü]/.test(w) || /^[,;:–—-]/.test(w)) break
      companyWords.unshift(w)
    }
    if (companyWords.length > 0) {
      return companyWords.join(' ') + ' ' + suffix
    }
  }

  // Strategy 2: "COMPANY VerbTrigger ..." — company name at start of headline
  for (const verb of TRIGGER_VERBS) {
    const re = new RegExp('\\b' + verb + '\\b', 'i')
    const match = re.exec(title)
    if (!match) continue
    const before = title.slice(0, match.index).trim()
    if (!before) continue
    // Take up to 4 words, all must start with uppercase or digit
    const words = before.split(/\s+/).filter(Boolean)
    const name = words.slice(0, 4).join(' ')
    if (/^[A-ZÄÖÜ0-9]/.test(name)) return name
  }

  return null
}

// ---------------------------------------------------------------------------
// RSS fetch + parse (same logic as google-news.ts)
// ---------------------------------------------------------------------------

function cdataDecode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '').trim()
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp('<' + tag + '(?:[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i')
  return cdataDecode(xml.match(re)?.[1] ?? '')
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  for (const block of blocks) {
    const title       = extractTag(block, 'title')
    const linkRaw     = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
    const link        = cdataDecode(linkRaw)
    const pubDate     = extractTag(block, 'pubDate')
    const description = extractTag(block, 'description')
    const sourceName  = extractTag(block, 'source')
    if (title && link) items.push({ title, link, pubDate, description, sourceName })
  }
  return items
}

async function fetchRss(query: string, geo: string, lang: string): Promise<RssItem[]> {
  const langCode = lang === 'de' ? 'de' : 'en'
  const ceid     = geo + ':' + langCode
  const q        = encodeURIComponent(query)
  const url      = 'https://news.google.com/rss/search?q=' + q +
                   '&hl=' + langCode + '-' + geo +
                   '&gl=' + geo +
                   '&ceid=' + ceid + '&num=20'
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RevenueOSBot/1.0)' },
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return parseRssItems(await res.text())
  } catch (err) {
    console.error('[news-discovery] fetch error:', String(err))
    return []
  }
}

// ---------------------------------------------------------------------------
// Main: run a single discovery search
// ---------------------------------------------------------------------------

export async function runDiscoverySearch(
  supabase: SupabaseClient,
  search: DiscoverySearch,
): Promise<{ candidatesCreated: number; articlesScanned: number }> {
  const items = await fetchRss(search.query, search.geo, search.language)
  if (items.length === 0) return { candidatesCreated: 0, articlesScanned: 0 }

  // Build map: companyName → evidence[]
  const companyMap = new Map<string, { title: string; link: string; published: string; source: string }[]>()

  for (const item of items) {
    const name = extractCompanyName(item.title)
    if (!name || name.length < 3 || name.length > 80) continue

    let published = ''
    try { published = item.pubDate ? new Date(item.pubDate).toISOString() : '' } catch { published = '' }

    const evidence = {
      title: item.title,
      link: item.link,
      published,
      source: item.sourceName,
    }

    const existing = companyMap.get(name) ?? []
    existing.push(evidence)
    companyMap.set(name, existing)
  }

  if (companyMap.size === 0) return { candidatesCreated: 0, articlesScanned: items.length }

  // Check which names already exist as companies (fuzzy: lower + trim)
  const candidateNames = [...companyMap.keys()]
  const { data: existingCompanies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('project_id', search.project_id)
    .in('name', candidateNames)   // exact first; fuzzy below

  const knownNames = new Set(
    (existingCompanies ?? []).map((c: { name: string }) => c.name.toLowerCase().trim())
  )

  // Check already-pending candidates
  const { data: pendingCandidates } = await supabase
    .from('candidate_companies')
    .select('normalized_name')
    .eq('project_id', search.project_id)
    .eq('status', 'pending')

  const pendingNames = new Set(
    (pendingCandidates ?? []).map((c: { normalized_name: string }) => c.normalized_name)
  )

  // Insert new candidates
  const rows = []
  for (const [name, evidence] of companyMap.entries()) {
    const normalized = name.toLowerCase().trim()
    if (knownNames.has(normalized) || pendingNames.has(normalized)) continue
    rows.push({
      project_id:       search.project_id,
      name,
      normalized_name:  normalized,
      source_type: 'news_discovery',
      search_id:   search.id,
      evidence:    evidence.slice(0, 5),   // max 5 articles as evidence
      signal_hint: search.signal_hint ?? null,
      confidence:  evidence.length > 1 ? 80 : 65,  // more articles = higher confidence
      status:      'pending',
    })
  }

  if (rows.length === 0) return { candidatesCreated: 0, articlesScanned: items.length }

  const { data: inserted, error } = await supabase
    .from('candidate_companies')
    .insert(rows)
    .select('id')

  if (error) {
    // Unique constraint violation = already exists — not a real error
    if (!error.message.includes('unique')) {
      console.error('[news-discovery] insert error:', error.message)
    }
  }

  return {
    candidatesCreated: inserted?.length ?? 0,
    articlesScanned: items.length,
  }
}

// ---------------------------------------------------------------------------
// Runner helper: process all due discovery searches for a project
// ---------------------------------------------------------------------------

export async function runDueDiscoverySearches(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ searchesRun: number; candidatesCreated: number }> {
  const { data: searches, error } = await supabase
    .from('discovery_searches')
    .select('*')
    .eq('project_id', projectId)
    .eq('enabled', true)
    .lte('next_run_at', new Date().toISOString())

  if (error || !searches?.length) return { searchesRun: 0, candidatesCreated: 0 }

  let totalCandidates = 0

  for (const search of searches) {
    const { candidatesCreated } = await runDiscoverySearch(supabase, search)
    totalCandidates += candidatesCreated

    // Schedule next run
    const nextRun = new Date()
    nextRun.setHours(nextRun.getHours() + (search.refresh_hours ?? 24))

    await supabase
      .from('discovery_searches')
      .update({ last_run_at: new Date().toISOString(), next_run_at: nextRun.toISOString() })
      .eq('id', search.id)
  }

  return { searchesRun: searches.length, candidatesCreated: totalCandidates }
}
