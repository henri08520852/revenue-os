'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  // Fixed company (company page) — or omit and pass `companies` to pick one (contacts page)
  companyId?: string
  companies?: { id: string; name: string }[]
  projectId: string
  variant?: 'secondary' | 'primary'
}

export default function AddContactButton({ companyId, companies, projectId, variant = 'secondary' }: Props) {
  const [pickedCompany, setPickedCompany] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    title: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    isDecisionMaker: false,
    buyerRole: 'champion' as 'economic_buyer' | 'champion' | 'influencer' | 'user' | 'blocker',
  })
  const router = useRouter()
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.from('people').insert({
      project_id: projectId,
      company_id: companyId ?? (pickedCompany || null),
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      full_name: `${form.firstName.trim()} ${form.lastName.trim()}`,
      job_title: form.title || null,
      email: form.email || null,
      phone: form.phone || null,
      linkedin_url: form.linkedinUrl || null,
      is_decision_maker: form.isDecisionMaker,
      buyer_role: form.buyerRole,
      source: 'manual',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setOpen(false)
      setLoading(false)
      setPickedCompany('')
      setForm({
        firstName: '', lastName: '', title: '', email: '',
        phone: '', linkedinUrl: '', isDecisionMaker: false, buyerRole: 'champion',
      })
      router.refresh()
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={variant === 'primary'
          ? 'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm'
          : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm'}
      >
        <span>+</span> Kontakt
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Kontakt hinzufügen</h2>
            </div>

            <form onSubmit={submit} className="px-6 py-4 space-y-4">
              {!companyId && companies && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Unternehmen</label>
                  <select
                    value={pickedCompany}
                    onChange={e => setPickedCompany(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="">— ohne Unternehmen —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Vorname *</label>
                  <input
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    required
                    placeholder="Max"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Nachname *</label>
                  <input
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    required
                    placeholder="Mustermann"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Position</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Geschäftsführer"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* LinkedIn */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">LinkedIn URL</label>
                <input
                  value={form.linkedinUrl}
                  onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">E-Mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="max@firma.de"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Telefon</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+49 89 ..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Buyer role */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Rolle im Buying Center</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'economic_buyer', label: '💰 Budget-Entscheider' },
                    { value: 'champion',       label: '⭐ Champion' },
                    { value: 'influencer',     label: '💡 Influencer' },
                    { value: 'user',           label: '👤 Nutzer' },
                    { value: 'blocker',        label: '🚧 Blocker' },
                  ].map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, buyerRole: r.value as any }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.buyerRole === r.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Decision maker toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={form.isDecisionMaker}
                    onChange={e => setForm(f => ({ ...f, isDecisionMaker: e.target.checked }))}
                    className="sr-only"
                  />
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.isDecisionMaker ? 'bg-gray-900' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isDecisionMaker ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <span className="text-sm text-gray-700">Entscheidungsträger</span>
              </label>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={loading || !form.firstName.trim() || !form.lastName.trim()}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {loading ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
