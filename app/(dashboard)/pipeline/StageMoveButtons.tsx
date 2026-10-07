'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  oppId: string
  prevStage: string | null
  nextStage: string | null
  stageLabels: Record<string, string>
}

export default function StageMoveButtons({ oppId, prevStage, nextStage, stageLabels }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function moveStage(stage: string) {
    setLoading(true)
    try {
      await fetch(`/api/opportunities/${oppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (!prevStage && !nextStage) return null

  return (
    <div className="flex gap-1 mt-2">
      {prevStage && (
        <button
          onClick={() => moveStage(prevStage)}
          disabled={loading}
          className="flex-1 text-xs py-0.5 px-1.5 rounded border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 disabled:opacity-40 transition-colors"
        >
          ← {stageLabels[prevStage].split(' ')[0]}
        </button>
      )}
      {nextStage && (
        <button
          onClick={() => moveStage(nextStage)}
          disabled={loading}
          className="flex-1 text-xs py-0.5 px-1.5 rounded border border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 transition-colors"
        >
          {stageLabels[nextStage].split(' ')[0]} →
        </button>
      )}
    </div>
  )
}
