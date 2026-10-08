'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AppSwitcher from './AppSwitcher'
import { NewMenu } from './CreateRecord'
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  SparklesIcon,
  FunnelIcon,
  QuestionMarkCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  InboxIcon,
} from '@heroicons/react/24/outline'

const nav = [
  { href: '/today',      label: 'Heute',      icon: CalendarDaysIcon },
  { href: '/tasks',      label: 'Aufgaben',   icon: CheckCircleIcon },
  { href: '/inbox',      label: 'Posteingang', icon: InboxIcon },
  { href: '/calendar',   label: 'Kalender',   icon: CalendarIcon },
  { href: '/companies',  label: 'Companies',  icon: BuildingOffice2Icon },
  { href: '/contacts',   label: 'Contacts',   icon: UserGroupIcon },
  { href: '/pipeline',   label: 'Pipeline',   icon: FunnelIcon },
  { href: '/candidates', label: 'Candidates', icon: SparklesIcon },
]

const iconStyle = { width: 16, height: 16, flexShrink: 0 }

export default function Sidebar({ userName, userEmail, inboxCount = 0 }: { userName: string | null; userEmail: string | null; inboxCount?: number }) {
  const path = usePathname()
  return (
    <aside style={{ width: 240, minHeight: '100vh', background: '#fff', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
        <AppSwitcher />
      </div>
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        <div style={{ marginBottom: 12 }}><NewMenu /></div>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', marginBottom: 2, background: active ? '#eff6ff' : 'transparent', color: active ? '#1d4ed8' : '#4b5563' }}>
              <Icon style={{ ...iconStyle, color: active ? '#2563eb' : '#9ca3af' }} />
              {label}
              {href === '/inbox' && inboxCount > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: '#2563eb', color: '#fff' }}>{inboxCount > 99 ? '99+' : inboxCount}</span>}
            </Link>
          )
        })}
      </nav>
      <div style={{ padding: '12px', borderTop: '1px solid #f3f4f6' }}>
        <Link href="/guide" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', background: path === '/guide' ? '#eff6ff' : 'transparent', color: path === '/guide' ? '#1d4ed8' : '#6b7280' }}>
          <QuestionMarkCircleIcon style={{ ...iconStyle, color: path === '/guide' ? '#2563eb' : '#9ca3af' }} />
          So funktioniert&apos;s
        </Link>
        <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', background: path === '/settings' ? '#eff6ff' : 'transparent', color: path === '/settings' ? '#1d4ed8' : '#6b7280' }}>
          <Cog6ToothIcon style={{ ...iconStyle, color: '#9ca3af' }} />
          Einstellungen
        </Link>
        {userName && (
          <Link href="/settings" title={userEmail ?? undefined} style={{ marginTop: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', borderRadius: 8, background: '#f9fafb' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {userName[0]?.toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>{userName}</p>
              <p style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{userEmail}</p>
            </div>
          </Link>
        )}
      </div>
    </aside>
  )
}
