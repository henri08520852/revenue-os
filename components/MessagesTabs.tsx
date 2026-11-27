'use client'
// Shared tab bar of the "Nachrichten" area: write, drafts & history, settings (voices, base texts, playbooks), agents
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PenLine, History, SlidersHorizontal, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/compose', label: 'Schreiben', Icon: PenLine, exact: true },
  { href: '/compose/drafts', label: 'Entwürfe & Verlauf', Icon: History },
  { href: '/compose/settings', label: 'Stimmen, Basistexte & Playbooks', Icon: SlidersHorizontal },
  { href: '/agents', label: 'Agents & Freigaben', Icon: Bot },
]

export default function MessagesTabs() {
  const path = usePathname()
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center gap-1 overflow-x-auto px-8">
        <span className="mr-3 shrink-0 py-3 text-[13px] font-semibold text-foreground">Nachrichten</span>
        {TABS.map(t => {
          const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + '/')
          return (
            <Link key={t.href} href={t.href} className={cn(
              'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] font-medium transition-colors',
              active ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}>
              <t.Icon className="size-4" /> {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
