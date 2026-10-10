// "Ansprechpartner finden": LinkedIn people-search links (opened by the user – no scraping).
// The right profile is then saved with the Revenue OS LinkedIn extension.

const LEGAL = /\b(gmbh|mbh|ag|se|kg|kgaa|ohg|ug|e\.?\s?k\.?|e\.?\s?v\.?|co\.?|inc\.?|ltd\.?|llc|holding|gruppe|group)\b|&|\(.*?\)|[.,]/gi

// "Kögel Trailer GmbH & Co. KG" → "Kögel Trailer"
export const searchName = (company: string) => company.replace(LEGAL, ' ').replace(/\s+/g, ' ').trim() || company

const people = (keywords: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=GLOBAL_SEARCH_HEADER`

export type SearchLink = { label: string; href: string; hint?: string }

export function contactSearchLinks(company: string, known: { name: string; title?: string | null }[] = []): SearchLink[] {
  const n = searchName(company)
  return [
    { label: 'HR / Recruiting', href: people(`"${n}" (Personal OR HR OR Recruiting OR "Talent Acquisition" OR People)`) },
    { label: 'Geschäftsführung', href: people(`"${n}" (Geschäftsführer OR Geschäftsführerin OR CEO OR Inhaber OR Gründer)`) },
    ...known.slice(0, 4).map(p => ({ label: p.name, href: people(`${p.name} ${n}`), hint: p.title ?? undefined })),
  ]
}
