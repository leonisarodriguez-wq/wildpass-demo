// Funnel events (src/events.js): no cookies, no third parties. Each event carries an anonymous random session id
// (sessionStorage: it ends with the tab), the channel (web or agent), the experiment variants (public/exp.js),
// the device (by screen width) and, where it applies, the plan or the page. Never names, emails or birth dates.
const KEY = 'wildpass-session';
let memoryId = null;

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function sessionId() {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) { id = randomId(); sessionStorage.setItem(KEY, id); }
    return id;
  } catch {
    memoryId ??= randomId(); // storage blocked: one id for this page view
    return memoryId;
  }
}

// Fire and forget: measuring must never slow down or break the page.
export function track(event, { channel = 'web', plan, page } = {}) {
  const exp = window.__wildpassExp ?? {};
  const body = {
    event, session_id: sessionId(), channel,
    device: window.innerWidth < 700 ? 'mobile' : 'desktop',
    ...(plan && { plan }), ...(page && { page }),
    ...(exp.hero && { exp_hero: exp.hero }), ...(exp.upsell && { exp_upsell: exp.upsell }),
  };
  try {
    fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch { /* never mind */ }
}
