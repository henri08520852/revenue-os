'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { updateOpportunityStage } from './actions'

const STAGES = [
  { key: 'discovery',     label: 'Discovery',      color: '#94a3b8' },
  { key: 'erstgespraech', label: 'Erstgespräch',   color: '#818cf8' },
  { key: 'evaluation',    label: 'Evaluation',      color: '#60a5fa' },
  { key: 'proposal',      label: 'Proposal',        color: '#fbbf24' },
  { key: 'negotiation',   label: 'Verhandlung',     color: '#f97316' },
]

type Opp = {
  id: string
  name: string
  stage: string
  value_eur: number | null
  owner_name?: string | null
  companies: { id: string; name: string; domain?: string; account_score?: number; signal_score?: number } | null
  next_step?: string | null
  next_step_due_at?: string | null
}

function DraggableCard({ opp, isDragging }: { opp: Opp; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: opp.id })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <OppCard opp={opp} />
    </div>
  )
}

function OppCard({ opp }: { opp: Opp }) {
  const isOverdue = opp.next_step_due_at && new Date(opp.next_step_due_at) < new Date()
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <Link href={`/opportunities/${opp.id}`} style={{ textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
          <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>
            {opp.companies?.name || opp.name || '—'}
          </p>
          {opp.owner_name && (
            <span title={`Owner: ${opp.owner_name}`} style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>
              {opp.owner_name}
            </span>
          )}
        </div>
        {opp.value_eur ? (
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            €{opp.value_eur.toLocaleString('de-DE')}
          </p>
        ) : null}
        {opp.next_step && (
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            → {opp.next_step}
          </p>
        )}
        {opp.next_step_due_at && (
          <p style={{ fontSize: 11, color: isOverdue ? '#ef4444' : '#9ca3af', marginTop: 2, fontWeight: isOverdue ? 600 : 400 }}>
            {isOverdue ? '⚠ ' : ''}
            {new Date(opp.next_step_due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
          </p>
        )}
      </Link>
    </div>
  )
}

function DroppableColumn({ stage, opps }: { stage: typeof STAGES[0]; opps: Opp[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })
  const total = opps.reduce((s, o) => s + (o.value_eur || 0), 0)

  return (
    <div style={{
      flexShrink: 0,
      width: 200,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Column header */}
      <div style={{
        borderTop: `3px solid ${stage.color}`,
        background: 'white',
        border: `1px solid #e5e7eb`,
        borderTopColor: stage.color,
        borderRadius: '0 0 8px 8px',
        padding: '10px 12px',
        marginBottom: 8,
        borderTopWidth: 3,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{stage.label}</span>
          <span style={{
            fontSize: 11,
            background: '#f3f4f6',
            color: '#6b7280',
            borderRadius: 12,
            padding: '1px 7px',
            fontWeight: 500,
          }}>{opps.length}</span>
        </div>
        {total > 0 && (
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            €{total.toLocaleString('de-DE')}
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          minHeight: 120,
          background: isOver ? '#eff6ff' : 'transparent',
          borderRadius: 8,
          padding: 4,
          transition: 'background 0.15s',
          border: isOver ? '2px dashed #93c5fd' : '2px dashed transparent',
        }}
      >
        {opps.map(opp => (
          <DraggableCard key={opp.id} opp={opp} />
        ))}
        {opps.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#d1d5db', fontSize: 12 }}>
            Keine Deals
          </div>
        )}
      </div>
    </div>
  )
}

function ListView({ opps }: { opps: Opp[] }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unternehmen</th>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phase</th>
            <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wert</th>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Step</th>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fällig</th>
          </tr>
        </thead>
        <tbody>
          {opps.map((opp, idx) => {
            const stage = STAGES.find(s => s.key === opp.stage)
            const isOverdue = opp.next_step_due_at && new Date(opp.next_step_due_at) < new Date()
            return (
              <tr key={opp.id} style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : undefined }}>
                <td style={{ padding: '11px 16px' }}>
                  <Link href={`/opportunities/${opp.id}`} style={{ fontWeight: 600, color: '#111827', textDecoration: 'none', fontSize: 13 }}>
                    {opp.companies?.name || opp.name || '—'}
                  </Link>
                  {opp.companies?.domain && (
                    <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{opp.companies.domain}</p>
                  )}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  {stage && (
                    <span style={{
                      display: 'inline-block',
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: stage.color + '22',
                      color: stage.color,
                      border: `1px solid ${stage.color}55`,
                    }}>
                      {stage.label}
                    </span>
                  )}
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 13 }}>
                  {opp.value_eur ? `€${opp.value_eur.toLocaleString('de-DE')}` : '—'}
                </td>
                <td style={{ padding: '11px 16px', color: '#6b7280', fontSize: 12, maxWidth: 200 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opp.next_step || '—'}
                  </span>
                </td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: isOverdue ? '#ef4444' : '#9ca3af', fontWeight: isOverdue ? 600 : 400 }}>
                  {opp.next_step_due_at
                    ? new Date(opp.next_step_due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                    : '—'}
                </td>
              </tr>
            )
          })}
          {opps.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Keine Deals in der Pipeline
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function PipelineClient({ initialOpps }: { initialOpps: Opp[] }) {
  const [opps, setOpps] = useState<Opp[]>(initialOpps)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oppId = active.id as string
    const newStage = over.id as string
    if (!STAGES.find(s => s.key === newStage)) return

    // Optimistic update
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, stage: newStage } : o))

    startTransition(async () => {
      try {
        await updateOpportunityStage(oppId, newStage)
      } catch {
        // Revert on error
        setOpps(initialOpps)
      }
    })
  }

  const activeOpp = activeId ? opps.find(o => o.id === activeId) : null
  const activeOpps = opps.filter(o => STAGES.some(s => s.key === o.stage))

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* View toggle */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 8 }}>
        <button
          onClick={() => setView('board')}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid',
            cursor: 'pointer',
            background: view === 'board' ? '#111827' : 'white',
            color: view === 'board' ? 'white' : '#6b7280',
            borderColor: view === 'board' ? '#111827' : '#e5e7eb',
          }}
        >
          ⊞ Board
        </button>
        <button
          onClick={() => setView('list')}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid',
            cursor: 'pointer',
            background: view === 'list' ? '#111827' : 'white',
            color: view === 'list' ? 'white' : '#6b7280',
            borderColor: view === 'list' ? '#111827' : '#e5e7eb',
          }}
        >
          ☰ Liste
        </button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>
          {activeOpps.length} aktive Deals
        </span>
      </div>

      {view === 'list' ? (
        <ListView opps={activeOpps} />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{
            display: 'flex',
            gap: 16,
            overflowX: 'auto',
            paddingBottom: 16,
            alignItems: 'flex-start',
          }}>
            {STAGES.map(stage => (
              <DroppableColumn
                key={stage.key}
                stage={stage}
                opps={opps.filter(o => o.stage === stage.key)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOpp ? <OppCard opp={activeOpp} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
