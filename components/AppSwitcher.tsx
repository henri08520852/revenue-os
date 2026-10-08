'use client'

import { useState } from 'react'
import { BoltIcon, ChevronUpDownIcon, CheckIcon, PencilSquareIcon } from '@heroicons/react/24/outline'

// Sibling apps sharing the same Supabase project / Google login
const CONTENT_STUDIO_URL = process.env.NEXT_PUBLIC_CONTENT_STUDIO_URL || 'https://marketing-pr-agent.vercel.app'

const APPS = [
  { key: 'revenue', name: 'Revenue OS', sub: 'Vertrieb & Deals', href: null as string | null, color: '#2563eb', Icon: BoltIcon },
  // ?sso=google: the studio signs in via Google automatically if not signed in yet
  { key: 'content', name: 'Content Studio', sub: 'Marketing & PR', href: `${CONTENT_STUDIO_URL}/?sso=google`, color: '#0e7490', Icon: PencilSquareIcon },
]

export default function AppSwitcher() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', margin: '-6px -8px', borderRadius: 8, border: 'none', background: open ? '#f3f4f6' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BoltIcon style={{ width: 16, height: 16, color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>Revenue OS</p>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>by Hireflow</p>
        </div>
        <ChevronUpDownIcon style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: -8, right: -8, zIndex: 50, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px 4px' }}>Apps</p>
            {APPS.map(({ key, name, sub, href, color, Icon }) => {
              const current = !href
              const inner = (
                <>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon style={{ width: 15, height: 15, color: '#fff' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{name}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</p>
                  </div>
                  {current ? <CheckIcon style={{ width: 16, height: 16, color: '#2563eb' }} /> : <span style={{ fontSize: 12, color: '#9ca3af' }}>↗</span>}
                </>
              )
              const style = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 8, textDecoration: 'none', background: current ? '#eff6ff' : 'transparent' }
              return current
                ? <div key={key} style={style}>{inner}</div>
                : <a key={key} href={href!} style={style}>{inner}</a>
            })}
          </div>
        </>
      )}
    </div>
  )
}
