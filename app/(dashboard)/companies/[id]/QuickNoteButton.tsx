'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  projectId: string
}

export default function QuickNoteButton({ companyId, projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function save() {
    if (!text.trim()) return
    setLoading(true)
    try {
      await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          project_id: projectId,
          activity_type: 'note',
          summary: text.trim(),
          occurred_at: new Date().toISOString(),
          source: 'manual',
        }),
      })
      setText('')
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm"
      >
        📝 Notiz
      </button>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 relative">
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
            if (e.key === 'Escape') { setOpen(false); setText('') }
          }}
          placeholder="Notiz eingeben… (⌘↵ speichern)"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={save}
          disabled={loading || !text.trim()}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-all"
        >
          {loading ? '…' : 'Speichern'}
        </button>
        <button
          onClick={() => { setOpen(false); setText('') }}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          Abbruch
        </button>
      </div>
    </div>
  )
}
