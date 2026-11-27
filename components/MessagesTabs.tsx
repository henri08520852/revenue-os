'use client'
// Tab bar of the "Nachrichten" area: write, Postfach (drafts, agent drafts to approve, sent + replies), templates & voices
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PenLine, Inbox, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/compose', label: 'Schreiben', Icon: PenLine, exact: true },
  { href: '/compose/drafts', label: 'Postfach', Icon: Inbox },
  { href: '/compose/settings', label: 'Vorlagen & Stimmen', Icon: SlidersHorizontal },
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
