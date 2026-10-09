// Talks to Revenue OS with the user's existing login (session cookie of revenue-os-chi.vercel.app).
const API = 'https://revenue-os-chi.vercel.app/api/extension'

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'api') return
  fetch(API, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Revenue-OS-Extension': '1' },
    body: JSON.stringify(msg.body),
  })
    .then(async res => {
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* login page instead of JSON → not signed in */ }
      if (!json) return reply({ error: 'Bitte in Revenue OS anmelden.', login: API.replace('/api/extension', '/login') })
      reply(res.ok ? json : { error: json.error || `Fehler ${res.status}`, login: json.login })
    })
    .catch(() => reply({ error: 'Revenue OS nicht erreichbar.' }))
  return true // async reply
})
