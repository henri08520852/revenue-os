// Calendly bookings land in Google Calendar. When the invitee is not in the CRM yet,
// create contact (+ company by domain) and a lead in "Im Gespräch" — only for Calendly
// events, so private appointments never create records.
import { GoogleConnection } from './oauth'
import { CrmIndex, FREE_MAIL, domainOf } from './matching'

const isCalendly = (e: any) => /calendly\.com/i.test(`${e.description || ''} ${e.location || ''}`)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Invitee name: attendee name, else the matching part of "Max Muster and Henri Steckhan", else the email
function inviteeName(e: any, attendee: any): string {
  if (attendee.displayName?.trim()) return attendee.displayName.trim()
  const local = attendee.email.split('@')[0].toLowerCase()
  const tokens = local.split(/[._-]+/).filter((t: string) => t.length > 1)
  const parts = String(e.summary || '').split(/\s+(?:between|zwischen)\s+|\s*[:|]\s*/i).pop()!
    .split(/\s+(?:and|und|&)\s+/i).map((p: string) => p.trim()).filter(Boolean)
  const hit = parts.find((p: string) => tokens.some((t: string) => p.toLowerCase().includes(t)))
  if (hit && hit.split(/\s+/).length <= 5) return hit
  return tokens.length ? tokens.map(cap).join(' ') : cap(local)
}

// "acme-solutions.de" → "Acme Solutions"
const companyNameOf = (domain: string) => domain.split('.').slice(0, -1).join(' ').split(/[-_\s]+/).filter(Boolean).map(cap).join(' ') || domain

// Booking text without Calendly's cancel/reschedule boilerplate
function bookingNotes(description: string | undefined) {
  return String(description || '').replace(/<[^>]+>/g, '\n')
    .split('\n').map(l => l.trim())
    .filter(l => l && !/calendly\.com|^(cancel|reschedule|absagen|neu planen|need to make changes|powered by)/i.test(l))
    .join('\n').slice(0, 2000)
}

export async function createFromCalendly(svc: any, conn: GoogleConnection, events: any[], index: CrmIndex): Promise<number> {
  let created = 0
  const now = Date.now()
  for (const e of events) {
    if (e.status === 'cancelled' || !e.start || !isCalendly(e)) continue
    const invitees = (e.attendees || []).filter((a: any) => a.email && !a.self && !a.resource
      && domainOf(a.email) !== index.internalDomain && !/calendly\.com|calendar\.google\.com/i.test(a.email))

    for (const a of invitees) {
      const email = a.email.toLowerCase()
      if (index.personByEmail.has(email)) continue
      const domain = domainOf(email)

      // Company by domain (none for gmail.com & co.)
      let companyId: string | null = FREE_MAIL.has(domain) ? null : index.companyByDomain.get(domain) ?? null
      if (!companyId && !FREE_MAIL.has(domain)) {
        const { data: c, error } = await svc.from('companies').insert({
          project_id: conn.project_id, name: companyNameOf(domain), domain, account_status: 'warm', source: 'calendly',
        }).select('id').single()
        if (error) continue
        companyId = c.id
        index.companyByDomain.set(domain, c.id)
      }

      const name = inviteeName(e, a)
      const words = name.split(/\s+/)
      const { data: person, error: pErr } = await svc.from('people').insert({
        project_id: conn.project_id, company_id: companyId, email, source: 'calendly',
        first_name: words.length > 1 ? words.slice(0, -1).join(' ') : name, last_name: words.length > 1 ? words[words.length - 1] : null, full_name: name,
      }).select('id').single()
      if (pErr) continue
      index.personByEmail.set(email, { id: person.id, company_id: companyId })
      created++

      // Lead in "Im Gespräch" unless the company already has an open lead or deal
      if (companyId) {
        const [{ data: openLead }, { data: openDeal }] = await Promise.all([
          svc.from('leads').select('id').eq('company_id', companyId).in('stage', ['outreach', 'contacted', 'qualified']).limit(1),
          svc.from('opportunities').select('id').eq('company_id', companyId).not('stage', 'in', '(won,lost)').limit(1),
        ])
        if (openLead?.length) {
          await svc.from('leads').update({ stage: 'contacted' }).eq('id', openLead[0].id).eq('stage', 'outreach')
        } else if (!openDeal?.length) {
          await svc.from('leads').insert({
            project_id: conn.project_id, company_id: companyId, person_id: person.id, owner_id: conn.user_id,
            stage: 'contacted', source: 'calendly', name: null,
          })
        }
      }

      // Booking note in the timeline (booking time = when Calendly created the event)
      const startAt = new Date(e.start.dateTime || `${e.start.date}T00:00:00`)
      const bookedAt = e.created ? Math.min(Date.parse(e.created), now) : now
      await svc.from('activities').insert({
        project_id: conn.project_id, company_id: companyId, person_id: person.id,
        activity_type: 'note', direction: 'inbound', channel: 'calendar', source: 'calendar',
        occurred_at: new Date(bookedAt).toISOString(), created_by: conn.google_email,
        raw_reference: `calendly:${e.id}:${email}`,
        summary: `Termin über Calendly gebucht: ${(String(e.description || '').match(/Event Name:\s*([^\n<]+)/i)?.[1] || e.summary || 'Meeting').trim()} am ${startAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })}`,
        extracted_intel: { body: bookingNotes(e.description), calendly: true },
      })
    }
  }
  return created
}
