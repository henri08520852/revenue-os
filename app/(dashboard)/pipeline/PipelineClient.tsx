'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { updateOpportunityStage } from './actions'

const STAGES = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation', 'won', 'lost'] as const
type Stage = typeof STAGES[number]

const ACTIVE_STAGES: Stage[] = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation']

const STAGE_LABELS: Record<Stage, string> = {
  discovery: 'Discovery', erstgespraech: 'Erstgespräch', evaluation: 'Evaluation',
  proposal: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren',
}

const STAGE_COLOR: Record<Stage, string> = {
  discovery: '#9ca3af', erstgespraech: '#818cf8', evaluation: '#60a5fa',
  proposal: '#facc15', negotiation: '#fb923c', won: '#22c55e', lost: '#d1d5db',
}

function groupByStage(opps: any[]): Record<Stage, any[]> {
  const map: Record<Stage, any[]> = {
    discovery: [], erstgespraech: [], evaluation: [], proposal: [],
    negotiation: [], won: [], lost: [],
  }
  for (const o of opps) {
    if (map[o.stage as Stage]) map[o.stage as Stage].push(o)
  }
  return map
}

// ── Draggable Card ──────────────────────────────────────────────
function DraggableCard({ opp }: { opp: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <OppCard opp={opp} dragProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

// ── Card UI ─────────────────────────────────────────────────────
function OppCard({ opp, dragProps }: { opp: any; dragProps?: any }) {
  const company = opp.companies
  const isOverdue = opp.next_step_due_at && new Date(opp.next_step_due_at) < new Date()
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 ${isOverdue ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/companies/${company?.id}`}
          className="text-sm font-semibold text-gray-900 hover:text-blue-600 leading-snug truncate flex-1">
          {company?.name || '—'}
        </Link>
        {/* Drag handle */}
        <span {...dragProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0 mt-0.5 select-none">
          ⠿
        </span>
      </div>
      {company?.domain && <p className="text-xs text-gray-400 mt-0.5 truncate">{company.domain}</p>}
      <div className="flex items-center gap-2 mt-2">
        {opp.value_eur && (
          <span className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
            €{opp.value_eur.toLocaleString('de-DE')}
          </span>
        )}
        {(company?.signal_score ?? 0) >= 50 && (
          <span className="text-xs text-orange-500">🔥 {company.signal_score}</span>
        )}
      </div>
      {opp.next_step && (
        <p className="text-xs text-gray-500 mt-1.5 truncate">→ {opp.next_step}</p>
      )}
      {opp.next_step_due_at && (
        <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {isOverdue ? '⚠ ' : '📅 '}
          {new Date(opp.next_step_due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
        </p>
      )}
    </div>
  )
}

// ── Droppable Column ─────────────────────────────────────────────
function DroppableColumn({ stage, opps }: { stage: Stage; opps: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = opps.reduce((s, o) => s + (o.value_eur || 0), 0)
  return (
    <div style={{ flexShrink: 0, width: 230 }}>
      <div
        className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
        style={{ borderTop: `3px solid ${STAGE_COLOR[stage]}` }}
      >
        {/* Column header */}
        <div className="px-3 py-2.5 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{STAGE_LABELS[stage]}</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{opps.length}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {total > 0 ? `€${total.toLocaleString('de-DE')}` : '—'}
          </p>
        </div>
        {/* Drop zone */}
        <div
          ref={setNodeRef}
          className="p-2 flex flex-col gap-2 transition-colors"
          style={{
            minHeight: 120,
            background: isOver ? 'rgba(129,140,248,0.06)' : 'rgba(249,250,251,0.5)',
          }}
        >
          <SortableContext items={opps.map(o => o.id)} strategy={verticalListSortingStrategy}>
            {opps.map(opp => <DraggableCard key={opp.id} opp={opp} />)}
          </SortableContext>
          {opps.length === 0 && !isOver && (
            <p className="text-xs text-gray-300 text-center py-6">Keine Deals</p>
          )}
          {isOver && (
            <div className="border-2 border-dashed border-indigo-300 rounded-lg h-16 flex items-center justify-center">
              <span className="text-xs text-indigo-400">Hier ablegen</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── List View ────────────────────────────────────────────────────
function ListView({ opps }: { opps: any[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            {['Unternehmen', 'Phase', 'Wert', 'Next Step', 'Fällig', 'Signal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {opps.map(opp => {
            const isOverdue = opp.next_step_due_at && new Date(opp.next_step_due_at) < new Date()
            return (
              <tr key={opp.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/companies/${opp.companies?.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                    {opp.companies?.name || '—'}
                  </Link>
                  <p className="text-xs text-gray-400">{opp.companies?.domain}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_COLOR[opp.stage as Stage] }} />
                    {STAGE_LABELS[opp.stage as Stage] || opp.stage}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-700">
                  {opp.value_eur ? `€${opp.value_eur.toLocaleString('de-DE')}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-48 truncate">{opp.next_step || '—'}</td>
                <td className={`px-4 py-3 text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                  {opp.next_step_due_at
                    ? new Date(opp.next_step_due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {(opp.companies?.signal_score ?? 0) >= 50
                    ? <span className="text-orange-500 font-semibold">🔥 {opp.companies.signal_score}</span>
                    : <span className="text-gray-400 text-xs">{opp.companies?.signal_score ?? '—'}</span>}
                </td>
              </tr>
            )
          })}
          {!opps.length && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">Keine Deals</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Client Component ────────────────────────────────────────
export default function PipelineClient({ initialOpps }: { initialOpps: any[] }) {
  const [view, setView] = useState<'board' | 'list'>('board')
  const [opps, setOpps] = useState(initialOpps)
  const [activeOpp, setActiveOpp] = useState<any | null>(null)
  const [, startTransition] = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const byStage = groupByStage(opps)

  function handleDragStart(event: DragStartEvent) {
    setActiveOpp(opps.find(o => o.id === event.active.id) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveOpp(null)
    if (!over) return
    const newStage = over.id as Stage
    if (!STAGES.includes(newStage)) return
    const opp = opps.find(o => o.id === active.id)
    if (!opp || opp.stage === newStage) return

    // Optimistic update
    setOpps(prev => prev.map(o => o.id === active.id ? { ...o, stage: newStage } : o))
    startTransition(() => {
      updateOpportunityStage(active.id as string, newStage).catch(() => {
        // Revert on error
        setOpps(prev => prev.map(o => o.id === active.id ? { ...o, stage: opp.stage } : o))
      })
    })
  }

  const activeStageOpps = ACTIVE_STAGES.flatMap(s => byStage[s])
  const totalPipeline = activeStageOpps.reduce((s, o) => s + (o.value_eur || 0), 0)

  return (
    <div>
      {/* Toolbar */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">{opps.length} Deals gesamt · €{totalPipeline.toLocaleString('de-DE')} Pipeline</p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            ☰ Liste
          </button>
          <button
            onClick={() => setView('board')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'board' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            ⊞ Board
          </button>
        </div>
      </div>

      {/* Views */}
      <div className="px-6 pb-6">
        {view === 'board' ? (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* Active stages */}
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16 }}>
              {ACTIVE_STAGES.map(stage => (
                <DroppableColumn key={stage} stage={stage} opps={byStage[stage]} />
              ))}
            </div>

            {/* Won / Lost */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              {(['won', 'lost'] as Stage[]).map(stage => (
                <div key={stage} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                  style={{ borderTop: `3px solid ${STAGE_COLOR[stage]}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{STAGE_LABELS[stage]}</h3>
                    <span className="text-xs text-gray-400">{byStage[stage].length} Deals</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900 mb-3">
                    €{byStage[stage].reduce((s, o) => s + (o.value_eur || 0), 0).toLocaleString('de-DE')}
                  </p>
                  {/* Drop zone for won/lost */}
                  <WonLostDropZone stage={stage} opps={byStage[stage]} />
                </div>
              ))}
            </div>

            <DragOverlay>
              {activeOpp ? <div style={{ transform: 'rotate(2deg)' }}><OppCard opp={activeOpp} /></div> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <ListView opps={[...ACTIVE_STAGES.flatMap(s => byStage[s]), ...byStage.won, ...byStage.lost]} />
        )}
      </div>
    </div>
  )
}

// ── Won/Lost accepts drops too ───────────────────────────────────
function WonLostDropZone({ stage, opps }: { stage: Stage; opps: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div ref={setNodeRef} className="space-y-1.5 min-h-8 rounded-lg transition-colors"
      style={{ background: isOver ? 'rgba(129,140,248,0.06)' : 'transparent' }}>
      {isOver && (
        <div className="border-2 border-dashed border-indigo-300 rounded-lg h-10 flex items-center justify-center mb-2">
          <span className="text-xs text-indigo-400">Hier ablegen</span>
        </div>
      )}
      <SortableContext items={opps.map(o => o.id)} strategy={verticalListSortingStrategy}>
        {opps.slice(0, 5).map(opp => (
          <div key={opp.id} className="flex items-center justify-between text-xs">
            <Link href={`/companies/${opp.companies?.id}`} className="text-gray-600 hover:text-blue-600 truncate max-w-36">
              {opp.companies?.name}
            </Link>
            <span className="text-gray-400 shrink-0 ml-2">
              {opp.value_eur ? `€${opp.value_eur.toLocaleString('de-DE')}` : '—'}
            </span>
          </div>
        ))}
      </SortableContext>
    </div>
  )
}
