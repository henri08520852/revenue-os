// Revenue OS panel on LinkedIn: save a profile as contact/lead, log messages, show CRM status.
// Reads only what is visible on the page, and only when you click.
(() => {
  if (window.__revenueOs) return
  window.__revenueOs = true

  const api = body => new Promise(resolve => chrome.runtime.sendMessage({ type: 'api', body }, r => resolve(r || { error: 'Keine Antwort' })))
  const text = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim()
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const slugFrom = href => (String(href || '').match(/\/in\/([^/?#]+)/) || [])[1] || null

  // ---------- page readers (best effort; every value stays editable in the panel) ----------

  // LinkedIn changes its markup often → several fallbacks, no reliance on class names
  const titleName = () => {
    const t = document.title.replace(/^\(\d+\)\s*/, '').split(/\s+[|–-]\s+/)[0].trim()
    return t && !/^linkedin$|feed|messaging|nachrichten/i.test(t) ? t : ''
  }

  function readProfile() {
    const slug = slugFrom(location.pathname)
    const tName = titleName()
    let nameEl = document.querySelector('main h1') || document.querySelector('h1')
    if (tName && text(nameEl) !== tName) {
      nameEl = [...document.querySelectorAll('h1, h2, h3, span, div, p')].find(el => el.childElementCount <= 2 && text(el) === tName) || nameEl
    }
    const name = text(nameEl) || tName

    // Top card = nearest ancestor of the name that also holds the follower/connection line
    let card = nameEl
    for (let i = 0; card && i < 8; i++) {
      if (/followers|follower|connections|kontakte|contact info|kontaktinfo/i.test(text(card)) && text(card).length > name.length + 20) break
      card = card.parentElement
    }
    card = nameEl?.closest('section') || card || document.querySelector('main') || document.body

    // Headline: first substantial line after the name
    let headline = text(document.querySelector('main .text-body-medium.break-words'))
    if (!headline) {
      const lines = String(card.innerText || '').split('\n').map(l => l.trim()).filter(Boolean)
      const at = lines.findIndex(l => l === name || l.startsWith(name))
      headline = lines.slice(at + 1).find(l => l.length >= 12 && l !== name && !/followers|follower|connections|kontakte|contact info|kontaktinfo|^·|^\d/i.test(l)) || ''
    }

    let company = ''
    const cur = document.querySelector('[aria-label*="Current company" i], [aria-label*="Aktuelles Unternehmen" i], [aria-label*="Aktuelle Firma" i]')
    if (cur) company = (cur.getAttribute('aria-label').split(':')[1] || '').split(/\.\s/)[0].replace(/\.$/, '').trim()
    if (!company) {
      const link = card.querySelector('a[href*="/company/"], button img[alt], a[href*="#experience"]')
      company = text(link?.closest('a, button')) || (link?.getAttribute?.('alt') || '').replace(/\s*logo$/i, '')
    }

    const split = splitHeadline(headline)
    const jobTitle = split.jobTitle
    if (!company) company = split.company
    const parts = name.split(' ')
    return { slug, name, firstName: parts.slice(0, -1).join(' ') || name, lastName: parts.length > 1 ? parts[parts.length - 1] : '', jobTitle: jobTitle.slice(0, 160), company: company.slice(0, 120) }
  }

  // "Consultant at The Green Recruitment Company, specialising …" → title + company
  function splitHeadline(headline) {
    let jobTitle = String(headline || '').split(/\s+\|\s+/)[0], company = ''
    const m = jobTitle.match(/^(.*?)(?:\s+(?:bei|at)\s+|\s*@\s*)(.+)$/i)
    if (m) { jobTitle = m[1].trim(); company = m[2].split(/\s*[,|·]\s*|\s+[-–]\s+/)[0].trim() }
    return { jobTitle: jobTitle.slice(0, 160), company: company.slice(0, 120) }
  }

  const GENERIC = /^(contact info|kontaktinfo(rmationen)?|view profile|profil anzeigen|see profile|profil|messaging|nachrichten|inmail|sponsored|active now|online)$/i
  const firstLine = el => String(el?.innerText || el?.textContent || '').split('\n').map(l => l.trim()).find(Boolean) || ''
  const looksLikeName = t => !!t && t.length <= 60 && !GENERIC.test(t) && t.split(/\s+/).length >= 2 && t.split(/\s+/).length <= 6 && !/\d{2}|[@:]/.test(t)

  function readThread() {
    const root = document.querySelector('.msg-convo-wrapper, .msg-thread, main') || document.body

    // Partner name + header element
    let nameEl = [...root.querySelectorAll('.msg-entity-lockup__entity-title, #thread-detail-jump-target, .msg-title-bar h2, .msg-thread__link-to-profile, h2')]
      .find(el => looksLikeName(firstLine(el)))
    if (!nameEl) nameEl = [...root.querySelectorAll('a[href*="/in/"]')].find(a => looksLikeName(firstLine(a)))
    const name = firstLine(nameEl).replace(/\s*\(.*?\)\s*$/, '')

    // Profile link: one whose text / label carries the name, else the header's link
    const links = [...root.querySelectorAll('a[href*="/in/"]')]
    const first = name.split(' ')[0]
    const link = links.find(a => first && (text(a).includes(name) || (a.getAttribute('aria-label') || '').includes(name)))
      || nameEl?.closest('a[href*="/in/"]') || nameEl?.parentElement?.querySelector('a[href*="/in/"]') || links[0]

    // Headline: the line under the name in the header
    let headline = ''
    let box = nameEl
    for (let i = 0; box && i < 4 && !headline; i++) {
      box = box.parentElement
      const lines = String(box?.innerText || '').split('\n').map(l => l.trim()).filter(Boolean)
      const at = lines.findIndex(l => l.startsWith(name))
      if (at >= 0) headline = lines.slice(at + 1).find(l => l.length >= 10 && !l.startsWith(name) && !GENERIC.test(l) && !/^(active|aktiv|online|·)/i.test(l)) || ''
    }

    // Messages with sender (sender name sits on the first bubble of a group)
    const bodies = [...root.querySelectorAll('.msg-s-event-listitem__body, [class*="event-listitem__body"], [class*="msg-s-event-listitem__message-bubble"]')]
      .filter((el, i, all) => !all.some((o, j) => j !== i && o.contains(el) && o !== el))
    const messages = []
    for (const b of bodies) {
      const t = String(b.innerText || '').trim()
      if (!t) continue
      let sender = '', ev = b.closest('li, .msg-s-message-list__event')
      while (ev && !sender) {
        sender = firstLine(ev.querySelector('.msg-s-message-group__name, [class*="message-group__name"], [class*="message-group__profile-link"]'))
        ev = ev.previousElementSibling
      }
      messages.push({ text: t, inbound: sender ? !!first && sender.includes(first) : true })
    }
    const selection = String(window.getSelection() || '').trim()
    const last = messages[messages.length - 1]
    return {
      kind: 'thread', slug: slugFrom(link?.getAttribute('href')), name, headline, ...splitHeadline(headline),
      firstName: name.split(' ').slice(0, -1).join(' ') || name, lastName: name.split(' ').length > 1 ? name.split(' ').pop() : '',
      body: selection || last?.text || '', inbound: selection ? true : last ? last.inbound : true, messages,
    }
  }

  function diagnosis() {
    const root = kind() === 'thread' ? (document.querySelector('.msg-convo-wrapper, .msg-thread, main') || document.body) : (document.querySelector('main') || document.body)
    const out = [`${location.pathname.replace(/thread\/[^/]+/, 'thread/…')} | title: ${document.title}`, 'gelesen: ' + JSON.stringify({ ...ctx, messages: ctx?.messages?.length, body: ctx?.body?.slice(0, 40) })]
    const walk = (el, depth) => {
      if (out.length > 400 || depth > 14) return
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 50)
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(c => c && !/^(t-|ember|pv|ph|pt|pb|mt|mb|ml|mr|p\d|m\d)/.test(c)).slice(0, 3).join('.') : ''
      const href = el.getAttribute?.('href')?.replace(/\?.*/, '') || ''
      if (own || href || /^H\d$/.test(el.tagName) || cls) out.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${href ? ' →' + href : ''}${own ? ' "' + own + '"' : ''}`)
      for (const c of el.children) if (!['SCRIPT', 'STYLE', 'SVG', 'svg', 'IMG'].includes(c.tagName)) walk(c, depth + 1)
    }
    walk(root, 0)
    return out.join('\n')
  }

  // ---------- panel (shadow DOM so LinkedIn styles don't leak in) ----------

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646'
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>
    *{box-sizing:border-box;font-family:"Google Sans",Roboto,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .tab{display:flex;align-items:center;gap:7px;background:#1a56db;color:#fff;border:none;border-radius:24px;padding:10px 16px;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 6px 18px rgba(26,86,219,.35)}
    .tab .sub{font-weight:500;opacity:.85;font-size:12px}
    .card{width:360px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);font-size:14px;color:#1f1f1f;overflow:hidden}
    .head{display:flex;align-items:center;gap:10px;padding:14px 12px 14px 18px;background:#1a56db;color:#fff;font-size:17px;font-weight:600}
    .head .t{flex:1}
    .head button{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;width:32px;height:32px;border-radius:50%}
    .head button:hover{background:rgba(255,255,255,.15)}
    .scroll{overflow:auto}
    .sec{padding:14px 18px;border-bottom:1px solid #e8eaed}
    .sec:last-child{border-bottom:none}
    .h{font-size:15px;font-weight:500;color:#1f1f1f;margin-bottom:12px}
    .who{font-size:15px;font-weight:500}.who a{color:#1f1f1f;text-decoration:none}.who a:hover{text-decoration:underline}
    .meta{color:#5f6368;font-size:13px;margin-top:2px}
    .meta a{color:#5f6368;text-decoration:none}.meta a:hover{text-decoration:underline}
    .line{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13.5px}
    .line a{color:#1a56db;text-decoration:none;font-weight:500}
    .dot{width:8px;height:8px;border-radius:50%;background:#9aa0a6;flex:none}.dot.ok{background:#1e8e3e}
    .pill{font-size:11.5px;font-weight:600;border-radius:12px;padding:2px 9px}
    .lead{background:#efe9ff;color:#6d28d9}.deal{background:#e6f4ea;color:#137333}
    .f{position:relative;margin-bottom:12px}
    .f label{position:absolute;left:10px;top:-7px;background:#fff;padding:0 4px;font-size:11.5px;color:#5f6368}
    .f input,.f select,.f textarea{width:100%;padding:13px 12px 11px;border:1px solid #9aa0a6;border-radius:6px;font-size:14px;color:#1f1f1f;background:#fff;outline:none}
    .f input:focus,.f select:focus,.f textarea:focus{border:2px solid #1a56db;padding:12px 11px 10px}
    .f textarea{resize:vertical;min-height:96px;line-height:1.4}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .hint{font-size:12px;color:#5f6368;margin:-6px 0 12px 2px}.hint.ok{color:#137333}
    .chk{display:flex;align-items:center;gap:10px;font-size:14px;margin:4px 0 10px;cursor:pointer}
    .chk input{width:18px;height:18px;accent-color:#1a56db;margin:0}
    .chk input.n{width:46px;height:auto;padding:4px 6px;border:1px solid #9aa0a6;border-radius:5px;font-size:13px;text-align:center}
    .ind{margin-left:28px}
    .seg{display:flex;border:1px solid #9aa0a6;border-radius:20px;overflow:hidden;margin-bottom:12px}
    .seg button{flex:1;border:none;background:#fff;padding:7px 6px;font-size:13px;cursor:pointer;color:#3c4043}
    .seg button+button{border-left:1px solid #9aa0a6}
    .seg button.on{background:#e8f0fe;color:#1a56db;font-weight:600}
    .btn{padding:10px 22px;border:none;border-radius:20px;font-size:14px;font-weight:500;cursor:pointer;background:#1a56db;color:#fff}
    .btn:hover{box-shadow:0 1px 3px rgba(0,0,0,.25)}
    .btn:disabled{opacity:.55;cursor:default;box-shadow:none}
    .link{background:none;border:none;color:#1a56db;font-size:14px;cursor:pointer;padding:0;display:flex;align-items:center;gap:6px}
    .msg{margin-top:10px;font-size:13px}.err{color:#d93025}.okm{color:#137333}
    .muted{color:#5f6368;font-size:13px}
    .diag{display:block;margin:0 auto 10px;background:none;border:none;color:#9aa0a6;font-size:11px;cursor:pointer}
  </style><div id="root"></div>`
  const root = shadow.getElementById('root')

  let open = false, page = '', ctx = null, crm = null, msg = '', busy = false
  let form = {}, taskOpen = false

  const kind = () => location.pathname.startsWith('/in/') ? 'profile' : location.pathname.startsWith('/messaging/') ? 'thread' : null
  const addDays = n => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10) }

  // "The Relevance Group GmbH" ≈ "the relevance group"
  const norm = s => String(s || '').toLowerCase().replace(/\b(gmbh|ag|se|kg|ug|co|inc|ltd|llc|group|gruppe|holding)\b|&|\.|,/g, ' ').replace(/\s+/g, ' ').trim()
  function matchCompany(name) {
    const n = norm(name), list = crm?.companies || []
    if (!n) return null
    return list.find(c => norm(c.name) === n) || list.find(c => { const m = norm(c.name); return m.length >= 4 && n.length >= 4 && (m.includes(n) || n.includes(m)) }) || null
  }

  function resetForm() {
    const match = crm?.company ? { id: crm.company.id } : matchCompany(ctx.company)
    form = {
      first: ctx.firstName, last: ctx.lastName, title: crm?.person?.jobTitle || ctx.jobTitle, email: crm?.person?.email || '',
      companyId: match ? match.id : 'new', companyName: ctx.company,
      lead: true, stage: ctx.kind === 'thread' && ctx.messages?.some(m => m.inbound) && ctx.messages?.some(m => !m.inbound) ? 'contacted' : 'outreach', fu: true, days: 5,
      text: ctx.body || '', direction: ctx.inbound ? 'inbound' : 'outbound', all: false,
      taskTitle: 'LinkedIn Follow-up', taskDate: addDays(3),
    }
  }

  function statusHtml() {
    if (!crm) return '<div class="sec muted">Prüfe Revenue OS …</div>'
    if (crm.error) return `<div class="sec"><span class="err">${esc(crm.error)}</span>${crm.login ? `<div class="line"><a href="${esc(crm.login)}" target="_blank">In Revenue OS anmelden ↗</a></div>` : ''}</div>`
    if (!crm.known) return `<div class="sec"><div class="who">${esc(ctx.name || 'Unbekannt')}</div><div class="line"><span class="dot"></span>Noch nicht im CRM</div></div>`
    const leads = (crm.leads || []).map(l => `<div class="line"><span class="dot ok"></span>Lead <a href="${esc(l.url)}" target="_blank">${esc(l.name || crm.company?.name || 'Lead')}</a><span class="pill lead">${esc(l.stage)}</span></div>`).join('')
    const deals = (crm.deals || []).map(d => `<div class="line"><span class="dot ok"></span>Deal <a href="${esc(d.url)}" target="_blank">${esc(d.name || 'Deal')}</a><span class="pill deal">${esc(d.stage)}</span></div>`).join('')
    const due = crm.nextTask?.due_at ? new Date(crm.nextTask.due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''
    return `<div class="sec">
      <div class="who"><a href="${esc(crm.person.url)}" target="_blank">${esc(crm.person.name)}</a></div>
      <div class="meta">${esc(crm.person.jobTitle || '')}${crm.person.jobTitle && crm.company ? ' · ' : ''}${crm.company ? `<a href="${esc(crm.company.url)}" target="_blank">${esc(crm.company.name)}</a>` : ''}</div>
      ${leads || deals ? leads + deals : '<div class="line"><span class="dot ok"></span>Im CRM · kein offener Lead/Deal</div>'}
      ${crm.nextTask ? `<div class="line muted">📋 ${esc(crm.nextTask.title)}${due ? ' · ' + due : ''}</div>` : ''}
    </div>`
  }

  const field = (id, label, value, attrs = '') => `<div class="f"><label>${label}</label><input id="${id}" value="${esc(value)}" autocomplete="off" data-lpignore="true" ${attrs}></div>`

  function contactFields() {
    const hasOpen = crm?.known && (crm.leads?.length || crm.deals?.length)
    const opts = (crm?.companies || []).map(c => `<option value="${esc(c.id)}" ${form.companyId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    const picked = form.companyId !== 'new' && (crm?.companies || []).find(c => c.id === form.companyId)
    return `<div class="row">${field('first', 'Vorname', form.first)}${field('last', 'Nachname', form.last)}</div>
      ${field('title', 'Position', form.title)}
      ${field('email', 'E-Mail (optional)', form.email, 'type="email" placeholder="für den Gmail-Abgleich"')}
      <div class="f"><label>Company</label><select id="companyId"><option value="new" ${form.companyId === 'new' ? 'selected' : ''}>+ Neue Company${form.companyName ? ': ' + esc(form.companyName) : ''}</option>${opts}</select></div>
      ${form.companyId === 'new' ? field('companyName', 'Neue Company – Name', form.companyName) : `<div class="hint ok">✓ ${esc(picked?.name || '')} ist schon im CRM</div>`}
      ${hasOpen ? '' : `
      <label class="chk"><input type="checkbox" id="lead" ${form.lead ? 'checked' : ''}> Als Lead in die Pipeline</label>
      ${form.lead ? `<div class="ind">
        <div class="seg"><button id="st-outreach" class="${form.stage === 'outreach' ? 'on' : ''}">Outreach</button><button id="st-contacted" class="${form.stage === 'contacted' ? 'on' : ''}">Im Gespräch</button></div>
        <label class="chk"><input type="checkbox" id="fu" ${form.fu ? 'checked' : ''}> Follow-up in <input class="n" id="days" value="${esc(form.days)}" autocomplete="off"> Tagen</label>
      </div>` : ''}`}`
  }

  function profileForm() {
    const known = crm?.known, hasOpen = known && (crm.leads?.length || crm.deals?.length)
    return `<div class="sec">
      <div class="h">${known ? 'Kontakt aktualisieren' : 'Kontakt anlegen'}</div>
      ${contactFields()}
      <button class="btn" id="save" ${busy ? 'disabled' : ''}>${busy ? 'Speichern …' : known ? 'Aktualisieren' : form.lead && !hasOpen ? 'Kontakt & Lead anlegen' : 'Kontakt anlegen'}</button>
      ${msg ? `<div class="msg">${msg}</div>` : ''}
    </div>`
  }

  function threadForm() {
    const first = (ctx.name || 'Kontakt').split(' ')[0], known = crm?.known
    const n = ctx.messages?.length || 0
    const nothing = !form.all && !String(form.text || '').trim()
    return `${known ? '' : `<div class="sec"><div class="h">Kontakt anlegen</div>${contactFields()}</div>`}
    <div class="sec">
      <div class="h">Nachricht loggen</div>
      ${n > 1 ? `<label class="chk"><input type="checkbox" id="all" ${form.all ? 'checked' : ''}> Ganzen Verlauf loggen (${n} Nachrichten)</label>` : ''}
      ${form.all ? '<div class="hint">Absender wird pro Nachricht erkannt, Doppeltes wird übersprungen.</div>' : `
      <div class="seg"><button id="in" class="${form.direction === 'inbound' ? 'on' : ''}">Antwort von ${esc(first)}</button><button id="out" class="${form.direction === 'outbound' ? 'on' : ''}">Von uns</button></div>
      <div class="f"><label>Nachricht (letzte oder markierter Text)</label><textarea id="text" placeholder="Nachricht markieren oder hier einfügen">${esc(form.text)}</textarea></div>`}
      <button class="btn" id="log" ${busy || nothing ? 'disabled' : ''}>${busy ? 'Speichern …' : known ? 'Nachricht loggen' : 'Kontakt anlegen & loggen'}</button>
      ${msg ? `<div class="msg">${msg}</div>` : ''}
    </div>`
  }

  function taskForm() {
    if (!crm?.known) return ''
    if (!taskOpen) return `<div class="sec"><button class="link" id="task-open">＋ Aufgabe anlegen</button></div>`
    return `<div class="sec">
      <div class="h">Aufgabe</div>
      ${field('taskTitle', 'Titel', form.taskTitle)}
      ${field('taskDate', 'Fällig am', form.taskDate, 'type="date"')}
      <button class="btn" id="task-save" ${busy ? 'disabled' : ''}>Aufgabe anlegen</button>
    </div>`
  }

  function tabLabel() {
    if (!crm?.known) return '⚡ Revenue OS'
    const s = crm.deals?.[0] ? 'Deal · ' + crm.deals[0].stage : crm.leads?.[0] ? 'Lead · ' + crm.leads[0].stage : 'im CRM'
    return `⚡ Revenue OS <span class="sub">✓ ${esc(s)}</span>`
  }

  function render() {
    const k = kind()
    host.style.display = k ? 'block' : 'none'
    if (!k) return
    if (!open) {
      root.innerHTML = `<button class="tab" id="open">${tabLabel()}</button>`
      shadow.getElementById('open').onclick = () => { open = true; refresh(true) }
      return
    }
    const ready = ctx && crm && !crm.error
    root.innerHTML = `<div class="card">
      <div class="head"><span class="t">Revenue OS</span><button id="reload" title="Seite neu einlesen">↻</button><button id="close" title="Schließen">✕</button></div>
      <div class="scroll">${statusHtml()}${ready ? (k === 'profile' ? profileForm() : threadForm()) + taskForm() : ''}<button class="diag" id="diag">Etwas falsch erkannt? Diagnose kopieren</button></div>
    </div>`
    const $ = id => shadow.getElementById(id)
    $('close').onclick = () => { open = false; render() }
    $('reload').onclick = () => refresh(true)
    $('diag').onclick = async () => {
      try { await navigator.clipboard.writeText(diagnosis()); $('diag').textContent = 'Kopiert ✓ – bitte an Claude schicken' } catch { $('diag').textContent = 'Kopieren nicht möglich' }
    }
    // Keep typed values across re-renders
    for (const id of ['first', 'last', 'title', 'email', 'companyName', 'days', 'text', 'taskTitle', 'taskDate']) {
      if ($(id)) $(id).oninput = e => { form[id] = e.target.value }
    }
    if ($('companyId')) $('companyId').onchange = e => { form.companyId = e.target.value; render() }
    if ($('lead')) $('lead').onchange = e => { form.lead = e.target.checked; render() }
    if ($('fu')) $('fu').onchange = e => { form.fu = e.target.checked }
    for (const st of ['outreach', 'contacted']) if ($('st-' + st)) $('st-' + st).onclick = () => { form.stage = st; render() }
    if ($('in')) $('in').onclick = () => { form.direction = 'inbound'; render() }
    if ($('out')) $('out').onclick = () => { form.direction = 'outbound'; render() }
    if ($('all')) $('all').onchange = e => { form.all = e.target.checked; render() }
    if ($('text')) $('text').oninput = e => { form.text = e.target.value; const b = $('log'); if (b && !busy) b.disabled = !e.target.value.trim() }
    if ($('task-open')) $('task-open').onclick = () => { taskOpen = true; render() }
    if ($('task-save')) $('task-save').onclick = addTask
    if ($('save')) $('save').onclick = save
    if ($('log')) $('log').onclick = log
  }

  const profileUrl = () => ctx?.slug ? `https://www.linkedin.com/in/${ctx.slug}/` : null

  async function refresh(reread) {
    const k = kind()
    if (!k) { render(); return }
    if (reread || !ctx?.name) {
      // The page may still be loading → retry a few times until the name shows up
      for (let i = 0; i < 8; i++) {
        ctx = k === 'profile' ? readProfile() : readThread()
        if ((ctx.name && (k === 'profile' || ctx.messages.length)) || kind() !== k) break
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    msg = ''; crm = null; taskOpen = false; render()
    crm = await api({ action: 'lookup', profileUrl: profileUrl(), name: ctx.name })
    resetForm()
    render()
  }

  async function run(body, ok) {
    busy = true; msg = ''; render()
    const res = await api(body)
    busy = false
    if (res.error) msg = `<span class="err">${esc(res.error)}</span>`
    else { crm = { ...res, companies: res.companies || crm?.companies }; msg = `<span class="okm">${ok(res)}</span>` }
    render()
    return res
  }

  function contactPayload() {
    const hasOpen = crm?.known && (crm.leads?.length || crm.deals?.length)
    return {
      action: 'saveProfile', profileUrl: profileUrl(),
      firstName: form.first, lastName: form.last, jobTitle: form.title, email: form.email,
      companyId: form.companyId === 'new' ? null : form.companyId, companyName: form.companyId === 'new' ? form.companyName : '',
      createLead: !hasOpen && form.lead, leadStage: form.stage, followUpDays: form.lead && form.fu ? Number(form.days) || 5 : 0,
    }
  }

  async function save() {
    if (!String(form.first || '').trim() && !String(form.last || '').trim()) { msg = '<span class="err">Bitte einen Namen eingeben.</span>'; return render() }
    const res = await run(contactPayload(), r => r.leads?.length ? 'Gespeichert ✓ – Lead ist in der Pipeline.' : 'Gespeichert ✓')
    if (!res.error && form.companyId === 'new' && res.company) form.companyId = res.company.id
  }

  async function log() {
    const created = !crm?.known
    if (created) {
      if (!String(form.first || '').trim() && !String(form.last || '').trim()) { msg = '<span class="err">Bitte einen Namen eingeben.</span>'; return render() }
      if (!ctx.slug) { msg = '<span class="err">Profil-Link nicht gefunden – bitte einmal das Profil öffnen und dort speichern.</span>'; return render() }
      busy = true; msg = ''; render()
      const res = await api(contactPayload())
      busy = false
      if (res.error) { msg = `<span class="err">${esc(res.error)}</span>`; return render() }
      crm = { ...res, companies: crm?.companies }
    }
    const messages = form.all
      ? ctx.messages.map(m => ({ text: m.text, direction: m.inbound ? 'inbound' : 'outbound' }))
      : [{ text: form.text, direction: form.direction }]
    const name = [form.first, form.last].filter(Boolean).join(' ') || ctx.name
    await run({ action: 'logMessage', profileUrl: profileUrl(), name, messages },
      r => `${created ? 'Kontakt angelegt ✓ · ' : ''}${r.logged ? `${r.logged} Nachricht${r.logged > 1 ? 'en' : ''} geloggt ✓` : 'War schon geloggt.'}${r.advanced ? ' – Lead steht jetzt auf „Im Gespräch“.' : ''}`)
  }

  async function addTask() {
    const res = await run({ action: 'addTask', profileUrl: profileUrl(), name: ctx.name, title: form.taskTitle, dueDate: form.taskDate, taskType: 'follow_up' }, () => 'Aufgabe angelegt ✓')
    if (!res.error) taskOpen = false, render()
  }

  // LinkedIn is a single-page app → react to URL changes
  setInterval(() => {
    const now = kind() ? location.pathname : ''
    if (now !== page) { page = now; ctx = null; setTimeout(() => refresh(true), 1200) }
  }, 800)
})()
