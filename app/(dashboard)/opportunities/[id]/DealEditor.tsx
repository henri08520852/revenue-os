'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { OPPORTUNITY_STAGES } from '@/lib/stages'
import { setOpportunityStage } from './actions'
import CloseDealDialog from '@/components/CloseDealDialog'

const STAGES = OPPORTUNITY_STAGES
type Stage = typeof STAGES[number]

interface Props {
  oppId: string
  initialNextStep?: string | null
  initialNextStepDue?: string | null
  initialValue: number | null
  initialName?: string | null
  currentStage: Stage
  prevStage: Stage | null
  nextStage: Stage | null
  stageLabels: Record<Stage, string>
}

export default function DealEditor({
  oppId, initialNextStep, initialNextStepDue, initialValue, initialName,
  currentStage, prevStage, nextStage, stageLabels
}: Props) {
  const [value, setValue] = useState(initialValue?.toString() || '')
  const [name, setName] = useState(initialName || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [closing, setClosing] = useState<'won' | 'lost' | null>(null)
  const isClosed = currentStage === 'won' || currentStage === 'lost'
  const router = useRouter()
  const supabase = createClient()

  async function save() {
    setSaving(true)
    // next_step / next_step_due_at are derived from the deal's earliest open task (migration 022)
    await (supabase as any).from('opportunities').update({
      value_eur: value ? parseFloat(value) : null,
      ...(name.trim() ? { name: name.trim() } : {}),
    }).eq('id', oppId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function moveStage(stage: Stage) {
    setMoving(true)
    setStageError(null)
    const res = await setOpportunityStage(oppId, stage)
    setMoving(false)
    if (res.error) setStageError(res.error)
    else router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2" style={{ opacity: moving ? 0.5 : 1 }}>
        {isClosed && (
          <button onClick={() => moveStage('negotiation')} disabled={moving}
            className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            ↺ Wieder öffnen
          </button>
        )}
        {!isClosed && prevStage && (
          <button onClick={() => moveStage(prevStage)}
            className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            ← {stageLabels[prevStage]}
          </button>
        )}
        {!isClosed && nextStage && (
          <button onClick={() => moveStage(nextStage)}
            className="flex-1 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700">
            {stageLabels[nextStage]} →
          </button>
        )}
      </div>
      {!isClosed && (
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <button onClick={() => setClosing('won')} disabled={moving}
            style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', borderRadius: 8, cursor: 'pointer' }}>
            ✓ Gewonnen
          </button>
          <button onClick={() => setClosing('lost')} disabled={moving}
            style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', borderRadius: 8, cursor: 'pointer' }}>
            ✕ Verloren
          </button>
        </div>
      )}
      {stageError && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{stageError}</p>}
      {closing && <CloseDealDialog oppId={oppId} dealName={name || 'Deal'} stage={closing} onClose={() => setClosing(null)} onDone={() => router.refresh()} />}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Deal-Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Wert (EUR/Jahr)</label>
        <input type="number" value={value} onChange={e => setValue(e.target.value)}
          placeholder="5000"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      <button onClick={save} disabled={saving}
        className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
        {saving ? 'Speichern...' : saved ? 'Gespeichert!' : 'Speichern'}
      </button>
      <p style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
        Der nächste Schritt ist die nächste offene Aufgabe dieses Deals – unter „Anstehend“ anlegen oder abhaken.
      </p>
    </div>
  )
}
