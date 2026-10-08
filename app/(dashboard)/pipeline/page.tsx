import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FunnelBoard, { Show } from './FunnelBoard'
import { CreateButton } from '@/components/CreateRecord'
import { getTeamContext, memberName } from '@/lib/team'
import { ACTIVE_OPPORTUNITY_STAGES } from '@/lib/stages'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const ACTIVE_STAGES: string[] = ACTIVE_OPPORTUNITY_STAGES
const OPEN_LEAD = ['outreach', 'contacted', 'qualified']

type Search = { show?: string; owner?: string; closed?: string; focus?: string }

export default async function PipelinePage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient() as any
  const { me, team } = await getTeamContext()
  const show: Show = searchParams.show === 'leads' || searchParams.show === 'deals' ? searchParams.show : 'all'
  const closed = searchParams.closed === '1'
  const ownerFilter = searchParams.owner === 'me' ? me?.user_id : searchParams.owner

  // A converted lead lives on as its deal
  if (searchParams.focus) {
    const { data: f } = await supabase.from('leads').select('converted_to_opportunity_id').eq('id', searchParams.focus).maybeSingle()
    if (f?.converted_to_opportunity_id) redirect(`/opportunities/${f.converted_to_opportunity_id}`)
  }

  const [{ data: leads }, { data: opps }] = await Promise.all([
    supabase.from('leads')
      .select('*, company:companies(id, name, domain), person:people(id, full_name, first_name, last_name, job_title)')
      .eq('project_id', PROJECT_ID).neq('stage', 'converted')
      .order('next_follow_up_at', { ascending: true, nullsFirst: false }),
    supabase.from('opportunities')
      .select('id, name, stage, value_eur, owner_id, next_step, next_step_due_at, qualification, companies(id, name, domain)')
      .eq('project_id', PROJECT_ID)
      .order('value_eur', { ascending: false, nullsFirst: false }),
  ])

  const mine = (o: any) => !ownerFilter || o.owner_id === ownerFilter
  const allLeads = (leads || []).filter(mine).map((l: any) => ({ ...l, owner_name: memberName(team, l.owner_id) }))
  const allDeals = (opps || []).filter(mine).map((o: any) => ({ ...o, owner_name: memberName(team, o.owner_id) }))

  const openLeads = allLeads.filter((l: any) => OPEN_LEAD.includes(l.stage)).length
  const openDeals = allDeals.filter((o: any) => ACTIVE_STAGES.includes(o.stage))
  const pipelineTotal = openDeals.reduce((s: number, o: any) => s + (o.value_eur || 0), 0)
  const wonTotal = allDeals.filter((o: any) => o.stage === 'won').reduce((s: number, o: any) => s + (o.value_eur || 0), 0)

  const href = (p: Partial<Search>) => {
    const q = { show: show === 'all' ? undefined : show, owner: searchParams.owner, closed: closed ? '1' : undefined, ...p }
    const qs = Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')
    return `/pipeline${qs ? '?' + qs : ''}`
  }
  const seg = (active: boolean) => ({ fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 6, textDecoration: 'none', background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#6b7280', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' })
  const chip = (active: boolean) => ({ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, textDecoration: 'none', background: active ? '#111827' : '#f3f4f6', color: active ? '#fff' : '#374151' })

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ padding: '26px 32px 18px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Pipeline</h1>
            <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
              Vom ersten Kontakt bis zum Abschluss ·{' '}
              <Link href="/guide#leads" style={{ color: '#2563eb', textDecoration: 'none' }}>Wie funktioniert der Funnel?</Link>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center', textAlign: 'right' }}>
            <div><p style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>{openLeads}</p><p style={{ fontSize: 11, color: '#9ca3af' }}>Offene Leads</p></div>
            <div><p style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{openDeals.length}</p><p style={{ fontSize: 11, color: '#9ca3af' }}>Offene Deals</p></div>
            <div><p style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>€{pipelineTotal.toLocaleString('de-DE')}</p><p style={{ fontSize: 11, color: '#9ca3af' }}>Offenes Volumen</p></div>
            <div><p style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>€{wonTotal.toLocaleString('de-DE')}</p><p style={{ fontSize: 11, color: '#9ca3af' }}>Gewonnen</p></div>
            <div style={{ display: 'flex', gap: 8 }}><CreateButton kind="lead" /><CreateButton kind="deal" primary /></div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
            <Link href={href({ show: undefined })} style={seg(show === 'all')}>Alle</Link>
            <Link href={href({ show: 'leads' })} style={seg(show === 'leads')}>Leads</Link>
            <Link href={href({ show: 'deals' })} style={seg(show === 'deals')}>Deals</Link>
          </div>
          {team.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ key: '', label: 'Alle Owner' }, ...(me ? [{ key: 'me', label: 'Meine' }] : []), ...team.filter(m => m.user_id !== me?.user_id).map(m => ({ key: m.user_id, label: m.display_name }))].map(f => (
                <Link key={f.key || 'all'} href={href({ owner: f.key || undefined })} style={chip((searchParams.owner ?? '') === f.key)}>{f.label}</Link>
              ))}
            </div>
          )}
          <Link href={href({ closed: closed ? undefined : '1' })} style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
            {closed ? '☑' : '☐'} Abgeschlossene zeigen
          </Link>
        </div>
      </div>

      <FunnelBoard leads={allLeads} deals={allDeals} show={show} closed={closed} team={team} focusId={searchParams.focus ?? null} />
    </div>
  )
}
