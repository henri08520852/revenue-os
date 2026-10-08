'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Fires a background Gmail/Calendar sync once per app load (server skips if synced < 10 min ago)
export default function GoogleAutoSync() {
  const router = useRouter()
  useEffect(() => {
    fetch('/api/google/sync?ifStale=1', { method: 'POST' })
      .then(r => r.json())
      .then(j => { if (j && !j.skipped && (j.emails || j.meetings || j.events)) router.refresh() })
      .catch(() => {})
  }, [router])
  return null
}
