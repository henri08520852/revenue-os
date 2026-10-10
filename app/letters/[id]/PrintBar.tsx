'use client'
import Link from 'next/link'
import { Printer, ArrowLeft } from 'lucide-react'

export default function PrintBar({ missing }: { missing: boolean }) {
  return (
    <div className="no-print mx-auto mb-4 flex items-center justify-between gap-4" style={{ width: '210mm' }}>
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-neutral-700 hover:underline"><ArrowLeft className="size-4" /> Zurück zu den Freigaben</Link>
      <div className="flex items-center gap-3">
        {missing && <span className="text-sm text-amber-800">Anschrift unvollständig – bitte in den Freigaben ergänzen</span>}
        <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
          <Printer className="size-4" /> Drucken / PDF
        </button>
      </div>
    </div>
  )
}
