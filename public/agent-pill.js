// The floating "Tu asistente está usando Wildpass" pill. It stays hidden until an AI assistant really calls a
// WebMCP tool on this page, then shows a short log of fixed Spanish phrases with the time ("Ha calculado el precio").
// Privacy: the log never shows what the assistant sent or got back (names, emails, ids, tokens, links) —
// only which step happened, the plan name and whether the email went out.
// It hides itself again after a while without tool calls (unless the person has it open).

const IDLE_MS = 2 * 60 * 1000;

const pill = document.getElementById('agent-pill');
const toggle = document.getElementById('agent-toggle');
const log = document.getElementById('agent-log');
const steps = document.getElementById('agent-steps');
const count = document.getElementById('agent-count');
const status = document.getElementById('agent-status');
let idleTimer = 0;
let pulseTimer = 0;

function setOpen(open) {
  log.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.title = open ? toggle.dataset.hide : toggle.dataset.show;
}

toggle?.addEventListener('click', () => setOpen(log.hidden));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && log && !log.hidden) { setOpen(false); if (pill.contains(document.activeElement)) toggle.focus(); }
});

// The total bar's real height (it grows with large text), so the docked strip sits exactly on top of it.
const totalBar = document.getElementById('total-bar');
if (totalBar && pill) new ResizeObserver(() => document.documentElement.style.setProperty('--total-bar-h', `${totalBar.offsetHeight}px`)).observe(totalBar);

function hideWhenIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!log.hidden || pill.contains(document.activeElement)) return hideWhenIdle(); // never vanish while in use
    pill.hidden = true;
    steps.replaceChildren();
  }, IDLE_MS);
}

// Plain phrase for one tool call. texts = brand.texts.agentPill, plans = { wild: 'Wild', … }.
export function stepText(texts, plans, tool, input, result) {
  if (!result?.ok) return texts.failed;
  if (tool === 'select_plan') return texts.steps.select_plan.replace('{plan}', plans[input?.plan] ?? '');
  return texts.steps[tool] ?? null;
}

function add(text) {
  const now = new Date();
  const li = document.createElement('li');
  const time = document.createElement('time');
  time.dateTime = now.toISOString();
  time.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  li.append(time, ` ${text}`);
  steps.append(li);
  li.scrollIntoView?.({ block: 'nearest' });
  status.textContent = text;
}

// Called by webmcp.js after every tool call.
export function showAgentStep(texts, plans, tool, input, result) {
  if (!pill || !texts) return;
  const text = stepText(texts, plans, tool, input, result);
  if (!text) return;
  add(text);
  if (tool === 'confirm_payment' && result.ok && ['sent', 'pending'].includes(result.email_status)) add(texts.sent);
  count.textContent = steps.children.length;
  pill.hidden = false;
  pill.classList.add('is-active');
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => pill.classList.remove('is-active'), 6000);
  hideWhenIdle();
}
