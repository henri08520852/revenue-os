'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type ActivityType = 'call' | 'email' | 'linkedin' | 'note' | 'meeting'

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: string }[] = [
  { value: 'call',     label: 'Anruf',         icon: '📞' },
  { value: 'email',    label: 'E-Mail',         icon: '✉️' },
  { value: 'linkedin', label: 'LinkedIn',       icon: '💼' },
  { value: 'meeting',  label: 'Meeting',        icon: '🤝' },
  { value: 'note',     label: 'Notiz',          icon: '📝' },
]

interface Props {
  companyId: string
  projectId: string
}

export default function LogActivityButton({ companyId, projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    type: 'call' as ActivityType,
    direction: 'outbound' as 'outbound' | 'inbound',
    summary: '',
    outcome: '',
    nextStep: '',
    date: new Date().toISOString().split('T')[0],
  })
  const router = useRouter()
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.from('activities').insert({
      project_id: projectId,
      company_id: companyId,
      activity_type: form.type,
      direction: form.type === 'note' ? null : form.direction,
      channel: form.type,
      summary: form.summary,
      outcome: form.outcome || null,
      next_step_detected: form.nextStep || null,
      occurred_at: new Date(form.date).toISOString(),
      source: 'manual',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setOpen(false)
      setForm({
        type: 'call',
        direction: 'outbound',
        summary: '',
        outcome: '',
        nextStep: '',
        date: new Date().toISOString().split('T')[0],
      })
      router.refresh()
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
      >
        <span>+</span> Aktivität
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
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Aktivität loggen</h2>
            </div>

            <form onSubmit={submit} className="px-6 py-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Typ</label>
                <div className="flex gap-2 flex-wrap">
                  {ACTIVITY_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        form.type === t.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction — not for notes */}
              {form.type !== 'note' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Richtung</label>
                  <div className="flex gap-2">
                    {(['outbound', 'inbound'] as const).map(dir => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, direction: dir }))}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                          form.direction === dir
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {dir === 'outbound' ? '↗ Outbound' : '↙ Inbound'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Datum</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
                  {form.type === 'note' ? 'Notiz' : 'Zusammenfassung'}
                </label>
                <textarea
                  value={form.summary}
                  onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                  required
                  rows={3}
                  placeholder={
                    form.type === 'call' ? 'Kurze Zusammenfassung des Gesprächs…' :
                    form.type === 'email' ? 'Betreff / Inhalt der E-Mail…' :
                    form.type === 'linkedin' ? 'Was wurde besprochen / gesendet?…' :
                    form.type === 'meeting' ? 'Meeting-Zusammenfassung…' :
                    'Notiz…'
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                />
              </div>

              {/* Outcome */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Ergebnis (optional)</label>
                <input
                  value={form.outcome}
                  onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
                  placeholder="z.B. Demo vereinbart, kein Interesse, Rückruf nächste Woche…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* Next step */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Nächster Schritt (optional)</label>
                <input
                  value={form.nextStep}
                  onChange={e => setForm(f => ({ ...f, nextStep: e.target.value }))}
                  placeholder="z.B. Demo am 15.10. um 10 Uhr"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
            </form>

            {/* Footer */}
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
                disabled={loading || !form.summary.trim()}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {loading ? 'Speichern…' : 'Loggen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
