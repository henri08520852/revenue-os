// Printable letter (DIN 5008, form B) from the letter agent – "Drucken" → printer or "Als PDF speichern"
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import type { LetterData } from '@/lib/agents/letter'
import PrintBar from './PrintBar'

export const dynamic = 'force-dynamic'

const COUNTRY: Record<string, string> = { AT: 'ÖSTERREICH', CH: 'SCHWEIZ' }

export default async function LetterPage({ params }: { params: { id: string } }) {
  const { me, denied } = await getTeamContext()
  if (!me || denied) notFound()
  const { data: item } = await (createClient() as any).from('automation_items').select('id, kind, body, data, company_id').eq('id', params.id).single()
  if (!item || item.kind !== 'letter') notFound()
  const d = item.data as LetterData
  const r = d.recipient
  const senderLines = String(d.sender || '').split('\n').map(s => s.trim()).filter(Boolean)
  const date = new Date(d.date || Date.now()).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  const missing = !r.street || !r.zip || !r.city

  return (
    <div className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 0 } @media print { .no-print { display: none !important } }`}</style>
      <PrintBar missing={missing} />
      <article className="relative mx-auto bg-white text-[11pt] leading-[1.45] text-black shadow-lg print:shadow-none"
        style={{ width: '210mm', minHeight: '297mm', padding: '0 20mm 20mm 25mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        {/* Letterhead */}
        <header className="flex justify-end pt-[12mm] text-right text-[9pt] leading-snug text-neutral-600" style={{ height: '45mm' }}>
          <div>{senderLines.map((l, i) => <div key={i} className={i === 0 ? 'text-[12pt] font-semibold text-black' : ''}>{l}</div>)}</div>
        </header>
        {/* Address window: 45 mm from top, 85 × 45 mm */}
        <section style={{ height: '45mm', width: '85mm' }}>
          <div className="border-b border-neutral-400 pb-[1mm] text-[7pt] text-neutral-600" style={{ height: '17.7mm', display: 'flex', alignItems: 'flex-end' }}>
            {senderLines.join(' · ')}
          </div>
          <div className="pt-[2mm]">
            <div>{r.company}</div>
            {r.name ? <div>{r.name}</div> : r.title ? <div>{r.title}</div> : null}
            <div>{r.street || '[Straße Hausnummer]'}</div>
            <div>{r.zip && r.city ? `${r.zip} ${r.city}` : '[PLZ Ort]'}</div>
            {r.country && COUNTRY[r.country] && <div>{COUNTRY[r.country]}</div>}
          </div>
        </section>
        <div className="mt-[8mm] text-right">{date}</div>
        <h1 className="mt-[8mm] font-bold">{d.subject}</h1>
        <div className="mt-[8mm] whitespace-pre-wrap">{item.body}</div>
        <div className="mt-[6mm]">{d.closing || 'Mit freundlichen Grüßen'}</div>
        <div className="mt-[16mm]">
          {d.signer && <div>{d.signer}</div>}
          {d.signerTitle && <div className="text-neutral-700">{d.signerTitle}</div>}
          {d.contact && <div className="mt-1 whitespace-pre-wrap text-[9.5pt] text-neutral-700">{d.contact}</div>}
        </div>
      </article>
    </div>
  )
}
