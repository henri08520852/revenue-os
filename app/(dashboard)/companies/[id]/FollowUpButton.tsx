'use client'

import { useState, useTransition } from 'react'
import { clearCompanyFollowUp, setCompanyFollowUp } from './actions'

interface Props {
  companyId: string
  projectId: string
  currentFollowUp?: string | null  // ISO date string
}

export default function FollowUpButton({ companyId, currentFollowUp }: Props) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(
    currentFollowUp
      ? new Date(currentFollowUp).toISOString().split('T')[0]
      : nextWorkday()
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, startTransition] = useTransition()

  const isOverdue = currentFollowUp && new Date(currentFollowUp) < new Date()
  const isDueToday = currentFollowUp && isSameDay(new Date(currentFollowUp), new Date())

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else { setOpen(false); setNote('') }
    })
  }

  const save = () => run(() => setCompanyFollowUp(companyId, date, note))
  const clear = () => run(() => clearCompanyFollowUp(companyId))

  const label = currentFollowUp
    ? isOverdue
      ? `⏰ Überfällig: ${formatDate(currentFollowUp)}`
      : isDueToday
        ? '⏰ Heute fällig'
        : `⏰ ${formatDate(currentFollowUp)}`
    : '⏰ Erinnerung'

  const btnStyle = isOverdue
    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
    : isDueToday
      ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg transition-all shadow-sm ${btnStyle}`}
      >
        {label}
      </button>

      {open && (
      <>
      <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      <div className="absolute left-0 top-full mt-2 z-20 w-72 p-3 bg-white border border-gray-200 rounded-xl shadow-lg">
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-500">Erinnerung am</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="block w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Worum geht's? (optional)"
          className="block w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="flex items-center justify-between mt-3">
        {currentFollowUp ? (
          <button onClick={clear} disabled={loading} className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40">
            Entfernen
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={loading || !date}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? 'Speichern…' : 'Setzen'}
          </button>
        </div>
      </div>
      </div>
      </>
      )}
    </div>
  )
}

function nextWorkday(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
}
