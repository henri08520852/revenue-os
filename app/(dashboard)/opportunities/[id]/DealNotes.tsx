'use client'

import { useState, useTransition } from 'react'
import { addOpportunityNote, deleteOpportunityNote } from './actions'

type Note = { id: string; summary: string | null; occurred_at: string; created_by: string | null }

export default function DealNotes({ oppId, notes, legacyNote }: { oppId: string; notes: Note[]; legacyNote: string | null }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function add() {
    setError(null)
    startTransition(async () => {
      const res = await addOpportunityNote(oppId, text)
      if (res.error) setError(res.error)
      else setText('')
    })
  }

  function remove(id: string) {
    if (!confirm('Notiz löschen?')) return
    startTransition(async () => {
      const res = await deleteOpportunityNote(oppId, id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Notizen</h2>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) add() }}
        placeholder="Was ist passiert? Einwände, Budget, Timing… (⌘/Strg + Enter speichert)"
        rows={3}
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', color: '#111827' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button onClick={add} disabled={!text.trim() || pending} style={{
          padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6,
          background: text.trim() && !pending ? '#111827' : '#e5e7eb', color: text.trim() && !pending ? 'white' : '#9ca3af',
          cursor: text.trim() && !pending ? 'pointer' : 'default',
        }}>
          {pending ? 'Speichern…' : 'Notiz speichern'}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {notes.map(n => (
          <div key={n.id} style={{ padding: '10px 12px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fef3c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#92400e' }}>
                {new Date(n.occurred_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {n.created_by ? ` · ${n.created_by}` : ''}
              </span>
              <button onClick={() => remove(n.id)} title="Löschen" style={{ background: 'none', border: 'none', color: '#d6b25e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{n.summary}</p>
          </div>
        ))}
        {legacyNote && (
          <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Ursprüngliche Notiz (z.B. aus dem Lead)</p>
            <p style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{legacyNote}</p>
          </div>
        )}
        {notes.length === 0 && !legacyNote && (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>Noch keine Notizen</p>
        )}
      </div>
    </div>
  )
}
