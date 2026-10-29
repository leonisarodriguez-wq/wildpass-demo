// Our own funnel measurement: no cookies, no third-party tools. The browser (website and WebMCP tools) sends small
// events to POST /api/events; they are validated, rate-limited and stored in SQLite (table `events`).
// Never personal data: only the event name, an anonymous random session id, channel, page, device, plan and variants.
import { fail } from './business.js';

export const EVENT_NAMES = [
  'page_view', 'destination_selected', 'quote_viewed', 'plan_selected', 'details_completed', 'review_viewed',
  'payment_started', 'policy_issued', 'policy_resent', 'policy_forwarded',
];
// Pages that send page_view (/metricas never does).
export const TRACKED_PAGES = ['/', '/agentes', '/condiciones', '/caso'];
const PLAN_IDS = ['wild', 'wild_plus', 'wild_max'];
const FIELDS = ['event', 'session_id', 'channel', 'device', 'page', 'plan', 'exp_hero', 'exp_upsell'];
const SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;

const LIMITS = {
  perSessionPerMinute: 40,
  perSessionTotal: 300,        // a real visit sends a few dozen at most
  perIpPerHour: 1500,
  maxRows: 200_000,            // the table never grows past this
};

export function createEvents({ db, now = () => new Date() }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,              -- set by the server
      event TEXT NOT NULL,
      session_id TEXT NOT NULL,      -- random, from the browser's sessionStorage (no cookie, no user id)
      channel TEXT NOT NULL,         -- web | agent
      device TEXT,                   -- mobile | desktop (by screen width)
      page TEXT,
      plan TEXT,                     -- wild | wild_plus | wild_max
      exp_hero TEXT,                 -- a | b
      exp_upsell TEXT                -- a | b
    );
    CREATE INDEX IF NOT EXISTS events_event ON events(event, session_id);
  `);

  // In-memory counters (reset on restart; enough to stop anyone filling the database).
  const counters = new Map();
  function allow(key, max, windowMs) {
    const t = now().getTime();
    const c = counters.get(key);
    if (!c || t - c.start >= windowMs) { counters.set(key, { start: t, n: 1 }); return true; }
    c.n += 1;
    return c.n <= max;
  }
  setInterval(() => { // forget old windows
    const t = now().getTime();
    for (const [k, c] of counters) if (t - c.start > 86_400_000) counters.delete(k);
  }, 3_600_000).unref();

  const oneOf = (value, list) => value === undefined || value === null || list.includes(value);

  function record(input, { ip = '' } = {}) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_EVENT', 'El evento debe ser un objeto JSON.', `Envía un objeto con: ${FIELDS.join(', ')}.`);
    const unknown = Object.keys(input).filter(k => !FIELDS.includes(k));
    if (unknown.length) return fail('INVALID_EVENT', `Campo(s) no permitido(s): ${unknown.join(', ')}.`, `Usa solo: ${FIELDS.join(', ')}. Nunca datos personales.`);
    const e = input;
    if (!EVENT_NAMES.includes(e.event)) return fail('INVALID_EVENT', 'Nombre de evento desconocido.', `Usa uno de: ${EVENT_NAMES.join(', ')}.`);
    if (typeof e.session_id !== 'string' || !SESSION_RE.test(e.session_id)) return fail('INVALID_EVENT', 'session_id no es válido.', 'Usa un identificador aleatorio de 16 a 64 caracteres (letras, números, - o _).');
    if (!['web', 'agent'].includes(e.channel)) return fail('INVALID_EVENT', 'channel debe ser "web" o "agent".', 'Indica el canal.');
    if (!oneOf(e.device, ['mobile', 'desktop']) || !oneOf(e.page, TRACKED_PAGES) || !oneOf(e.plan, PLAN_IDS)
        || !oneOf(e.exp_hero, ['a', 'b']) || !oneOf(e.exp_upsell, ['a', 'b'])) {
      return fail('INVALID_EVENT', 'Algún valor no está permitido.', 'device: mobile|desktop; page: una página pública; plan: wild|wild_plus|wild_max; variantes: a|b.');
    }
    if (!allow(`s:${e.session_id}`, LIMITS.perSessionPerMinute, 60_000) || !allow(`st:${e.session_id}`, LIMITS.perSessionTotal, 86_400_000)
        || !allow(`ip:${ip}`, LIMITS.perIpPerHour, 3_600_000)) {
      return fail('TOO_MANY_EVENTS', 'Demasiados eventos en poco tiempo.', 'Espera un poco antes de enviar más.');
    }
    if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n >= LIMITS.maxRows) {
      return fail('EVENTS_FULL', 'La tabla de eventos está llena.', 'Borra los datos de prueba desde /metricas con la clave de administración.');
    }
    db.prepare('INSERT INTO events (ts, event, session_id, channel, device, page, plan, exp_hero, exp_upsell) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now().toISOString(), e.event, e.session_id, e.channel, e.device ?? null, e.page ?? null, e.plan ?? null, e.exp_hero ?? null, e.exp_upsell ?? null);
    return { ok: true };
  }

  const count = (sql, ...args) => db.prepare(sql).get(...args).n;

  // Everything /metricas shows, straight from the table.
  function summary() {
    const first = db.prepare('SELECT MIN(ts) AS t FROM events').get().t;
    const total = count('SELECT COUNT(*) AS n FROM events');
    // A session counts as "web" once it viewed the landing, as "agent" once a WebMCP tool was used in it.
    const sessionsFor = channel => (channel === 'agent'
      ? count("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE channel = 'agent'")
      : channel === 'web'
        ? count("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE channel = 'web' AND event = 'page_view' AND page = '/'")
        : count("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE (channel = 'web' AND event = 'page_view' AND page = '/') OR channel = 'agent'"));
    const stepFor = (event, channel) => (channel
      ? count('SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE event = ? AND channel = ?', event, channel)
      : count('SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE event = ?', event));
    const STEPS = ['quote_viewed', 'plan_selected', 'details_completed', 'review_viewed', 'payment_started', 'policy_issued'];
    const funnel = channel => [{ step: 'sessions', n: sessionsFor(channel) }, ...STEPS.map(step => ({ step, n: stepFor(step, channel) }))];

    const plans = event => Object.fromEntries(PLAN_IDS.map(p => [p, count('SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE event = ? AND plan = ?', event, p)]));
    const otherEvents = Object.fromEntries(EVENT_NAMES.map(name => [name, count('SELECT COUNT(*) AS n FROM events WHERE event = ?', name)]));

    // Experiments (website only). Hero: sessions that viewed the landing, by variant → % that chose a destination.
    // Upsell: sessions that chose a plan, by variant → % whose choice included Wild+.
    const hero = ['a', 'b'].map(v => ({
      variant: v,
      sessions: count("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE channel = 'web' AND event = 'page_view' AND page = '/' AND exp_hero = ?", v),
      conversions: count(`SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE channel = 'web' AND event = 'destination_selected' AND session_id IN
        (SELECT session_id FROM events WHERE channel = 'web' AND event = 'page_view' AND page = '/' AND exp_hero = ?)`, v),
    }));
    const upsell = ['a', 'b'].map(v => ({
      variant: v,
      sessions: count("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE channel = 'web' AND event = 'plan_selected' AND exp_upsell = ?", v),
      conversions: count("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE channel = 'web' AND event = 'plan_selected' AND exp_upsell = ? AND plan = 'wild_plus'", v),
    }));

    return {
      first_event_at: first, total_events: total,
      funnel: { all: funnel(null), web: funnel('web'), agent: funnel('agent') },
      plans: { selected: plans('plan_selected'), issued: plans('policy_issued') },
      events: otherEvents,
      experiments: { hero, upsell },
    };
  }

  function reset() {
    db.exec('DELETE FROM events');
    counters.clear();
  }

  return { record, summary, reset };
}

// ---------- statistics for the experiments ----------
// Standard normal quantile/CDF helpers (Abramowitz–Stegun 26.2.17 for the CDF).
export const Z_95 = 1.959964; // two-sided 95 % confidence
export const Z_80 = 0.841621; // 80 % power
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Sessions needed PER VARIANT to detect p1 → p2 (two proportions, 95 % confidence two-sided, 80 % power):
// n = (z₁₋α/₂·√(2·p̄·(1−p̄)) + z₁₋β·√(p₁(1−p₁) + p₂(1−p₂)))² / (p₂ − p₁)², p̄ = (p₁ + p₂) / 2.
export function sampleSizePerVariant(p1, p2) {
  const pBar = (p1 + p2) / 2;
  const n = (Z_95 * Math.sqrt(2 * pBar * (1 - pBar)) + Z_80 * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2;
  return Math.ceil(n);
}

// Two-proportion z-test (pooled), two-sided p-value.
export function twoProportionTest(x1, n1, x2, n2) {
  if (!n1 || !n2) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p_value: 1 };
  const z = (x2 / n2 - x1 / n1) / se;
  return { z, p_value: 2 * (1 - normCdf(Math.abs(z))) };
}
