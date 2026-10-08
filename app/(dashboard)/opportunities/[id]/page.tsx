import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DealEditor from './DealEditor'
import { ACTIVE_OPPORTUNITY_STAGES, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'
import DealContacts from './DealContacts'
import DealNotes from './DealNotes'
import DealOwner from './DealOwner'
import { getTeamContext } from '@/lib/team'

const STAGES = OPPORTUNITY_STAGES
type Stage = typeof STAGES[number]

const STAGE_LABELS = OPPORTUNITY_STAGE_LABELS

const STAGE_COLORS: Record<Stage, string> = {
  discovery:     'bg-gray-100 text-gray-600',
  erstgespraech: 'bg-indigo-100 text-indigo-700',
  evaluation:    'bg-blue-100 text-blue-700',
  proposal:      'bg-yellow-100 text-yellow-700',
  negotiation:   'bg-orange-100 text-orange-700',
  won:           'bg-green-100 text-green-700',
  lost:          'bg-gray-100 text-gray-500',
}

const ACTIVITY_ICONS: Record<string, string> = {
  call:     '📞',
  email:    '✉️',
  linkedin: '💼',
  meeting:  '🤝',
  note:     '📝',
}

export default async function DealPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: oppData, error } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, domain, account_score, signal_score)')
    .eq('id', params.id)
    .single()

  if (error || !oppData) notFound()
  const opp = oppData as any

  const company = (opp as any).companies
  const stage = opp.stage as Stage
  // Prev/next walk the open stages only; won/lost have their own buttons in DealEditor
  const activeIdx = ACTIVE_OPPORTUNITY_STAGES.indexOf(stage)
  const prevStage = activeIdx > 0 ? ACTIVE_OPPORTUNITY_STAGES[activeIdx - 1] : null
  const nextStage = activeIdx >= 0 && activeIdx < ACTIVE_OPPORTUNITY_STAGES.length - 1 ? ACTIVE_OPPORTUNITY_STAGES[activeIdx + 1] : null

  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('company_id', company?.id)
    .order('occurred_at', { ascending: false })
    .limit(20)

  const db = supabase as any
  const { team } = await getTeamContext()
  const [{ data: contacts }, { data: companyPeople }, { data: history }, { data: notes }] = await Promise.all([
    db.from('opportunity_contacts')
      .select('id, role, created_at, person:people(id, full_name, first_name, last_name, job_title, email)')
      .eq('opportunity_id', opp.id)
      .order('created_at', { ascending: true }),
    company?.id
      ? db.from('people')
          .select('id, full_name, first_name, last_name, job_title, email')
          .eq('company_id', company.id)
          .order('last_name', { ascending: true })
      : Promise.resolve({ data: [] }),
    db.from('opportunity_stage_history')
      .select('id, from_stage, to_stage, changed_at')
      .eq('opportunity_id', opp.id)
      .order('changed_at', { ascending: false }),
    db.from('activities')
      .select('id, summary, occurred_at, created_by')
      .eq('opportunity_id', opp.id)
      .eq('activity_type', 'note')
      .order('occurred_at', { ascending: false }),
  ])

  // Deal notes have their own card — keep them out of the company timeline
  const timeline = (activities || []).filter((a: any) => !(a.activity_type === 'note' && a.opportunity_id === opp.id))
  const stageLabel = (s: string | null) => (s && (STAGE_LABELS as Record<string, string>)[s]) || s || '—'

  const now = new Date()
  const isOverdue = opp.next_step_due_at
    ? new Date(opp.next_step_due_at).getTime() < now.getTime()
    : false

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/pipeline" className="hover:text-gray-600">Pipeline</Link>
        <span>›</span>
        {company && (
          <>
            <Link href={'/companies/' + company.id} className="hover:text-gray-600">{company.name}</Link>
            <span>›</span>
          </>
        )}
        <span className="text-gray-700 truncate max-w-xs">{opp.name || 'Deal'}</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {opp.name || company?.name || '—'}
              </h1>
              <span className={`text-sm font-medium px-3 py-1 rounded-full shrink-0 ${STAGE_COLORS[stage]}`}>
                {STAGE_LABELS[stage]}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {company && (
                <Link href={'/companies/' + company.id}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                  {company.name}
                </Link>
              )}
              <DealOwner oppId={opp.id} ownerId={opp.owner_id ?? null} team={team} />
            </div>
            {opp.value_eur && (
              <p className="mt-3 text-3xl font-bold text-gray-900">
                {opp.value_eur.toLocaleString('de-DE')} EUR
              </p>
            )}
          </div>
          {company && (
            <div className="flex gap-4 shrink-0">
              <div className="text-center">
                <p className={'text-2xl font-bold ' + (company.account_score >= 70 ? 'text-green-600' : company.account_score >= 40 ? 'text-yellow-600' : 'text-gray-400')}>
                  {company.account_score || 0}
                </p>
                <p className="text-xs text-gray-400">Account</p>
              </div>
              <div className="text-center">
                <p className={'text-2xl font-bold ' + (company.signal_score >= 70 ? 'text-green-600' : company.signal_score >= 40 ? 'text-yellow-600' : 'text-gray-400')}>
                  {company.signal_score || 0}
                </p>
                <p className="text-xs text-gray-400">Signal</p>
              </div>
            </div>
          )}
        </div>
        {opp.next_step && (
          <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg ${isOverdue ? 'bg-red-50 border border-red-100' : 'bg-blue-50 border border-blue-100'}`}>
            <span className="text-base shrink-0">{isOverdue ? '⚠️' : '📌'}</span>
            <div>
              <p className={`text-sm font-medium ${isOverdue ? 'text-red-700' : 'text-blue-700'}`}>
                {opp.next_step}
              </p>
              {opp.next_step_due_at && (
                <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>
                  {new Date(opp.next_step_due_at).toLocaleDateString('de-DE', {
                    weekday: 'long', day: '2-digit', month: 'long'
                  })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <DealNotes oppId={opp.id} notes={notes || []} legacyNote={opp.notes || null} />
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Aktivitaeten {company?.name && <span className="font-normal text-gray-400">({company.name})</span>}
              <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-2">
                {timeline.length}
              </span>
            </h2>
            {timeline.length === 0 && (
              <p className="text-sm text-gray-400 py-8 text-center">Noch keine Aktivitaeten</p>
            )}
            <div className="space-y-3">
              {timeline.map((act: any) => (
                <div key={act.id} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="text-base shrink-0 pt-0.5">{ACTIVITY_ICONS[act.activity_type] || '•'}</div>
                  <div className="text-xs text-gray-400 w-14 shrink-0 pt-0.5">
                    {new Date(act.occurred_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{act.summary || act.activity_type}</p>
                    {act.outcome && <p className="text-xs text-gray-500 mt-0.5">→ {act.outcome}</p>}
                    {act.next_step_detected && <p className="text-xs text-blue-600 mt-0.5">📌 {act.next_step_detected}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Deal bearbeiten</h3>
            <DealEditor
              oppId={opp.id}
              initialNextStep={opp.next_step || null}
              initialNextStepDue={opp.next_step_due_at || null}
              initialValue={opp.value_eur || null}
              currentStage={stage}
              prevStage={prevStage}
              nextStage={nextStage}
              stageLabels={STAGE_LABELS}
            />
          </div>
          <DealContacts
            oppId={opp.id}
            companyId={company?.id ?? null}
            contacts={contacts || []}
            companyPeople={companyPeople || []}
          />
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Stage-Verlauf</h3>
            {!history?.length ? (
              <p style={{ fontSize: 12, color: '#9ca3af' }}>Noch keine Stage-Wechsel erfasst</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((h: any, i: number) => {
                  // history is newest first: time in this stage runs until the next (newer) change
                  const until = i === 0 ? new Date().toISOString() : history[i - 1].changed_at
                  const days = Math.max(0, Math.floor((new Date(until).getTime() - new Date(h.changed_at).getTime()) / 86400000))
                  return (
                    <div key={h.id} style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: i === 0 ? '#2563eb' : '#d1d5db' }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, color: '#111827' }}>
                          {h.from_stage ? <>{stageLabel(h.from_stage)} → <b>{stageLabel(h.to_stage)}</b></> : <>Angelegt in <b>{stageLabel(h.to_stage)}</b></>}
                        </p>
                        <p style={{ fontSize: 11, color: '#9ca3af' }}>
                          {new Date(h.changed_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          {' · '}{i === 0 ? `seit ${days} Tagen` : `${days} Tage`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Erstellt</dt>
                <dd className="text-gray-700">
                  {new Date(opp.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </dd>
              </div>
              {(opp.won_at || opp.lost_at) && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Abgeschlossen</dt>
                  <dd className="text-gray-700">
                    {new Date(opp.won_at || opp.lost_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {company && (
            <Link href={'/companies/' + company.id}
              className="block text-center py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              → {company.name} oeffnen
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
