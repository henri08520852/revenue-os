'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { dayKeyBerlin } from '@/lib/tz'
import { updateOpportunityStage } from './actions'
import { convertLeadAtStage, updateLeadStage } from '../leads/actions'
import { Lead, LeadCard, Member, personName } from '../leads/LeadBoard'
import CloseDealDialog from '@/components/CloseDealDialog'
import QualificationCard from '@/components/QualificationCard'
import { Qualification, qualiScore } from '@/lib/dealMeta'

export type Show = 'all' | 'leads' | 'deals'

type Col = { key: string; label: string; color: string }
const LEAD_COLS: Col[] = [
  { key: 'outreach',  label: 'Outreach',     color: '#c4b5fd' },
  { key: 'contacted', label: 'Im Gespräch',  color: '#a78bfa' },
  { key: 'qualified', label: 'Qualifiziert', color: '#7c3aed' },
]
const LEAD_CLOSED: Col[] = [{ key: 'disqualified', label: 'Disqualifiziert', color: '#9ca3af' }]
const DEAL_COLS: Col[] = [
  { key: 'discovery',     label: 'Discovery',    color: '#94a3b8' },
  { key: 'erstgespraech', label: 'Erstgespräch', color: '#818cf8' },
  { key: 'evaluation',    label: 'Evaluation',   color: '#60a5fa' },
  { key: 'proposal',      label: 'Proposal',     color: '#fbbf24' },
  { key: 'negotiation',   label: 'Verhandlung',  color: '#f97316' },
]
const DEAL_CLOSED: Col[] = [
  { key: 'won',  label: 'Gewonnen', color: '#16a34a' },
  { key: 'lost', label: 'Verloren', color: '#9ca3af' },
]

export type FunnelLead = Lead & { owner_name: string | null; qualification?: Qualification | null }
export type FunnelDeal = {
  id: string
  name: string | null
  stage: string
  value_eur: number | null
  owner_name: string | null
  next_step: string | null
  next_step_due_at: string | null
  qualification?: Qualification | null
  companies: { id: string; name: string; domain?: string | null } | null
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
const isPast = (iso: string | null) => !!iso && dayKeyBerlin(new Date(iso)) < dayKeyBerlin(new Date())
const euro = (v: number) => `€${v.toLocaleString('de-DE')}`

function OwnerBadge({ name }: { name: string | null }) {
  if (!name) return null
  return <span title={`Owner: ${name}`} style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>{name}</span>
}

function QualiBadge({ q }: { q?: Qualification | null }) {
  const n = qualiScore(q)
  if (!q || !Object.keys(q).length) return null
  return <span title="Qualifizierung" style={{ fontSize: 10, fontWeight: 700, color: n >= 4 ? '#15803d' : n >= 2 ? '#a16207' : '#6b7280', background: n >= 4 ? '#dcfce7' : n >= 2 ? '#fef9c3' : '#f3f4f6', borderRadius: 10, padding: '1px 6px' }}>{n}/5</span>
}

function LeadMini({ lead }: { lead: FunnelLead }) {
  const contact = personName(lead.person)
  const overdue = isPast(lead.next_follow_up_at)
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderLeft: '3px solid #8b5cf6', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{lead.company?.name || lead.name || 'Lead'}</p>
        <OwnerBadge name={lead.owner_name} />
      </div>
      {lead.name && lead.company && <p style={{ fontSize: 12, color: '#4b5563', marginTop: 1 }}>{lead.name}</p>}
      {contact && <p style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>👤 {contact}</p>}
      <p style={{ fontSize: 11, marginTop: 4, color: overdue ? '#dc2626' : '#9ca3af', fontWeight: overdue ? 600 : 400 }}>
        {lead.next_follow_up_at ? `${overdue ? '⚠ ' : '📅 '}Follow-up ${fmtDay(lead.next_follow_up_at)}` : lead.stage === 'disqualified' ? 'disqualifiziert' : 'kein Follow-up'}
      </p>
      <div style={{ marginTop: 4 }}><QualiBadge q={lead.qualification} /></div>
    </div>
  )
}

function DealMini({ deal }: { deal: FunnelDeal }) {
  const overdue = isPast(deal.next_step_due_at)
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderLeft: '3px solid #16a34a', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{deal.name || deal.companies?.name || '—'}</p>
        <OwnerBadge name={deal.owner_name} />
      </div>
      {deal.companies?.name && deal.name && deal.name !== deal.companies.name && <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>🏢 {deal.companies.name}</p>}
      {deal.value_eur ? <p style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{euro(deal.value_eur)}</p> : null}
      {deal.next_step && <p style={{ fontSize: 11, color: '#6b7280', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {deal.next_step}</p>}
      {deal.next_step_due_at && <p style={{ fontSize: 11, marginTop: 2, color: overdue ? '#dc2626' : '#9ca3af', fontWeight: overdue ? 600 : 400 }}>{overdue ? '⚠ ' : ''}{fmtDay(deal.next_step_due_at)}</p>}
    </div>
  )
}

function Draggable({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.35 : 1, cursor: 'grab' }}>{children}</div>
}

function Column({ id, col, count, total, children, empty }: { id: string; col: Col; count: number; total?: number; children: React.ReactNode; empty: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div style={{ flexShrink: 0, width: 190, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderTop: `3px solid ${col.color}`, borderRadius: '0 0 8px 8px', padding: '9px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{col.label}</span>
          <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', borderRadius: 12, padding: '1px 7px', fontWeight: 500 }}>{count}</span>
        </div>
        {total ? <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{euro(total)}</p> : null}
      </div>
      <div ref={setNodeRef} style={{ flex: 1, minHeight: 140, borderRadius: 8, padding: 4, background: isOver ? '#eff6ff' : 'transparent', border: isOver ? '2px dashed #93c5fd' : '2px dashed transparent', transition: 'background 0.15s' }}>
        {children}
        {count === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: '#d1d5db', fontSize: 12 }}>{empty}</div>}
      </div>
    </div>
  )
}

function Group({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>{children}</div>
    </div>
  )
}

function LeadModal({ lead, team, onClose }: { lead: FunnelLead; team: Member[]; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#f9fafb', borderRadius: 16, width: '100%', maxWidth: 400, padding: 16, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lead</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>
        <LeadCard lead={lead} focused={false} team={team} />
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginTop: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Qualifizierung</p>
          <QualificationCard kind="lead" id={lead.id} initial={lead.qualification ?? null} />
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Aufgaben, E-Mails und Notizen zum Lead findest du auf der {lead.company ? <Link href={`/companies/${lead.company.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>Company-Seite</Link> : 'Company-Seite'}.</p>
      </div>
    </div>
  )
}

function ListView({ leads, deals, onLead }: { leads: FunnelLead[]; deals: FunnelDeal[]; onLead: (l: FunnelLead) => void }) {
  const label = (k: string) => [...LEAD_COLS, ...LEAD_CLOSED, ...DEAL_COLS, ...DEAL_CLOSED].find(c => c.key === k)
  const th = { textAlign: 'left' as const, padding: '10px 16px', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
  const td = { padding: '10px 16px', fontSize: 13 }
  const rows = [
    ...deals.map(d => ({ key: 'd' + d.id, type: 'Deal', stage: d.stage, name: d.name || d.companies?.name || '—', sub: d.companies?.name && d.name && d.name !== d.companies.name ? d.companies.name : null, value: d.value_eur, next: d.next_step, due: d.next_step_due_at, owner: d.owner_name, href: `/opportunities/${d.id}`, lead: null as FunnelLead | null })),
    ...leads.map(l => ({ key: 'l' + l.id, type: 'Lead', stage: l.stage, name: l.company?.name || l.name || 'Lead', sub: l.company ? l.name : null, value: null, next: l.next_follow_up_at ? 'Follow-up' : null, due: l.next_follow_up_at, owner: l.owner_name, href: null, lead: l })),
  ]
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
          {['Typ', 'Name', 'Stage', 'Wert', 'Nächster Schritt', 'Fällig', 'Owner'].map(h => <th key={h} style={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => {
            const st = label(r.stage)
            const overdue = isPast(r.due)
            return (
              <tr key={r.key} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={td}><span style={{ fontSize: 10, fontWeight: 700, color: r.type === 'Deal' ? '#16a34a' : '#7c3aed' }}>{r.type.toUpperCase()}</span></td>
                <td style={td}>
                  {r.href
                    ? <Link href={r.href} style={{ fontWeight: 600, color: '#111827', textDecoration: 'none' }}>{r.name}</Link>
                    : <button onClick={() => r.lead && onLead(r.lead)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, color: '#111827' }}>{r.name}</button>}
                  {r.sub && <p style={{ fontSize: 11, color: '#9ca3af' }}>{r.sub}</p>}
                </td>
                <td style={td}>{st && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 12, background: st.color + '22', color: '#374151', border: `1px solid ${st.color}66` }}>{st.label}</span>}</td>
                <td style={{ ...td, fontWeight: 600, color: '#374151' }}>{r.value ? euro(r.value) : '—'}</td>
                <td style={{ ...td, color: '#6b7280', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.next || '—'}</td>
                <td style={{ ...td, fontSize: 12, color: overdue ? '#dc2626' : '#9ca3af', fontWeight: overdue ? 600 : 400 }}>{r.due ? fmtDay(r.due) : '—'}</td>
                <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>{r.owner || '—'}</td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nichts gefunden</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// End-to-end funnel: lead stages → deal stages on one board.
// Dragging a lead into a deal column converts it into a deal at that stage.
export default function FunnelBoard({ leads: initialLeads, deals: initialDeals, show, closed, team, focusId }: {
  leads: FunnelLead[]
  deals: FunnelDeal[]
  show: Show
  closed: boolean
  team: Member[]
  focusId: string | null
}) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [deals, setDeals] = useState(initialDeals)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [openLead, setOpenLead] = useState<FunnelLead | null>(null)
  const [closing, setClosing] = useState<{ deal: FunnelDeal; stage: 'won' | 'lost' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { setLeads(initialLeads); setDeals(initialDeals) }, [initialLeads, initialDeals])
  useEffect(() => {
    if (focusId) { const l = initialLeads.find(x => x.id === focusId); if (l) setOpenLead(l) }
  }, [focusId, initialLeads])
  // keep the modal in sync after server refreshes
  useEffect(() => { setOpenLead(o => o ? initialLeads.find(x => x.id === o.id) ?? null : null) }, [initialLeads])

  const leadCols = [...LEAD_COLS, ...(closed ? LEAD_CLOSED : [])]
  const dealCols = [...DEAL_COLS, ...(closed ? DEAL_CLOSED : [])]
  const showLeads = show !== 'deals'
  const showDeals = show !== 'leads'

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)) }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (!e.over) return
    const [kind, id] = String(e.active.id).split(':')
    const [area, stage] = String(e.over.id).split(':')
    setError(null)

    if (kind === 'deal') {
      if (area !== 'deal') return
      const deal = deals.find(d => d.id === id)
      if (!deal || deal.stage === stage) return
      if (stage === 'won' || stage === 'lost') { setClosing({ deal, stage }); return }
      setDeals(prev => prev.map(d => d.id === id ? { ...d, stage } : d))
      startTransition(async () => {
        try { await updateOpportunityStage(id, stage); router.refresh() }
        catch (err: any) { setDeals(initialDeals); setError(err?.message || 'Stage konnte nicht geändert werden') }
      })
      return
    }

    const lead = leads.find(l => l.id === id)
    if (!lead || (area === 'lead' && lead.stage === stage)) return
    if (area === 'lead') {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
      startTransition(async () => {
        const res = await updateLeadStage(id, stage)
        if (res.error) { setLeads(initialLeads); setError(res.error) } else router.refresh()
      })
      return
    }
    const stageLabel = DEAL_COLS.find(c => c.key === stage)?.label ?? stage
    if (!confirm(`„${lead.company?.name || lead.name || 'Lead'}“ in einen Deal umwandeln (Stage ${stageLabel})?`)) return
    setLeads(prev => prev.filter(l => l.id !== id))
    startTransition(async () => {
      const res = await convertLeadAtStage(id, stage)
      if (res.error) { setLeads(initialLeads); setError(res.error) } else router.refresh()
    })
  }

  const [activeKind, activeRaw] = activeId?.split(':') ?? []
  const activeLead = activeKind === 'lead' ? leads.find(l => l.id === activeRaw) : null
  const activeDeal = activeKind === 'deal' ? deals.find(d => d.id === activeRaw) : null
  const visLeads = showLeads ? leads.filter(l => leadCols.some(c => c.key === l.stage)) : []
  const visDeals = showDeals ? deals.filter(d => dealCols.some(c => c.key === d.stage)) : []

  const tab = (active: boolean) => ({ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid', cursor: 'pointer', background: active ? '#111827' : 'white', color: active ? 'white' : '#6b7280', borderColor: active ? '#111827' : '#e5e7eb' })

  return (
    <div style={{ padding: '20px 32px', opacity: pending ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('board')} style={tab(view === 'board')}>⊞ Board</button>
        <button onClick={() => setView('list')} style={tab(view === 'list')}>☰ Liste</button>
        {showLeads && showDeals && view === 'board' && <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>Tipp: Lead in eine Deal-Spalte ziehen = in Deal umwandeln</span>}
        {error && <span style={{ marginLeft: 8, fontSize: 12, color: '#dc2626' }}>{error}</span>}
      </div>

      {view === 'list'
        ? <ListView leads={visLeads} deals={visDeals} onLead={setOpenLead} />
        : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div style={{ display: 'flex', gap: 24, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
              {showLeads && (
                <Group label="Leads" color="#7c3aed">
                  {leadCols.map(col => {
                    const items = leads.filter(l => l.stage === col.key)
                    return (
                      <Column key={col.key} id={`lead:${col.key}`} col={col} count={items.length} empty="Keine Leads">
                        {items.map(l => (
                          <Draggable key={l.id} id={`lead:${l.id}`}>
                            <div onClick={() => setOpenLead(l)}><LeadMini lead={l} /></div>
                          </Draggable>
                        ))}
                      </Column>
                    )
                  })}
                </Group>
              )}
              {showLeads && showDeals && <div style={{ alignSelf: 'stretch', width: 1, background: '#e5e7eb', flexShrink: 0, marginTop: 22 }} />}
              {showDeals && (
                <Group label="Deals" color="#16a34a">
                  {dealCols.map(col => {
                    const items = deals.filter(d => d.stage === col.key)
                    return (
                      <Column key={col.key} id={`deal:${col.key}`} col={col} count={items.length} total={items.reduce((s, d) => s + (d.value_eur || 0), 0)} empty="Keine Deals">
                        {items.map(d => (
                          <Draggable key={d.id} id={`deal:${d.id}`}>
                            <Link href={`/opportunities/${d.id}`} style={{ textDecoration: 'none' }}><DealMini deal={d} /></Link>
                          </Draggable>
                        ))}
                      </Column>
                    )
                  })}
                </Group>
              )}
            </div>
            <DragOverlay>
              {activeLead ? <LeadMini lead={activeLead} /> : activeDeal ? <DealMini deal={activeDeal} /> : null}
            </DragOverlay>
          </DndContext>
        )}

      {closing && <CloseDealDialog oppId={closing.deal.id} dealName={closing.deal.name || closing.deal.companies?.name || 'Deal'} stage={closing.stage} onClose={() => setClosing(null)} onDone={() => router.refresh()} />}
      {openLead && <LeadModal lead={openLead} team={team} onClose={() => setOpenLead(null)} />}
    </div>
  )
}
