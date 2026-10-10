'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, ExternalLink, PenLine, Mail, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { contactSearchLinks } from '@/lib/outreach/linkedin'
import { draftForCompany } from '../../agents/actions'

type P = { name: string; title: string | null; linkedin: string | null }

// Find the right people on LinkedIn, then let the agents draft the first message or a letter
export default function OutreachPanel({ companyId, companyName, people }: { companyId: string; companyName: string; people: P[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'message' | 'letter' | null>(null)
  const unlinked = people.filter(p => !p.linkedin)
  const links = contactSearchLinks(companyName, unlinked.map(p => ({ name: p.name, title: p.title })))

  const draft = async (kind: 'message' | 'letter') => {
    setBusy(kind)
    const r = await draftForCompany(companyId, kind)
    setBusy(null)
    if (r.error) return toast.error(r.error)
    toast.success(r.summary || 'Erstellt', {
      action: kind === 'letter' && r.itemId ? { label: 'Drucken', onClick: () => window.open(`/letters/${r.itemId}`, '_blank') } : { label: 'Ansehen', onClick: () => router.push('/agents') },
    })
  }

  return (
    <div className="space-y-3 text-[13px]">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground"><Search className="size-3.5" /> Ansprechpartner auf LinkedIn finden</div>
        <div className="flex flex-wrap gap-1.5">
          {links.map(l => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" title={l.hint}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px] hover:bg-accent">
              {l.label} <ExternalLink className="size-3 text-muted-foreground" />
            </a>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Profil öffnen und mit der Revenue-OS-Erweiterung speichern – dann ist die Person hier verknüpft.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={() => draft('message')} disabled={!!busy}>
          {busy === 'message' ? <Loader2 className="animate-spin" /> : <PenLine />} Erstnachricht schreiben
        </Button>
        <Button size="sm" variant="outline" onClick={() => draft('letter')} disabled={!!busy}>
          {busy === 'letter' ? <Loader2 className="animate-spin" /> : <Mail />} Brief erstellen
        </Button>
      </div>
    </div>
  )
}
