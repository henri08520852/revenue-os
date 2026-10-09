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

  function readProfile() {
    const slug = slugFrom(location.pathname)
    const name = text(document.querySelector('main h1'))
    const headline = text(document.querySelector('main .text-body-medium.break-words, main [data-generated-suggestion-target] .text-body-medium'))
    let company = ''
    const btn = document.querySelector('main button[aria-label*="Current company"], main button[aria-label*="Aktuelles Unternehmen"], main [aria-label*="Current company"], main [aria-label*="Aktuelles Unternehmen"]')
    if (btn) company = (btn.getAttribute('aria-label').split(':')[1] || '').split('.')[0].trim()
    let jobTitle = headline
    const m = headline.match(/^(.*?)\s+(?:bei|at|@|\|)\s+(.+)$/i)
    if (m) { jobTitle = m[1].trim(); if (!company) company = m[2].split('|')[0].trim() }
    const parts = name.split(' ')
    return { slug, name, firstName: parts.slice(0, -1).join(' ') || name, lastName: parts.length > 1 ? parts[parts.length - 1] : '', jobTitle: jobTitle.slice(0, 160), company }
  }

  function readThread() {
    const root = document.querySelector('.msg-thread, .msg-convo-wrapper, main') || document
    const link = root.querySelector('.msg-thread a[href*="/in/"], .msg-entity-lockup a[href*="/in/"], a.msg-thread__link-to-profile, header a[href*="/in/"]') || root.querySelector('a[href*="/in/"]')
    const name = text(root.querySelector('.msg-entity-lockup__entity-title, h2.msg-entity-lockup__entity-title, .msg-thread__link-to-profile')) || text(link)
    // Selected text wins; otherwise the newest message bubble
    const selection = String(window.getSelection() || '').trim()
    let body = selection, sender = ''
    if (!body) {
      const bodies = root.querySelectorAll('.msg-s-event-listitem__body')
      const last = bodies[bodies.length - 1]
      body = text(last)
      // Sender name sits on the first bubble of a group → walk back to the nearest one
      let ev = last?.closest('.msg-s-message-list__event')
      while (ev && !sender) {
        sender = text(ev.querySelector('.msg-s-message-group__name'))
        ev = ev.previousElementSibling
      }
    }
    const first = name.split(' ')[0]
    const inbound = sender ? !!first && sender.includes(first) : true
    return { slug: slugFrom(link?.getAttribute('href')), name, body, inbound }
  }

  // ---------- panel (shadow DOM so LinkedIn styles don't leak in) ----------

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646'
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .tab{background:#2563eb;color:#fff;border:none;border-radius:20px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(37,99,235,.35)}
    .card{width:330px;max-height:80vh;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-size:13px;color:#111827}
    .head{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:#2563eb;color:#fff;border-radius:14px 14px 0 0;font-weight:700}
    .head button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer}
    .body{padding:12px 14px;display:flex;flex-direction:column;gap:9px}
    label{display:block;font-size:10.5px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
    input,textarea{width:100%;padding:7px 9px;border:1px solid #e5e7eb;border-radius:7px;font-size:12.5px;color:#111827;outline:none}
    textarea{resize:vertical;min-height:80px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .btn{width:100%;padding:8px;border:none;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;background:#2563eb;color:#fff}
    .btn.sec{background:#f3f4f6;color:#374151}
    .btn:disabled{opacity:.6;cursor:default}
    .status{background:#f9fafb;border:1px solid #f3f4f6;border-radius:9px;padding:8px 10px;font-size:12px;line-height:1.5}
    .status a{color:#2563eb;text-decoration:none}
    .pill{display:inline-block;font-size:10.5px;font-weight:700;border-radius:10px;padding:1px 7px;margin-left:4px}
    .lead{background:#ede9fe;color:#6d28d9}.deal{background:#dcfce7;color:#15803d}
    .muted{color:#6b7280;font-size:11.5px}
    .err{color:#dc2626;font-size:12px}.ok{color:#15803d;font-size:12px}
    .check{display:flex;align-items:center;gap:6px;font-size:12px;color:#374151}
    .check input{width:auto}
    .seg{display:flex;background:#f3f4f6;border-radius:8px;padding:2px}
    .seg button{flex:1;border:none;background:none;padding:5px;font-size:11.5px;border-radius:6px;cursor:pointer;color:#6b7280}
    .seg button.on{background:#fff;color:#111827;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  </style><div id="root"></div>`
  const root = shadow.getElementById('root')

  let open = false, page = '', ctx = null, crm = null, msg = '', busy = false, direction = 'inbound'

  const kind = () => location.pathname.startsWith('/in/') ? 'profile' : location.pathname.startsWith('/messaging/') ? 'thread' : null

  function statusHtml() {
    if (!crm) return '<div class="status muted">Prüfe Revenue OS …</div>'
    if (crm.error) return `<div class="status"><span class="err">${esc(crm.error)}</span>${crm.login ? ` <a href="${esc(crm.login)}" target="_blank">Anmelden ↗</a>` : ''}</div>`
    if (!crm.known) return '<div class="status muted">Noch nicht in Revenue OS.</div>'
    const leads = (crm.leads || []).map(l => `<div>Lead: <a href="${esc(l.url)}" target="_blank">${esc(l.name || crm.company?.name || 'Lead')}</a><span class="pill lead">${esc(l.stage)}</span></div>`).join('')
    const deals = (crm.deals || []).map(d => `<div>Deal: <a href="${esc(d.url)}" target="_blank">${esc(d.name || 'Deal')}</a><span class="pill deal">${esc(d.stage)}</span></div>`).join('')
    return `<div class="status">
      <div>✅ <a href="${esc(crm.person.url)}" target="_blank"><b>${esc(crm.person.name)}</b></a>${crm.company ? ` · <a href="${esc(crm.company.url)}" target="_blank">${esc(crm.company.name)}</a>` : ''}</div>
      ${leads}${deals}
      ${crm.nextTask ? `<div class="muted">Nächste Aufgabe: ${esc(crm.nextTask.title)}</div>` : ''}
    </div>`
  }

  function render() {
    const k = kind()
    host.style.display = k ? 'block' : 'none'
    if (!k) return
    if (!open) {
      root.innerHTML = `<button class="tab" id="open">⚡ Revenue OS${crm?.known ? ' ✓' : ''}</button>`
      shadow.getElementById('open').onclick = () => { open = true; render() }
      return
    }
    const head = `<div class="head">⚡ Revenue OS <span><button id="reload" title="Seite neu einlesen">↻</button><button id="close" title="Schließen">×</button></span></div>`
    let body = ''
    if (k === 'profile') {
      const known = crm?.known
      body = `${statusHtml()}
        <div class="row"><div><label>Vorname</label><input id="first" value="${esc(ctx.firstName)}"></div><div><label>Nachname</label><input id="last" value="${esc(ctx.lastName)}"></div></div>
        <div><label>Position</label><input id="title" value="${esc(ctx.jobTitle)}"></div>
        <div><label>Firma</label><input id="company" value="${esc(ctx.company)}" placeholder="Firmenname"></div>
        ${known && (crm.leads?.length || crm.deals?.length) ? '' : `
        <div class="check"><input type="checkbox" id="lead" checked> Als Lead in die Pipeline (Outreach)</div>
        <div class="check"><input type="checkbox" id="fu" checked> Follow-up-Aufgabe in <input id="days" value="5" style="width:38px;padding:3px 5px"> Tagen</div>`}
        <button class="btn" id="save" ${busy ? 'disabled' : ''}>${busy ? 'Speichern …' : known ? 'Daten aktualisieren' : 'In Revenue OS speichern'}</button>`
    } else {
      body = `${statusHtml()}
        <div class="muted">${esc(ctx.name || 'Unterhaltung')} – letzte Nachricht (oder markierten Text) loggen:</div>
        <div class="seg"><button id="in" class="${direction === 'inbound' ? 'on' : ''}">Antwort von ${esc((ctx.name || 'Kontakt').split(' ')[0])}</button><button id="out" class="${direction === 'outbound' ? 'on' : ''}">Von uns</button></div>
        <textarea id="text">${esc(ctx.body)}</textarea>
        <button class="btn" id="log" ${busy || !crm?.known ? 'disabled' : ''}>${busy ? 'Speichern …' : 'Nachricht loggen'}</button>
        ${crm && !crm.known && !crm.error ? '<div class="muted">Erst das Profil der Person öffnen und speichern.</div>' : ''}`
    }
    root.innerHTML = `<div class="card">${head}<div class="body">${body}${msg}</div></div>`
    shadow.getElementById('close').onclick = () => { open = false; render() }
    shadow.getElementById('reload').onclick = () => refresh(true)
    const $ = id => shadow.getElementById(id)
    if ($('save')) $('save').onclick = save
    if ($('log')) $('log').onclick = log
    if ($('in')) $('in').onclick = () => { direction = 'inbound'; render() }
    if ($('out')) $('out').onclick = () => { direction = 'outbound'; render() }
  }

  async function refresh(reread) {
    const k = kind()
    if (!k) { render(); return }
    if (reread || !ctx) {
      ctx = k === 'profile' ? readProfile() : readThread()
      if (k === 'thread') direction = ctx.inbound ? 'inbound' : 'outbound'
    }
    msg = ''; crm = null; render()
    crm = await api({ action: 'lookup', profileUrl: ctx.slug ? `https://www.linkedin.com/in/${ctx.slug}/` : null, name: ctx.name })
    render()
  }

  async function save() {
    const $ = id => shadow.getElementById(id)
    busy = true; msg = ''; render()
    const res = await api({
      action: 'saveProfile', profileUrl: `https://www.linkedin.com/in/${ctx.slug}/`,
      firstName: $('first').value, lastName: $('last').value, jobTitle: $('title').value, companyName: $('company').value,
      createLead: $('lead') ? $('lead').checked : false, followUpDays: $('fu')?.checked ? Number($('days').value) || 5 : 0,
    })
    busy = false
    if (res.error) msg = `<div class="err">${esc(res.error)}</div>`
    else { crm = res; msg = '<div class="ok">Gespeichert ✓</div>' }
    render()
  }

  async function log() {
    const $ = id => shadow.getElementById(id)
    busy = true; msg = ''; render()
    const res = await api({ action: 'logMessage', profileUrl: ctx.slug ? `https://www.linkedin.com/in/${ctx.slug}/` : null, name: ctx.name, text: $('text').value, direction })
    busy = false
    if (res.error) msg = `<div class="err">${esc(res.error)}</div>`
    else { crm = res; msg = `<div class="ok">${res.duplicate ? 'War schon geloggt.' : direction === 'inbound' ? 'Antwort geloggt ✓ (Outreach-Lead → „Im Gespräch“)' : 'Nachricht geloggt ✓'}</div>` }
    render()
  }

  // LinkedIn is a single-page app → react to URL changes
  setInterval(() => {
    const now = kind() ? location.pathname : ''
    if (now !== page) { page = now; ctx = null; setTimeout(() => refresh(true), 1200) }
  }, 800)
})()
