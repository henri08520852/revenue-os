'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, Building2, CalendarDays, CheckSquare, CircleHelp, Flame, LayoutDashboard, Search, Settings, Users, Workflow, type LucideIcon } from 'lucide-react'
import AppSwitcher from './AppSwitcher'
import { NewMenu } from './CreateRecord'
import { CommandMenu } from './CommandMenu'
import { Kbd } from './ui/kbd'
import { cn } from '@/lib/utils'

const SECTIONS: { title: string | null; items: { href: string; label: string; Icon: LucideIcon }[] }[] = [
  { title: null, items: [
    { href: '/today', label: 'Heute', Icon: LayoutDashboard },
    { href: '/tasks', label: 'Aufgaben', Icon: CheckSquare },
    { href: '/calendar', label: 'Kalender', Icon: CalendarDays },
  ] },
  { title: 'CRM', items: [
    { href: '/pipeline', label: 'Pipeline', Icon: Workflow },
    { href: '/companies', label: 'Companies', Icon: Building2 },
    { href: '/contacts', label: 'Contacts', Icon: Users },
  ] },
  { title: 'Akquise', items: [
    { href: '/candidates', label: 'Heiße Firmen', Icon: Flame },
    { href: '/agents', label: 'Agents', Icon: Bot },
  ] },
]

function NavLink({ href, label, Icon, active }: { href: string; label: string; Icon: LucideIcon; active: boolean }) {
  return (
    <Link href={href} className={cn(
      'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors',
      active ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-accent hover:text-foreground',
    )}>
      <Icon className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-slate-400 group-hover:text-slate-600')} strokeWidth={2} />
      {label}
    </Link>
  )
}

export default function Sidebar({ userName, userEmail }: { userName: string | null; userEmail: string | null }) {
  const path = usePathname()
  const [search, setSearch] = useState(false)
  const isActive = (href: string) => path === href || path.startsWith(href + '/')

  return (
    <aside className="flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-card">
      <div className="px-4 pb-3 pt-4">
        <AppSwitcher />
      </div>
      <div className="space-y-2 px-3">
        <NewMenu />
        <button onClick={() => setSearch(true)} className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent">
          <Search className="size-3.5" />
          Suchen …
          <span className="ml-auto flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {SECTIONS.map(section => (
          <div key={section.title ?? 'main'} className="space-y-0.5">
            {section.title && <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.title}</p>}
            {section.items.map(item => <NavLink key={item.href} {...item} active={isActive(item.href)} />)}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-border p-3">
        <NavLink href="/guide" label="So funktioniert's" Icon={CircleHelp} active={path === '/guide'} />
        <NavLink href="/settings" label="Einstellungen" Icon={Settings} active={path === '/settings'} />
        {userName && (
          <Link href="/settings" title={userEmail ?? undefined} className="mt-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-accent">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white">
              {userName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">{userName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
            </div>
          </Link>
        )}
      </div>
      <CommandMenu open={search} setOpen={setSearch} />
    </aside>
  )
}
