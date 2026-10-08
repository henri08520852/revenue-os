// Maps email addresses to CRM records (people by exact email, companies by domain).

export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de',
  'msn.com', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.de', 'gmx.net',
  'gmx.at', 'gmx.ch', 'web.de', 't-online.de', 'freenet.de', 'proton.me', 'protonmail.com', 'posteo.de',
])

export function parseAddresses(header: string | null | undefined): string[] {
  if (!header) return []
  const found = header.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  return Array.from(new Set(found.map(a => a.toLowerCase())))
}

export function domainOf(email: string) {
  return email.split('@')[1]?.toLowerCase() || ''
}

function normalizeDomain(d: string | null | undefined) {
  return (d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

export type CrmIndex = {
  personByEmail: Map<string, { id: string; company_id: string | null }>
  companyByDomain: Map<string, string>
  openDealByCompany: Map<string, string>
  internalDomain: string
}

export async function loadCrmIndex(svc: any, projectId: string, internalDomain: string): Promise<CrmIndex> {
  const [{ data: people }, { data: companies }, { data: deals }] = await Promise.all([
    svc.from('people').select('id, email, company_id').eq('project_id', projectId).not('email', 'is', null),
    svc.from('companies').select('id, domain').eq('project_id', projectId).not('domain', 'is', null),
    svc.from('opportunities').select('id, company_id, created_at').eq('project_id', projectId)
      .not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }),
  ])
  const personByEmail = new Map<string, { id: string; company_id: string | null }>()
  for (const p of people || []) personByEmail.set(String(p.email).toLowerCase().trim(), { id: p.id, company_id: p.company_id })
  const companyByDomain = new Map<string, string>()
  for (const c of companies || []) {
    const d = normalizeDomain(c.domain)
    if (d && !FREE_MAIL.has(d)) companyByDomain.set(d, c.id)
  }
  const openDealByCompany = new Map<string, string>()
  for (const d of deals || []) if (!openDealByCompany.has(d.company_id)) openDealByCompany.set(d.company_id, d.id)
  return { personByEmail, companyByDomain, openDealByCompany, internalDomain }
}

// First external participant that matches a person (preferred) or a company domain
export function matchParticipants(index: CrmIndex, addresses: string[]) {
  const external = addresses.filter(a => domainOf(a) !== index.internalDomain)
  for (const a of external) {
    const p = index.personByEmail.get(a)
    if (p) return { personId: p.id, companyId: p.company_id }
  }
  for (const a of external) {
    const companyId = index.companyByDomain.get(domainOf(a))
    if (companyId) return { personId: null, companyId }
  }
  return null
}
