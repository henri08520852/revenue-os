'use server'
// Nachrichten: write (Simon's Akquise logic + CRM), keep every draft in content_drafts (shared with the Content Studio),
// trace what happened (history in the payload), log sent messages on the contact's timeline.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { writeAkquise, refineAkquise } from '@/lib/akquise/write'
import {
  CHANNELS, OFFERS, RELS, SALES_GOALS, DIRECTIVES, draftTitle, mergeAkquise,
  type Author, type Address, type SalesForm, type SalesPayload, type SalesText, type HistoryEvent, type Directive, type AkquiseConfig,
} from '@/lib/akquise/content'
import { PAINS, type PainKey } from '@/lib/outreach/pains'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
const TABLE = 'content_drafts'

export type DraftRow = {
  id: string; kind: string; author: string; title: string | null; body: string | null; payload: SalesPayload
  status: 'draft' | 'published' | 'archived'; created_by: string | null; updated_by: string | null
  created_at: string; updated_at: string; published_at: string | null
}
type R<T = {}> = ({ error: null } & T) | { error: string }

const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
const fail = (e: any) => ({ error: e?.message || e?.details || 'Fehler' as string })

async function session() {
  const { me, denied } = await getTeamContext()
  if (!me || denied) throw new Error('Nicht angemeldet')
  return { supabase: createClient() as any, me, who: me.display_name || me.email || 'Team' }
}

function cleanForm(f: Partial<SalesForm>): SalesForm {
  const pick = <T extends string>(v: unknown, keys: Record<T, unknown>, d: T): T => (typeof v === 'string' && v in keys ? v as T : d)
  return {
    offer: pick(f.offer, OFFERS, 'deepcheck'), channel: pick(f.channel, CHANNELS, 'connect'), rel: pick(f.rel, RELS, 'cold'),
    address: pick<Address>(f.address, { auto: 1, sie: 1, du: 1 }, 'auto'), goal: pick(f.goal, SALES_GOALS, 'call'),
    name: s(f.name, 120), role: s(f.role, 160), company: s(f.company, 160), context: s(f.context, 4000), prev: s(f.prev, 3000), sequence: !!f.sequence,
  }
}
const cleanTexts = (a: unknown, n = 4): SalesText[] => (Array.isArray(a) ? a : []).slice(0, n).map((x: any) => ({ label: s(x?.label, 80), subject: s(x?.subject, 200), text: String(x?.text ?? '').slice(0, 5000) }))
const ev = (by: string, action: HistoryEvent['action'], detail?: string): HistoryEvent => ({ at: new Date().toISOString(), by, action, ...(detail ? { detail: detail.slice(0, 300) } : {}) })
const bodyOf = (p: SalesPayload) => { const m = p.variants?.[p.chosen || 0]; return m ? (m.subject ? `Betreff: ${m.subject}\n\n` : '') + m.text : '' }

// Contact from the CRM → its company and open lead
async function crmTarget(supabase: any, personId: string | null) {
  if (!personId) return { person_id: null, company_id: null, lead_id: null }
  const { data: p } = await supabase.from('people').select('id, company_id').eq('id', personId).single()
  if (!p) throw new Error('Kontakt nicht gefunden')
  let leadId: string | null = null
  if (p.company_id) {
    const { data: open } = await supabase.from('leads').select('id').eq('company_id', p.company_id).in('stage', ['prospect', 'outreach', 'contacted', 'qualified']).order('created_at', { ascending: false }).limit(1)
    leadId = open?.[0]?.id ?? null
  }
  return { person_id: p.id as string, company_id: (p.company_id as string) ?? null, lead_id: leadId }
}

export type GenerateInput = {
  draftId?: string | null; author: Author; form: Partial<SalesForm>
  personId?: string | null; createInCrm?: boolean; useCrm?: boolean; pains?: string[]; draftText?: string
}

export async function generateDraft(input: GenerateInput): Promise<R<{ draft: DraftRow }>> {
  try {
    const { supabase, me, who } = await session()
    const form = cleanForm(input.form)
    if (!form.name && !form.company && !form.context && !form.role) return { error: 'Bitte mindestens Name, Rolle, Firma oder Kontext angeben.' }
    const author: Author = input.author === 'simon' ? 'simon' : 'henri'
    const crm = await crmTarget(supabase, s(input.personId, 60) || null)
    const pains = (input.pains || []).filter(k => k in PAINS).slice(0, 3) as PainKey[]
    const draftText = s(input.draftText, 3000)
    const r = await writeAkquise(supabase, PROJECT_ID, { author, form, personId: crm.person_id, companyId: crm.company_id, leadId: crm.lead_id, useCrm: input.useCrm !== false, pains, draftText })

    let prev: DraftRow | null = null
    if (input.draftId) prev = (await supabase.from(TABLE).select('*').eq('id', input.draftId).maybeSingle()).data ?? null
    const history = [...(prev?.payload?.history || []), ev(who, prev ? 'regenerated' : 'created', `${CHANNELS[form.channel].label} · ${OFFERS[form.offer].label} · als ${author === 'simon' ? 'Simon' : 'Henri'}`)]
    const payload: SalesPayload = {
      form, author, variants: r.variants, followups: r.followups, rationale: r.rationale, chosen: 0, sampleCount: r.sampleCount,
      crm: { ...crm, create: !crm.person_id && !!input.createInCrm },
      extra: { draftText: draftText || undefined, pains, useCrm: input.useCrm !== false, hireflow: r.hireflow ?? undefined },
      original: { variants: r.variants, followups: r.followups }, history, source: 'revenue-os', model: r.model,
      cost_usd: Math.round(((prev?.payload?.cost_usd || 0) + r.costUsd) * 100000) / 100000,
    }
    const row = { kind: 'sales', author, title: draftTitle(form).slice(0, 200), body: bodyOf(payload), payload, status: 'draft', updated_by: me.email ?? who }
    const res = prev && prev.status !== 'published'
      ? await supabase.from(TABLE).update(row).eq('id', prev.id).select('*').single()
      : await supabase.from(TABLE).insert({ ...row, created_by: me.email ?? who }).select('*').single()
    if (res.error) throw new Error(/content_drafts/.test(res.error.message) ? 'Tabelle content_drafts fehlt oder ist gesperrt (nur @altoris.one-Konten).' : res.error.message)
    revalidatePath('/compose/drafts')
    return { error: null, draft: res.data }
  } catch (e) { return fail(e) }
}

export async function loadDraft(id: string): Promise<DraftRow | null> {
  const { supabase } = await session()
  const { data } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  return data ?? null
}

// Edits in the text boxes: autosave; repeated edits by the same person within 15 min count as one history entry
export async function saveDraft(id: string, patch: { variants?: SalesText[]; followups?: SalesText[]; chosen?: number }): Promise<R<{ updated_at: string }>> {
  try {
    const { supabase, me, who } = await session()
    const { data: d } = await supabase.from(TABLE).select('payload, status').eq('id', id).single()
    if (!d) return { error: 'Entwurf nicht gefunden' }
    const p: SalesPayload = { ...d.payload }
    const hist = [...(p.history || [])]
    if (patch.variants) p.variants = cleanTexts(patch.variants)
    if (patch.followups) p.followups = cleanTexts(patch.followups)
    if (typeof patch.chosen === 'number' && patch.chosen !== p.chosen) {
      p.chosen = Math.max(0, Math.min((p.variants?.length || 1) - 1, patch.chosen))
      hist.push(ev(who, 'chosen', `Favorit: ${p.variants[p.chosen]?.label || p.chosen + 1}`))
    }
    if (patch.variants || patch.followups) {
      const last = hist[hist.length - 1]
      if (last?.action === 'edited' && last.by === who && Date.now() - Date.parse(last.at) < 15 * 60000) last.at = new Date().toISOString()
      else hist.push(ev(who, 'edited'))
    }
    p.history = hist.slice(-80)
    const { data, error } = await supabase.from(TABLE).update({ payload: p, body: bodyOf(p), updated_by: me.email ?? who }).eq('id', id).select('updated_at').single()
    if (error) return { error: error.message }
    return { error: null, updated_at: data.updated_at }
  } catch (e) { return fail(e) }
}

export async function refineText(id: string, key: string, directive: Directive | null, custom: string | null): Promise<R<{ text: string }>> {
  try {
    const { supabase, me, who } = await session()
    const { data: d } = await supabase.from(TABLE).select('payload').eq('id', id).single()
    if (!d) return { error: 'Entwurf nicht gefunden' }
    const p: SalesPayload = { ...d.payload }
    const isVar = key[0] === 'v', i = parseInt(key.slice(1), 10)
    const list = isVar ? p.variants : p.followups
    const it = list?.[i]
    if (!it?.text?.trim()) return { error: 'Kein Text' }
    const r = await refineAkquise(supabase, PROJECT_ID, { author: p.author, form: p.form, text: it.text, channel: isVar ? p.form.channel : 'followup', directive: directive && directive in DIRECTIVES ? directive : null, custom: s(custom, 400) || null })
    it.text = r.text
    p.history = [...(p.history || []), ev(who, 'refined', `${it.label}: ${custom ? `„${s(custom, 120)}“` : DIRECTIVES[directive!]?.label}`)].slice(-80)
    await supabase.from(TABLE).update({ payload: p, body: bodyOf(p), updated_by: me.email ?? who }).eq('id', id)
    return { error: null, text: r.text }
  } catch (e) { return fail(e) }
}

const PROJECT_LEAD_STAGES = ['prospect', 'outreach', 'contacted', 'qualified']

// Free entry → contact + company in the CRM (company by name, contact by name at that company)
async function ensureContact(supabase: any, f: SalesForm): Promise<{ person_id: string | null; company_id: string | null }> {
  if (!f.company) return { person_id: null, company_id: null }
  let companyId: string
  const { data: existing } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).ilike('name', f.company).limit(1)
  if (existing?.length) companyId = existing[0].id
  else {
    const { data: c, error } = await supabase.from('companies').insert({ project_id: PROJECT_ID, name: f.company, account_status: 'target', source: 'manual' }).select('id').single()
    if (error) throw new Error(error.message)
    companyId = c.id
  }
  const full = f.name.replace(/^(dr\.|prof\.)\s*/i, '').trim()
  if (!full) return { person_id: null, company_id: companyId }
  const found = (await supabase.from('people').select('id').eq('project_id', PROJECT_ID).eq('company_id', companyId).ilike('full_name', full).limit(1)).data?.[0]
  if (found) return { person_id: found.id, company_id: companyId }
  const [first, ...rest] = full.split(/\s+/)
  const { data, error } = await supabase.from('people').insert({
    project_id: PROJECT_ID, company_id: companyId, first_name: first || null, last_name: rest.join(' ') || null, full_name: full, job_title: f.role || null, source: 'manual',
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { person_id: data.id, company_id: companyId }
}

// "Gesendet": draft → published, logged on the contact (LinkedIn/E-Mail), lead created if there is none (not for pure relationship care)
export async function markSent(id: string, variant: number, followup?: number | null): Promise<R> {
  try {
    const { supabase, me, who } = await session()
    const { data: d } = await supabase.from(TABLE).select('*').eq('id', id).single()
    if (!d) return { error: 'Entwurf nicht gefunden' }
    const p: SalesPayload = { ...d.payload }
    const f = p.form
    const msg = followup != null ? p.followups?.[followup] : p.variants?.[variant]
    if (!msg?.text?.trim()) return { error: 'Kein Text zum Senden' }
    const now = new Date().toISOString()
    let crm = { person_id: p.crm?.person_id ?? null, company_id: p.crm?.company_id ?? null, lead_id: p.crm?.lead_id ?? null }
    if (!crm.person_id && !crm.company_id && p.crm?.create) crm = { ...crm, ...(await ensureContact(supabase, f)) }
    let activityId: string | null = null
    if (crm.company_id || crm.person_id) {
      if (crm.company_id && !crm.lead_id && f.offer !== 'none') {
        const { data: open } = await supabase.from('leads').select('id').eq('company_id', crm.company_id).in('stage', PROJECT_LEAD_STAGES).limit(1)
        const { data: deal } = open?.length ? { data: null } : await supabase.from('opportunities').select('id').eq('company_id', crm.company_id).not('stage', 'in', '(won,lost)').limit(1)
        if (open?.length) crm.lead_id = open[0].id
        else if (!deal?.length) {
          const { data: lead } = await supabase.from('leads').insert({ project_id: PROJECT_ID, company_id: crm.company_id, person_id: crm.person_id, owner_id: me.user_id, stage: 'prospect', source: 'manual' }).select('id').single()
          crm.lead_id = lead?.id ?? null
        }
      }
      const email = f.channel === 'email' && followup == null
      const type = email ? 'email' : f.channel === 'connect' && followup == null ? 'linkedin_connection' : 'linkedin_message'
      const text = (msg.subject ? `Betreff: ${msg.subject}\n\n` : '') + msg.text
      const { data: act } = await supabase.from('activities').insert({
        project_id: PROJECT_ID, company_id: crm.company_id, person_id: crm.person_id, activity_type: type, direction: 'outbound',
        channel: email ? 'email' : 'linkedin_message', source: 'manual', occurred_at: now, created_by: me.email ?? null,
        summary: `${followup != null ? 'Follow-up' : CHANNELS[f.channel].label} (${OFFERS[f.offer].label}, von ${p.author === 'simon' ? 'Simon' : 'Henri'})`,
        raw_reference: `draft:${id}:${followup != null ? 'f' + followup : 'v' + variant}`, extracted_intel: { body: text, draft_id: id },
      }).select('id').single()
      activityId = act?.id ?? null
    }
    p.crm = { ...p.crm, ...crm }
    p.sent = { at: now, by: who, variant: followup != null ? -1 - followup : variant, text: msg.text, activity_id: activityId }
    p.history = [...(p.history || []), ev(who, 'sent', `${msg.label}${crm.person_id || crm.company_id ? ' · im CRM geloggt' : ''}`)].slice(-80)
    if (followup == null) p.chosen = variant
    const { error } = await supabase.from(TABLE).update({ payload: p, body: bodyOf(p), status: 'published', published_at: d.published_at || now, updated_by: me.email ?? who }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/compose/drafts')
    revalidatePath('/pipeline')
    return { error: null }
  } catch (e) { return fail(e) }
}

export async function setArchived(id: string, archived: boolean): Promise<R> {
  try {
    const { supabase, me, who } = await session()
    const { data: d } = await supabase.from(TABLE).select('payload, published_at').eq('id', id).single()
    if (!d) return { error: 'Entwurf nicht gefunden' }
    const p: SalesPayload = { ...d.payload, history: [...(d.payload?.history || []), ev(who, archived ? 'archived' : 'restored')].slice(-80) }
    const status = archived ? 'archived' : d.published_at ? 'published' : 'draft'
    const { error } = await supabase.from(TABLE).update({ status, payload: p, updated_by: me.email ?? who }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/compose/drafts')
    return { error: null }
  } catch (e) { return fail(e) }
}

// ---------- settings ----------

export async function saveAkquiseSettings(cfg: AkquiseConfig): Promise<R> {
  try {
    const { supabase } = await session()
    const c = mergeAkquise(cfg)
    const clip = (v: string, n: number) => String(v || '').slice(0, n)
    const config = {
      context: clip(c.context, 6000), rules: clip(c.rules, 8000), addressAuto: clip(c.addressAuto, 600),
      voices: Object.fromEntries(Object.entries(c.voices).map(([k, v]) => [k, { full: clip(v.full, 80), first: clip(v.first, 40), email: clip(v.email, 120), voice: clip(v.voice, 5000) }])),
      offers: Object.fromEntries(Object.entries(c.offers).map(([k, v]) => [k, clip(v, 1500)])),
      floskeln: c.floskeln.slice(0, 60).map(x => clip(x, 60)),
    }
    const { error } = await supabase.from('automation_settings').upsert({ project_id: PROJECT_ID, agent_key: 'akquise', enabled: true, config, updated_at: new Date().toISOString() })
    if (error) return { error: error.message }
    revalidatePath('/compose/settings')
    return { error: null }
  } catch (e) { return fail(e) }
}

export async function addVoiceSample(author: Author, channel: string, text: string): Promise<R> {
  try {
    const { supabase, me } = await session()
    const t = s(text, 3000)
    if (t.length < 20) return { error: 'Bitte eine vollständige Nachricht einfügen' }
    const { error } = await supabase.from('sales_voice_samples').insert({ author: author === 'simon' ? 'simon' : 'henri', channel: channel in CHANNELS ? channel : 'dm', text: t, created_by: me.email ?? null })
    if (error) return { error: error.message }
    revalidatePath('/compose/settings')
    return { error: null }
  } catch (e) { return fail(e) }
}

export async function deleteVoiceSample(id: string): Promise<R> {
  try {
    const { supabase } = await session()
    const { error } = await supabase.from('sales_voice_samples').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/compose/settings')
    return { error: null }
  } catch (e) { return fail(e) }
}
