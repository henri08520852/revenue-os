'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  projectId: string
  currentFollowUp?: string | null  // ISO date string
}

export default function FollowUpButton({ companyId, projectId, currentFollowUp }: Props) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(
    currentFollowUp
      ? new Date(currentFollowUp).toISOString().split('T')[0]
      : nextWorkday()
  )
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const isOverdue = currentFollowUp && new Date(currentFollowUp) < new Date()
  const isDueToday = currentFollowUp && isSameDay(new Date(currentFollowUp), new Date())

  async function save() {
    setLoading(true)
    try {
      await fetch(`/api/companies/${companyId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, note, projectId }),
      })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function clear() {
    setLoading(true)
    try {
      await fetch(`/api/companies/${companyId}/follow-up`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const label = currentFollowUp
    ? isOverdue
      ? `⏰ Überfällig: ${formatDate(currentFollowUp)}`
      : isDueToday
        ? '⏰ Heute fällig'
        : `🗓 ${formatDate(currentFollowUp)}`
    : '🗓 Follow-up'

  const btnStyle = isOverdue
    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
    : isDueToday
      ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg transition-all shadow-sm ${btnStyle}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-start gap-2 p-3 bg-white border border-blue-200 rounded-xl shadow-sm">
      <div className="flex-1 space-y-2">
        <label className="text-xs font-medium text-gray-500">Follow-up Datum</label>
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
          placeholder="Kontext (optional)"
          className="block w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1 pt-5">
        <button
          onClick={save}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          Setzen
        </button>
        {currentFollowUp && (
          <button
            onClick={clear}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700"
          >
            Löschen
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600"
        >
          Abbruch
        </button>
      </div>
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
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
