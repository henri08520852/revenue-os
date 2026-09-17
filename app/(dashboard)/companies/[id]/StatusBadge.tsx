'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const STATUSES = ['target', 'warm', 'hot', 'active_deal', 'customer', 'inactive']

const COLORS: Record<string, string> = {
  target:      'bg-gray-100 text-gray-600',
  warm:        'bg-yellow-100 text-yellow-700',
  hot:         'bg-orange-100 text-orange-700',
  active_deal: 'bg-green-100 text-green-700',
  customer:    'bg-blue-100 text-blue-700',
  inactive:    'bg-gray-50 text-gray-400',
}

export default function StatusBadge({ status, companyId }: { status: string; companyId: string }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(status)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function updateStatus(newStatus: string) {
    setLoading(true)
    await supabase.from('companies').update({ account_status: newStatus }).eq('id', companyId)
    setCurrent(newStatus)
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-3 py-1 rounded-full text-xs font-medium ${COLORS[current] || COLORS.target} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        {current.replace('_', ' ')} ▾
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-32">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={loading}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${s === current ? 'font-medium text-primary-600' : 'text-gray-700'}`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
