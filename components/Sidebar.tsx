'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  BoltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

const nav = [
  { href: '/today',      label: 'Heute',      icon: CalendarDaysIcon },
  { href: '/companies',  label: 'Companies',  icon: BuildingOffice2Icon },
  { href: '/contacts',   label: 'Contacts',   icon: UserGroupIcon },
  { href: '/pipeline',   label: 'Pipeline',   icon: ChartBarIcon },
  { href: '/candidates', label: 'Candidates', icon: SparklesIcon },
]

const iconStyle = { width: 16, height: 16, flexShrink: 0 }

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{ width: 240, minHeight: '100vh', background: '#fff', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BoltIcon style={{ width: 16, height: 16, color: '#fff' }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Revenue OS</span>
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, marginLeft: 36 }}>by Hireflow</p>
      </div>
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', marginBottom: 2, background: active ? '#eff6ff' : 'transparent', color: active ? '#1d4ed8' : '#4b5563' }}>
              <Icon style={{ ...iconStyle, color: active ? '#2563eb' : '#9ca3af' }} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div style={{ padding: '12px', borderTop: '1px solid #f3f4f6' }}>
        <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#6b7280', textDecoration: 'none' }}>
          <Cog6ToothIcon style={{ ...iconStyle, color: '#9ca3af' }} />
          Einstellungen
        </Link>
        <div style={{ marginTop: 12, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Supabase verbunden</span>
        </div>
      </div>
    </aside>
  )
}
