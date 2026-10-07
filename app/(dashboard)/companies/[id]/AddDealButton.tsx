'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  companyName: string
  projectId: string
}

export default function AddDealButton({ companyId, companyName, projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: `${companyName} — HireFlow`,
    stage: 'discovery' as const,
    value: '',
    nextStep: '',
    nextStepDate: '',
  })
  const router = useRouter()
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.from('opportunities').insert({
      project_id: projectId,
      company_id: companyId,
      name: form.name,
      stage: form.stage,
      value_eur: form.value ? parseFloat(form.value) : null,
      next_step: form.nextStep || null,
      next_step_due_at: form.nextStepDate ? new Date(form.nextStepDate).toISOString() : null,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setOpen(false)
      router.refresh()
    }
  }

  const STAGES = [
    { value: 'discovery',     label: 'Discovery' },
    { value: 'erstgespraech', label: 'Erstgespräch' },
    { value: 'evaluation',    label: 'Evaluation' },
    { value: 'proposal',      label: 'Proposal' },
    { value: 'negotiation',   label: 'Verhandlung' },
  ]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm"
      >
        💼 Deal anlegen
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Deal anlegen</h2>
            </div>

            <form onSubmit={submit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Deal-Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Stage</label>
                <div className="flex gap-2 flex-wrap">
                  {STAGES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, stage: s.value as any }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        form.stage === s.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Potenzial (€/Jahr, optional)</label>
                <input
                  type="number"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="5000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Nächster Schritt</label>
                <input
                  value={form.nextStep}
                  onChange={e => setForm(f => ({ ...f, nextStep: e.target.value }))}
                  placeholder="Demo vereinbaren"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Fällig am</label>
                <input
                  type="date"
                  value={form.nextStepDate}
                  onChange={e => setForm(f => ({ ...f, nextStepDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {loading ? 'Speichern…' : 'Deal anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
