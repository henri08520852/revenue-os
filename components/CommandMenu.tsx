'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { Building2, CalendarDays, CheckSquare, Flame, Handshake, LayoutDashboard, Search, Settings, User, Users, Workflow } from 'lucide-react'
import { getSearchIndex, type SearchItem } from '@/app/(dashboard)/search'
import { Kbd } from '@/components/ui/kbd'

const PAGES = [
  { label: 'Heute', href: '/today', Icon: LayoutDashboard },
  { label: 'Aufgaben', href: '/tasks', Icon: CheckSquare },
  { label: 'Kalender', href: '/calendar', Icon: CalendarDays },
  { label: 'Pipeline', href: '/pipeline', Icon: Workflow },
  { label: 'Companies', href: '/companies', Icon: Building2 },
  { label: 'Contacts', href: '/contacts', Icon: Users },
  { label: 'Heiße Firmen', href: '/candidates', Icon: Flame },
  { label: 'Einstellungen', href: '/settings', Icon: Settings },
]
const KIND = {
  company: { label: 'Companies', Icon: Building2 },
  person: { label: 'Kontakte', Icon: User },
  deal: { label: 'Deals', Icon: Handshake },
  lead: { label: 'Leads', Icon: Flame },
} as const

let cache: SearchItem[] | null = null

// ⌘K / Ctrl+K: jump to any company, contact, deal, lead or page
export function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter()
  const [items, setItems] = useState<SearchItem[]>(cache ?? [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (open) getSearchIndex().then(d => { cache = d; setItems(d) }).catch(() => {})
  }, [open])

  const go = (href: string) => { setOpen(false); router.push(href) }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Suche"
      overlayClassName="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[92vw] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-pop">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 text-muted-foreground" />
        <Command.Input autoFocus placeholder="Firma, Kontakt, Deal oder Seite suchen …" className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">Nichts gefunden.</Command.Empty>
        <Command.Group heading="Seiten">
          {PAGES.map(p => (
            <Command.Item key={p.href} value={`seite ${p.label}`} onSelect={() => go(p.href)} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm aria-selected:bg-accent">
              <p.Icon className="size-4 text-muted-foreground" />{p.label}
            </Command.Item>
          ))}
        </Command.Group>
        {(Object.keys(KIND) as (keyof typeof KIND)[]).map(kind => {
          const list = items.filter(i => i.kind === kind)
          if (!list.length) return null
          const { label, Icon } = KIND[kind]
          return (
            <Command.Group key={kind} heading={label}>
              {list.map(i => (
                <Command.Item key={`${kind}-${i.id}`} value={`${i.label} ${i.sub ?? ''} ${kind}-${i.id}`} onSelect={() => go(i.href)} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm aria-selected:bg-accent">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{i.label}</span>
                  {i.sub && <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{i.sub}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command.Dialog>
  )
}
