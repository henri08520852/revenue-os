// Same firm, several entries: job boards spell the employer differently ("IONOS DE" / "IONOS EN"),
// so entries are also matched by their website domain.

// Placeholder or platform domains that many employers share → never a reason to merge
export const SHARED_DOMAIN = /(^|\.)(domainname|example|localhost)\.|personio\.|softgarden\.|join\.com$|arbeitsagentur\.de$/i

export const mergeDomain = (domain: string | null | undefined) =>
  domain && !SHARED_DOMAIN.test(domain) ? domain.toLowerCase().replace(/^www\./, '') : null

const norm = (name: string) => name.toLowerCase().replace(/\b(gmbh|ag|se|kg|co|mbh|ug|gruppe|group|deutschland|holding)\b/g, ' ').replace(/[^a-z0-9äöüß]+/g, ' ').trim()

// Pending candidates without the ones already decided (same key/domain) or already in the CRM,
// and with duplicates folded into the entry with the highest score (others listed as aliases)
export function cleanCandidates<T extends { id: string; name: string; score: number | null; hiring: any; enrichment_data?: any; existing_company_id?: string | null }>(
  pending: T[],
  reviewed: { key: string | null; domain: string | null }[],
  crm: { name: string; domain: string | null }[],
): (T & { aliases: string[] })[] {
  const doneKeys = new Set(reviewed.map(r => r.key).filter(Boolean))
  const doneDomains = new Set(reviewed.map(r => mergeDomain(r.domain)).filter(Boolean))
  const crmDomains = new Set(crm.map(c => mergeDomain(c.domain)).filter(Boolean))
  const crmNames = new Set(crm.map(c => norm(c.name)).filter(n => n.length >= 3))
  const byDomain = new Map<string, T & { aliases: string[] }>()
  const out: (T & { aliases: string[] })[] = []
  for (const c of [...pending].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    const d = mergeDomain(c.enrichment_data?.impressum?.domain)
    if (c.hiring?.key && doneKeys.has(c.hiring.key)) continue
    if (d && (doneDomains.has(d) || crmDomains.has(d))) continue
    if (crmNames.has(norm(c.name))) continue
    const first = d ? byDomain.get(d) : undefined
    if (first) { first.aliases.push(c.name); continue }
    const row = { ...c, aliases: [] as string[] }
    if (d) byDomain.set(d, row)
    out.push(row)
  }
  return out
}
