'use client'

import { useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string; briefing?: boolean }
type Target = { kind: 'contact' | 'company' | 'deal'; id: string }

const SUGGESTIONS: Record<Target['kind'], string[]> = {
  contact: ['Was hat die Person zuletzt angefragt?', 'Was haben wir zugesagt?', 'Formuliere eine Follow-up-Mail'],
  company: ['Wer sind die wichtigsten Ansprechpartner?', 'Welche Anforderungen gibt es?', 'Was ist der nächste sinnvolle Schritt?'],
  deal: ['Was fehlt noch bis zum Abschluss?', 'Welche Einwände gab es?', 'Formuliere eine Follow-up-Mail'],
}

// **bold** inside a line
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>)
}

// Minimal markdown: ## headings, bullet lists, paragraphs
function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} style={{ margin: '4px 0 8px', paddingLeft: 18, listStyle: 'disc' }}>{list.map((l, i) => <li key={i} style={{ marginBottom: 3 }}>{inline(l)}</li>)}</ul>)
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
    if (bullet) { list.push(bullet[1]); continue }
    flush()
    if (!line.trim()) continue
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h) blocks.push(<p key={blocks.length} style={{ fontSize: 12, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '10px 0 4px' }}>{inline(h[1])}</p>)
    else blocks.push(<p key={blocks.length} style={{ margin: '0 0 6px' }}>{inline(line)}</p>)
  }
  flush()
  return <div style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.55 }}>{blocks}</div>
}

export default function AiAssistant({ target, title }: { target: Target; title: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  async function send(opts: { briefing?: boolean; text?: string }) {
    if (busy) return
    const question = opts.briefing ? 'Briefing: Zusammenfassung und offene Punkte & Fragen' : (opts.text ?? input).trim()
    if (!question) return
    const history: Msg[] = [...messages, { role: 'user', content: question, briefing: opts.briefing }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          briefing: opts.briefing && messages.length === 0,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => '')
        setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: `⚠️ ${err || 'Fehler ' + res.status}` }])
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: text }])
        endRef.current?.scrollIntoView({ block: 'nearest' })
      }
    } catch {
      setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: '⚠️ Verbindung unterbrochen.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ background: 'linear-gradient(180deg, #f5f3ff 0%, #fff 140px)', border: '1px solid #ddd6fe', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: messages.length ? 12 : 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95' }}>✨ KI-Assistent</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {messages.length > 0 && <button onClick={() => setMessages([])} disabled={busy} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Neu starten</button>}
          <button onClick={() => send({ briefing: true })} disabled={busy}
            style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer', background: busy ? '#a78bfa' : '#7c3aed', color: '#fff' }}>
            {busy ? 'Denkt nach…' : 'Briefing erstellen'}
          </button>
        </div>
      </div>

      {messages.length === 0 && (
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
          Kennt alle E-Mails, Notizen, Meetings und Aufgaben zu {title}. Erstelle ein Briefing vor dem nächsten Gespräch oder frag etwas.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
        {messages.map((m, i) => m.role === 'user'
          ? <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#ede9fe', color: '#4c1d95', fontSize: 13, padding: '7px 11px', borderRadius: '12px 12px 2px 12px' }}>{m.briefing ? '📋 Briefing' : m.content}</div>
          : <div key={i} style={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 12, padding: '10px 12px' }}>
              {m.content ? <Markdown text={m.content} /> : <p style={{ fontSize: 12, color: '#9ca3af' }}>Liest den Verlauf …</p>}
            </div>)}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {SUGGESTIONS[target.kind].map(s => (
            <button key={s} onClick={() => send({ text: s })} disabled={busy}
              style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 20, border: '1px solid #ddd6fe', background: '#fff', color: '#5b21b6', cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); send({}) }} style={{ display: 'flex', gap: 6, marginTop: messages.length ? 12 : 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} disabled={busy} placeholder={`Frag etwas zu ${title} …`}
          style={{ flex: 1, padding: '8px 11px', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }} />
        <button type="submit" disabled={busy || !input.trim()}
          style={{ padding: '8px 14px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: busy || !input.trim() ? '#c4b5fd' : '#7c3aed', color: '#fff' }}>Senden</button>
      </form>
    </section>
  )
}
