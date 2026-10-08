'use client'

import { useState, useTransition } from 'react'
import { addCompanyNote } from './actions'

interface Props {
  companyId: string
  projectId: string
}

export default function QuickNoteButton({ companyId }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    setText('')
    setError(null)
  }

  function save() {
    if (!text.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await addCompanyNote(companyId, text)
      if (res.error) setError(res.error)
      else close()
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm"
      >
        📝 Notiz
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 top-full mt-2 z-20 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
                if (e.key === 'Escape') close()
              }}
              placeholder="Notiz eingeben…"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">⌘/Strg + Enter</span>
              <div className="flex gap-2">
                <button onClick={close} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Abbrechen</button>
                <button
                  onClick={save}
                  disabled={pending || !text.trim()}
                  className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-all"
                >
                  {pending ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
