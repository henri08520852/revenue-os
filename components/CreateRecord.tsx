'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCompanyRecord, createContactRecord, createDealRecord, createLeadRecord, getPickerData } from '@/app/(dashboard)/records/create'
import TaskDialog, { TaskPickData } from './TaskDialog'

export type CreateKind = 'contact' | 'company' | 'lead' | 'deal' | 'task'
export type Preset = { companyId?: string | null; personId?: string | null; dealId?: string | null; dealRole?: string }
type Data = Awaited<ReturnType<typeof getPickerData>>

const KINDS: { kind: CreateKind; label: string; icon: string; hint: string }[] = [
  { kind: 'contact', label: 'Kontakt', icon: '👤', hint: 'Person, optional mit Company' },
  { kind: 'company', label: 'Company', icon: '🏢', hint: 'Unternehmen mit Domain' },
  { kind: 'lead',    label: 'Lead',    icon: '🎯', hint: 'Ansprache vor dem Deal' },
  { kind: 'deal',    label: 'Deal',    icon: '💼', hint: 'Konkrete Verkaufschance' },
  { kind: 'task',    label: 'Aufgabe', icon: '☑️', hint: 'To-do, Anruf, Follow-up' },
]
const TITLES: Record<CreateKind, string> = { contact: 'Neuer Kontakt', company: 'Neue Company', lead: 'Neuer Lead', deal: 'Neuer Deal', task: 'Neue Aufgabe' }
const DEAL_STAGES = [
  { key: 'discovery', label: 'Discovery' }, { key: 'erstgespraech', label: 'Erstgespräch' }, { key: 'evaluation', label: 'Evaluation' },
  { key: 'proposal', label: 'Proposal' }, { key: 'negotiation', label: 'Verhandlung' },
]
const LEAD_STAGES = [
  { key: 'outreach', label: 'Outreach' }, { key: 'contacted', label: 'Im Gespräch' }, { key: 'qualified', label: 'Qualifiziert' },
]
const DEAL_ROLES = [
  { key: 'champion', label: '⭐ Champion' }, { key: 'decision_maker', label: '🎯 Decision Maker' },
  { key: 'economic_buyer', label: '💰 Economic Buyer' }, { key: 'stakeholder', label: '👥 Stakeholder' }, { key: 'blocker', label: '🚧 Blocker' },
]
const BUYER_ROLES = [
  { key: '', label: '— keine —' }, { key: 'champion', label: '⭐ Champion' }, { key: 'economic_buyer', label: '💰 Budget-Entscheider' },
  { key: 'influencer', label: '💡 Influencer' }, { key: 'user', label: '👤 Nutzer' }, { key: 'blocker', label: '🚧 Blocker' },
]

const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }
const input = { width: '100%', padding: '8px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const }
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

let cache: Data | null = null

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><label style={label}>{title}</label>{children}</div>
}

// Existing company, or "+ Neue Company" with name + domain inline
function CompanyField({ data, value, onChange, required, fixed }: {
  data: Data
  value: { companyId: string; newName: string; newDomain: string }
  onChange: (v: { companyId: string; newName: string; newDomain: string }) => void
  required: boolean
  fixed: boolean
}) {
  if (fixed) {
    const c = data.companies.find(x => x.id === value.companyId)
    return <Field title="Company"><div style={{ ...input, background: '#f9fafb', color: '#374151' }}>{c?.name ?? '—'}</div></Field>
  }
  return (
    <>
      <Field title={required ? 'Company *' : 'Company'}>
        <select value={value.companyId} onChange={e => onChange({ ...value, companyId: e.target.value })} style={input}>
          <option value="">{required ? '— wählen —' : '— ohne Company —'}</option>
          <option value="__new">+ Neue Company anlegen …</option>
          {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {value.companyId === '__new' && (
        <div style={grid2}>
          <Field title="Name der Company"><input autoFocus value={value.newName} onChange={e => onChange({ ...value, newName: e.target.value })} placeholder="z. B. Zalando" style={input} /></Field>
          <Field title="Domain"><input value={value.newDomain} onChange={e => onChange({ ...value, newDomain: e.target.value })} placeholder="zalando.de" style={input} /></Field>
        </div>
      )}
    </>
  )
}

function Form({ kind, data, preset, onDone, onCancel }: { kind: Exclude<CreateKind, 'task'>; data: Data; preset: Preset; onDone: (href?: string) => void; onCancel: () => void }) {
  const [company, setCompany] = useState({ companyId: preset.companyId ?? '', newName: '', newDomain: '' })
  const [f, setF] = useState({
    first: '', last: '', jobTitle: '', email: '', phone: '', linkedin: '', buyerRole: '', dealRole: preset.dealRole ?? 'stakeholder',
    name: '', domain: '', stage: 'discovery', value: '', ownerId: data.meId ?? '', personId: preset.personId ?? '',
    nextStep: '', nextStepDate: '', followUp: '', notes: '', leadStage: 'outreach',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(s => ({ ...s, [k]: e.target.value }))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ref = { companyId: company.companyId && company.companyId !== '__new' ? company.companyId : null, newCompany: company.companyId === '__new' ? { name: company.newName, domain: company.newDomain || null } : null }
  const companyPeople = ref.companyId ? data.people.filter(p => p.company_id === ref.companyId) : []
  const companyName = ref.companyId ? data.companies.find(c => c.id === ref.companyId)?.name : company.newName

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    startTransition(async () => {
      const res =
        kind === 'company' ? await createCompanyRecord({ name: f.name, domain: f.domain || null })
        : kind === 'contact' ? await createContactRecord({ ...ref, firstName: f.first, lastName: f.last, jobTitle: f.jobTitle, email: f.email, phone: f.phone, linkedinUrl: f.linkedin, buyerRole: f.buyerRole || null, dealId: preset.dealId ?? null, dealRole: f.dealRole })
        : kind === 'deal' ? await createDealRecord({ ...ref, name: f.name, stage: f.stage, valueEur: f.value ? Number(f.value) : null, ownerId: f.ownerId || null, championId: f.personId || null, nextStep: f.nextStep || null, nextStepDate: f.nextStepDate || null })
        : await createLeadRecord({ ...ref, stage: f.leadStage, personId: f.personId || null, name: f.name || null, ownerId: f.ownerId || null, followUpDate: f.followUp || null, notes: f.notes || null })
      if (res.error) setError(res.error)
      else onDone(res.href)
    })
  }

  const owner = data.team.length > 0 && (
    <Field title="Owner">
      <select value={f.ownerId} onChange={set('ownerId')} style={input}>
        <option value="">— niemand —</option>
        {data.team.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}{m.user_id === data.meId ? ' (du)' : ''}</option>)}
      </select>
    </Field>
  )
  const personPicker = (title: string) => (
    <Field title={title}>
      <select value={f.personId} onChange={set('personId')} disabled={!ref.companyId} style={input}>
        <option value="">{ref.companyId ? (companyPeople.length ? '— keiner —' : 'Noch keine Kontakte') : company.companyId === '__new' ? 'Neue Company – noch keine Kontakte' : 'Erst Company wählen'}</option>
        {companyPeople.map(p => <option key={p.id} value={p.id}>{p.name}{p.job_title ? ` · ${p.job_title}` : ''}</option>)}
      </select>
    </Field>
  )

  return (
    <form onSubmit={submit}>
      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto' }}>
        {kind === 'company' && <>
          <Field title="Name *"><input autoFocus value={f.name} onChange={set('name')} placeholder="z. B. Zalando" style={input} /></Field>
          <Field title="Domain"><input value={f.domain} onChange={set('domain')} placeholder="zalando.de – E-Mails werden darüber zugeordnet" style={input} /></Field>
        </>}

        {kind === 'contact' && <>
          <div style={grid2}>
            <Field title="Vorname *"><input autoFocus value={f.first} onChange={set('first')} style={input} /></Field>
            <Field title="Nachname"><input value={f.last} onChange={set('last')} style={input} /></Field>
          </div>
          <CompanyField data={data} value={company} onChange={setCompany} required={false} fixed={!!preset.companyId} />
          <Field title="Position"><input value={f.jobTitle} onChange={set('jobTitle')} placeholder="z. B. Head of People" style={input} /></Field>
          <div style={grid2}>
            <Field title="E-Mail"><input type="email" value={f.email} onChange={set('email')} style={input} /></Field>
            <Field title="Telefon"><input value={f.phone} onChange={set('phone')} style={input} /></Field>
          </div>
          <Field title="LinkedIn"><input value={f.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/…" style={input} /></Field>
          {preset.dealId
            ? <Field title="Rolle im Deal"><select value={f.dealRole} onChange={set('dealRole')} style={input}>{DEAL_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
            : <Field title="Rolle"><select value={f.buyerRole} onChange={set('buyerRole')} style={input}>{BUYER_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>}
        </>}

        {kind === 'deal' && <>
          <CompanyField data={data} value={company} onChange={setCompany} required fixed={!!preset.companyId} />
          <Field title="Deal-Name"><input value={f.name} onChange={set('name')} placeholder={companyName ? `${companyName} — HireFlow` : 'z. B. Zalando — HireFlow'} style={input} /></Field>
          <Field title="Stage">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEAL_STAGES.map(s => (
                <button key={s.key} type="button" onClick={() => setF(x => ({ ...x, stage: s.key }))}
                  style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid', borderColor: f.stage === s.key ? '#111827' : '#e5e7eb', background: f.stage === s.key ? '#111827' : '#fff', color: f.stage === s.key ? '#fff' : '#6b7280' }}>{s.label}</button>
              ))}
            </div>
          </Field>
          <div style={grid2}>
            <Field title="Wert (€/Jahr)"><input type="number" value={f.value} onChange={set('value')} placeholder="24000" style={input} /></Field>
            {owner || <div />}
          </div>
          {personPicker('Champion (Ansprechpartner)')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 10 }}>
            <Field title="Nächster Schritt"><input value={f.nextStep} onChange={set('nextStep')} placeholder="z. B. Demo vereinbaren" style={input} /></Field>
            <Field title="Fällig am"><input type="date" value={f.nextStepDate} onChange={set('nextStepDate')} style={input} /></Field>
          </div>
        </>}

        {kind === 'lead' && <>
          <CompanyField data={data} value={company} onChange={setCompany} required fixed={!!preset.companyId} />
          {preset.personId
            ? <Field title="Ansprechpartner"><div style={{ ...input, background: '#f9fafb', color: '#374151' }}>{data.people.find(p => p.id === preset.personId)?.name ?? '—'}</div></Field>
            : personPicker('Ansprechpartner')}
          <Field title="Bezeichnung"><input value={f.name} onChange={set('name')} placeholder="z. B. Recruiting Q1" style={input} /></Field>
          <Field title="Phase">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LEAD_STAGES.map(st => (
                <button key={st.key} type="button" onClick={() => setF(x => ({ ...x, leadStage: st.key }))}
                  style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid', borderColor: f.leadStage === st.key ? '#7c3aed' : '#e5e7eb', background: f.leadStage === st.key ? '#7c3aed' : '#fff', color: f.leadStage === st.key ? '#fff' : '#6b7280' }}>{st.label}</button>
              ))}
            </div>
          </Field>
          <div style={grid2}>
            <Field title="Follow-up am"><input type="date" value={f.followUp} onChange={set('followUp')} style={input} /></Field>
            {owner || <div />}
          </div>
          <Field title="Notiz"><textarea value={f.notes} onChange={set('notes')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field>
        </>}

        {error && <p style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{error}</p>}
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: '#fff', cursor: 'pointer' }}>Abbrechen</button>
        <button type="submit" disabled={pending} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: pending ? '#9ca3af' : '#2563eb', color: '#fff' }}>{pending ? 'Speichern…' : 'Anlegen'}</button>
      </div>
    </form>
  )
}

// Create dialog for any record type. navigate: open the new record afterwards (global "+ Neu").
export function CreateDialog({ kind, open, onClose, preset = {}, navigate = false }: { kind: CreateKind; open: boolean; onClose: () => void; preset?: Preset; navigate?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(cache)
  useEffect(() => {
    if (!open) return
    let alive = true
    getPickerData().then(d => { cache = d; if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [open])
  if (!open) return null
  if (kind === 'task') return data ? <TaskDialog open onClose={onClose} data={data as TaskPickData} link={preset.companyId || preset.personId || preset.dealId ? { companyId: preset.companyId, personId: preset.personId, opportunityId: preset.dealId } : undefined} /> : null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, textAlign: 'left' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{KINDS.find(k => k.kind === kind)?.icon} {TITLES[kind]}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>
        {data
          ? <Form kind={kind} data={data} preset={preset} onCancel={onClose} onDone={href => { onClose(); if (navigate && href) router.push(href); else router.refresh() }} />
          : <p style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Lädt …</p>}
      </div>
    </div>
  )
}

// Small "+ Deal" / "+ Kontakt" button for cards and headers
export function CreateButton({ kind, preset, label, primary, navigate }: { kind: CreateKind; preset?: Preset; label?: string; primary?: boolean; navigate?: boolean }) {
  const [open, setOpen] = useState(false)
  const text = label ?? `+ ${KINDS.find(k => k.kind === kind)?.label}`
  return (
    <>
      <button onClick={() => setOpen(true)} style={primary
        ? { padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer' }
        : { padding: '4px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: 7, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
        {text}
      </button>
      <CreateDialog kind={kind} open={open} onClose={() => setOpen(false)} preset={preset} navigate={navigate} />
    </>
  )
}

// Global "+ Neu" menu (sidebar)
export function NewMenu() {
  const [menu, setMenu] = useState(false)
  const [kind, setKind] = useState<CreateKind | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])
  useEffect(() => { getPickerData().then(d => { cache = d }).catch(() => {}) }, [])   // warm the pickers

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setMenu(m => !m)} style={{ width: '100%', padding: '9px 12px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Neu
      </button>
      {menu && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 4, zIndex: 50 }}>
          {KINDS.map(k => (
            <button key={k.kind} onClick={() => { setMenu(false); setKind(k.kind) }}
              style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '8px 10px', borderRadius: 7, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 15 }}>{k.icon}</span>
              <span><span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827' }}>{k.label}</span><span style={{ fontSize: 11, color: '#9ca3af' }}>{k.hint}</span></span>
            </button>
          ))}
        </div>
      )}
      {kind && <CreateDialog kind={kind} open onClose={() => setKind(null)} navigate />}
    </div>
  )
}
