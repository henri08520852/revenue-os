'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  companyName: string
}

export default function EnrichButton({ companyId, companyName }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function enrich() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, companyName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Fehler ${res.status}`)
      }
      setDone(true)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={enrich}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-all shadow-sm ${done ? 'bg-green-100 text-green-700 border-green-200' : error ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'} disabled:opacity-40`}
      >
        {loading ? '⏳ Lädt…' : done ? '✅ Fertig' : '🔍 Anreichern'}
      </button>
    </div>
  )
}
