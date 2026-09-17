'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TriggerQueueButton({ projectId }: { projectId?: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function trigger() {
    setLoading(true)
    setResult(null)

    try {
      const params = new URLSearchParams()
      if (projectId) params.set('project_id', projectId)

      const res = await fetch(`/api/cron/process-queue?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}` },
      })
      const data = await res.json()

      if (data.ok) {
        setResult(`✓ ${data.succeeded}/${data.processed} processed, ${data.failed} failed`)
        setTimeout(() => router.refresh(), 500)
      } else {
        setResult(`✗ ${data.error}`)
      }
    } catch (e) {
      setResult('✗ Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-gray-500">{result}</span>}
      <button
        onClick={trigger}
        disabled={loading}
        className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Running…' : '⚡ Run Queue'}
      </button>
    </div>
  )
}
