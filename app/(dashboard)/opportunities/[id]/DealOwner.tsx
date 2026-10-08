'use client'

import { useState, useTransition } from 'react'
import { setOpportunityOwner } from './actions'

export default function DealOwner({ oppId, ownerId, team }: {
  oppId: string
  ownerId: string | null
  team: { user_id: string; display_name: string }[]
}) {
  const [value, setValue] = useState(ownerId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!team.length) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}>
      Owner
      <select
        value={value}
        disabled={pending}
        onChange={e => {
          const next = e.target.value
          setValue(next)
          setError(null)
          startTransition(async () => {
            const res = await setOpportunityOwner(oppId, next || null)
            if (res.error) { setError(res.error); setValue(ownerId ?? '') }
          })
        }}
        style={{ fontSize: 13, padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 8, background: value ? '#eff6ff' : '#fff', color: value ? '#1d4ed8' : '#9ca3af', cursor: 'pointer' }}
      >
        <option value="">niemand</option>
        {team.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
      </select>
      {error && <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>}
    </span>
  )
}
