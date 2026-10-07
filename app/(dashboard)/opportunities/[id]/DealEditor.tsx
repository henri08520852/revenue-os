'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const STAGES = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation', 'won', 'lost'] as const
type Stage = typeof STAGES[number]

interface Props {
  oppId: string
  initialNextStep: string | null
  initialNextStepDue: string | null
  initialValue: number | null
  currentStage: Stage
  prevStage: Stage | null
  nextStage: Stage | null
  stageLabels: Record<Stage, string>
}

export default function DealEditor({
  oppId, initialNextStep, initialNextStepDue, initialValue,
  currentStage, prevStage, nextStage, stageLabels
}: Props) {
  const [nextStep, setNextStep] = useState(initialNextStep || '')
  const [nextStepDue, setNextStepDue] = useState(
    initialNextStepDue ? initialNextStepDue.slice(0, 10) : ''
  )
  const [value, setValue] = useState(initialValue?.toString() || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function save() {
    setSaving(true)
    await supabase.from('opportunities').update({
      next_step: nextStep || null,
      next_step_due_at: nextStepDue ? new Date(nextStepDue).toISOString() : null,
      value_eur: value ? parseFloat(value) : null,
    }).eq('id', oppId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function moveStage(stage: Stage) {
    await supabase.from('opportunities').update({ stage }).eq('id', oppId)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {prevStage && (
          <button onClick={() => moveStage(prevStage)}
            className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            ← {stageLabels[prevStage]}
          </button>
        )}
        {nextStage && (
          <button onClick={() => moveStage(nextStage)}
            className="flex-1 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700">
            {stageLabels[nextStage]} →
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Naechster Schritt</label>
        <input value={nextStep} onChange={e => setNextStep(e.target.value)}
          placeholder="Demo vereinbaren"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Faellig am</label>
        <input type="date" value={nextStepDue} onChange={e => setNextStepDue(e.target.value)}
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
    </div>
  )
}
