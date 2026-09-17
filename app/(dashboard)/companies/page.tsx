'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      let query = supabase
        .from('companies')
        .select('*, signals(count)')
        .eq('project_id', PROJECT_ID)
        .order('created_at', { ascending: false })

      if (filter !== 'all') query = query.eq('status', filter)
      const { data } = await query
      setCompanies(data ?? [])
    }
    load()
  }, [filter])

  const filtered = companies.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.domain?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor: Record<string, string> = {
    target: '#dbeafe',
    warm: '#d1fae5',
    active_deal: '#fef3c7',
    customer: '#ede9fe',
    inactive: '#f3f4f6',
  }
  const statusText: Record<string, string> = {
    target: '#1d4ed8',
    warm: '#065f46',
    active_deal: '#92400e',
    customer: '#5b21b6',
    inactive: '#6b7280',
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Companies</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{filtered.length} Unternehmen im CRM</p>
        </div>
        <Link href="/companies/new" style={{ background: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
          + Unternehmen
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all','target','warm','active_deal','customer','inactive'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: filter === f ? '#2563eb' : '#f3f4f6',
            color: filter === f ? '#fff' : '#374151',
          }}>
            {f === 'all' ? 'Alle' : f === 'active_deal' ? '🏆 Active Deal' : f === 'warm' ? '🔥 Warm' : f === 'target' ? 'Target' : f === 'customer' ? '⭐ Customer' : 'Inactive'}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Suche..."
        style={{ width: '100%', maxWidth: 320, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, marginBottom: 20, outline: 'none' }}
      />

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['Unternehmen','Status','Score','ICP','Signale','Jobs','Letztes Signal'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                <td style={{ padding: '14px 16px' }}>
                  <Link href={`/companies/${c.id}`} style={{ fontWeight: 600, color: '#111827', textDecoration: 'none', fontSize: 14 }}>{c.name}</Link>
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>{c.domain}</p>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ background: statusColor[c.status] ?? '#f3f4f6', color: statusText[c.status] ?? '#6b7280', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                    {c.status ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{c.icp_score ?? '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{c.icp_fit ?? '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{c.signals?.[0]?.count ?? '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{c.open_jobs ?? '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 12, color: '#9ca3af' }}>{c.last_signal_at ? new Date(c.last_signal_at).toLocaleDateString('de-DE') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
            <p>Keine Unternehmen gefunden</p>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>{filtered.length} Unternehmen geladen</p>
    </div>
  )
}
