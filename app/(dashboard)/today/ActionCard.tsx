'use client'
 
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
 
const ACTION_ICONS: Record<string, string> = {
  linkedin_message:  '💬',
  send_email:        '✉️',
  call:              '📞',
  linkedin_comment:  '👍',
  ask_intro:         '🤝',
  prepare_meeting:   '📋',
  follow_up:         '↩️',
  research_company:  '🔎',
  research_buyer:    '🔍',
  linkedin_connect:  '🔗',
  send_whatsapp:     '💚',
  send_proposal:     '📄',
  review_pilot:      '🧪',
  ask_referral:      '⭐',
  wait:              '⏳',
}
 
const PRIORITY_ACCENT: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-yellow-500',
  4: 'border-l-blue-400',
  5: 'border-l-gray-300',
}
 
interface ActionCardProps {
  action: any
  index: number
  priorityLabels: Record<number, { label: string; color: string }>
}
 
export default function ActionCard({ action, index, priorityLabels }: ActionCardProps) {
  const [done, setDone] = useState(false)
  const [open, setOpen] = useState(false)
  const supabase = createClient()
 
  const icon = ACTION_ICONS[action.action_type] || '📌'
  const priority = priorityLabels[action.priority] || priorityLabels[5]
  const accentClass = PRIORITY_ACCENT[action.priority] || PRIORITY_ACCENT[5]
 
  async function markDone() {
    setDone(true)
    if (action.id) {
      await supabase.from('actions').update({ status: 'completed', outcome_logged_at: new Date().toISOString() }).eq('id', action.id)
    }
  }
 
  async function markSkipped() {
    setDone(true)
    if (action.id) {
      await supabase.from('actions').update({ status: 'dismissed' }).eq('id', action.id)
    }
  }
 
  if (done) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 opacity-40">
        <div className="flex items-center gap-2">
          <span className="text-green-500 text-sm">✓</span>
          <p className="text-sm text-gray-400 line-through">{action.company_name || 'Company'}</p>
        </div>
      </div>
    )
  }
 
  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${accentClass} rounded-xl overflow-hidden hover:shadow-md transition-all duration-150`}>
      {/* Main row */}
      <div className="px-4 py-3.5 flex items-start gap-3">
        {/* Priority number */}
        <div className="shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400 mt-0.5">
          {index + 1}
        </div>
 
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">{icon}</span>
            <Link
              href={`/companies/${action.company_id}`}
              className="font-semibold text-gray-900 hover:text-sky-600 transition-colors"
            >
              {action.company_name || '—'}
            </Link>
            {action.person_name && (
              <span className="text-sm text-gray-500">· {action.person_name}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${priority.color}`}>
              {priority.label}
            </span>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
              {action.estimated_minutes}m
            </span>
          </div>
 
          <p className="text-sm font-medium text-gray-700 mt-1">
            {action.title || action.action_type.replace(/_/g, ' ')}
          </p>
 
          {action.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{action.description}</p>
          )}
 
          {(action.reason?.why_now || action.suggested_content) && !open && (
            <button
              onClick={() => setOpen(true)}
              className="text-xs text-sky-600 hover:text-sky-700 mt-1.5 font-medium"
            >
              Details & Nachricht →
            </button>
          )}
        </div>
 
        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={markSkipped}
            className="text-xs text-gray-400 hover:text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all"
          >
            Skip
          </button>
          <button
            onClick={markDone}
            className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 font-semibold shadow-sm transition-all"
          >
            Erledigt ✓
          </button>
        </div>
      </div>
 
      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3.5 bg-gray-50 space-y-3">
          {action.suggested_content && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">💬 Vorgeschlagene Nachricht</p>
              <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-mono">
                {action.suggested_content}
              </div>
            </div>
          )}
 
          {action.reason && Object.keys(action.reason).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">🧠 Warum jetzt?</p>
              <div className="space-y-1">
                {Object.entries(action.reason as Record<string, string>).map(([key, val]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-gray-400 shrink-0 w-20 capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="text-gray-700">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
 
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium"
          >
            ↑ Schließen
          </button>
        </div>
      )}
    </div>
  )
}
 
