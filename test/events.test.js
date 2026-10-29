// Funnel events (POST /api/events) and the /metricas page, against a temporary database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { sampleSizePerVariant, twoProportionTest } from '../src/events.js';

const ADMIN = 'test-admin-key-0123456789abcdef';
let server, base, dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-events-'));
  const { app } = createApp({ dataDir, env: { METRICS_ADMIN_KEY: ADMIN } });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });

const sid = n => `session-${String(n).padStart(10, '0')}`;
async function send(body) {
  const res = await fetch(`${base}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, ...(await res.json()) };
}
const page = async (path = '/metricas') => {
  const res = await fetch(`${base}${path}`, { redirect: 'manual' });
  return { res, html: (await res.text()).replace(/ /g, ' ') };
};

test('events: only known names and fields, never personal data; size and rate limits', async () => {
  assert.equal((await send({ event: 'page_view', session_id: sid(1), channel: 'web', page: '/', device: 'mobile', exp_hero: 'b', exp_upsell: 'a' })).ok, true);
  for (const [body, why] of [
    [{ event: 'hacked', session_id: sid(1), channel: 'web' }, 'unknown event'],
    [{ event: 'page_view', session_id: sid(1), channel: 'web', email: 'ana@example.com' }, 'personal field'],
    [{ event: 'page_view', session_id: 'short', channel: 'web' }, 'bad session id'],
    [{ event: 'page_view', session_id: sid(1), channel: 'bot' }, 'bad channel'],
    [{ event: 'plan_selected', session_id: sid(1), channel: 'web', plan: 'gold' }, 'bad plan'],
    [{ event: 'page_view', session_id: sid(1), channel: 'web', page: '/metricas' }, 'untracked page'],
    [[], 'array'],
  ]) {
    const r = await send(body);
    assert.equal(r.status, 400, why);
    assert.equal(r.error_code, 'INVALID_EVENT', why);
    assert.ok(r.how_to_fix, why);
  }
  assert.equal((await send(`{"event":"page_view","x":"${'a'.repeat(3000)}"}`)).status, 413, 'body too large');
  // One session can't flood the table: 40 per minute.
  const statuses = [];
  for (let i = 0; i < 45; i++) statuses.push((await send({ event: 'destination_selected', session_id: sid(99), channel: 'web' })).status);
  assert.equal(statuses.filter(s => s === 200).length, 40);
  assert.equal(statuses.at(-1), 429);
});

test('/metricas: noindex, real funnel, web vs agent, Wild vs Wild+, experiments with an honest verdict', async () => {
  const ev = (n, event, extra = {}) => send({ event, session_id: sid(n), channel: 'web', ...extra });
  // Web session 2 buys Wild+ (variant B); session 3 only looks (A); session 4 is an agent buying Wild.
  for (const e of ['page_view', 'destination_selected', 'quote_viewed', 'details_completed', 'review_viewed', 'payment_started']) await ev(2, e, { page: e === 'page_view' ? '/' : undefined, exp_hero: 'b', exp_upsell: 'b' });
  await ev(2, 'plan_selected', { plan: 'wild_plus', exp_hero: 'b', exp_upsell: 'b' });
  await ev(2, 'policy_issued', { plan: 'wild_plus', exp_hero: 'b', exp_upsell: 'b' });
  await ev(3, 'page_view', { page: '/', exp_hero: 'a', exp_upsell: 'a' });
  for (const e of ['quote_viewed', 'plan_selected', 'details_completed', 'review_viewed', 'payment_started', 'policy_issued']) {
    await send({ event: e, session_id: sid(4), channel: 'agent', ...(['plan_selected', 'policy_issued'].includes(e) && { plan: 'wild' }) });
  }

  const { res, html } = await page();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(html.includes('Demo — no es un seguro real'));
  assert.match(html, /Datos reales de esta demo desde el \d+ de \w+ de 20\d\d/);
  for (const label of ['Sesiones', 'Precio visto', 'Plan elegido', 'Datos completados', 'Revisión', 'Pago iniciado', 'Póliza emitida', 'Web frente a agentes de IA', 'Wild frente a Wild+']) assert.ok(html.includes(label), label);
  // Sessions: 3 web landings (1, 2, 3) + 1 agent session.
  assert.match(html, /Sesiones<\/span><span class="bar-value">4</);
  assert.ok(html.includes('Todavía no hay datos suficientes para concluir (mínimo recomendado: 388 sesiones por variante).'));
  assert.ok(html.includes('Cómo calculamos el mínimo de sesiones'));
  assert.ok(!html.includes('Borrar los datos de prueba'), 'no delete button without the key');
  assert.ok(!html.includes('ana@example.com'));
});

test('/metricas admin: delete only with the key and an explicit confirmation', async () => {
  assert.ok(!(await page('/metricas?admin=wrong-key-0123456789')).html.includes('Borrar los datos de prueba'));
  const admin = await page(`/metricas?admin=${ADMIN}`);
  assert.ok(admin.html.includes('Borrar los datos de prueba') && admin.html.includes('required'));
  const post = body => fetch(`${base}/metricas/borrar`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  assert.equal((await post({ admin: 'wrong-key-0123456789', confirm: 'si' })).status, 403);
  const unconfirmed = await post({ admin: ADMIN });
  assert.equal(unconfirmed.status, 303);
  assert.ok(!(await page()).html.includes('Todavía no hay ningún evento'), 'nothing deleted without the box ticked');
  const done = await post({ admin: ADMIN, confirm: 'si' });
  assert.equal(done.status, 303);
  assert.ok((await page(done.headers.get('location'))).html.includes('Listo: se han borrado todos los eventos.'));
  assert.ok((await page()).html.includes('Todavía no hay ningún evento'));
});

test('sample size (two proportions, 95 % / 80 %) and the z-test', () => {
  assert.equal(sampleSizePerVariant(0.4, 0.5), 388);
  assert.equal(sampleSizePerVariant(0.35, 0.45), 376);
  assert.ok(twoProportionTest(40, 100, 60, 100).p_value < 0.01);
  assert.ok(twoProportionTest(40, 100, 42, 100).p_value > 0.5);
});

test('experiments: assigned before the first paint, both hero variants server-rendered, upsell line from the quote', async () => {
  const { html } = await page('/');
  assert.ok(html.indexOf('<script src="/exp.js"></script>') < html.indexOf('</head>'), 'classic script in <head>');
  assert.ok(html.includes('<span class="hero-b">El seguro de viaje que sí cubre tu aventura</span>'));
  const css = await (await fetch(`${base}/style.css`)).text();
  assert.ok(css.includes('html[data-exp-hero="b"] .hero-a, html[data-exp-hero="b"] .hero-tagline { display: none; }'));
  const exp = await (await fetch(`${base}/exp.js`)).text();
  assert.ok(exp.includes("params.get('exp_' + name)") && exp.includes('localStorage') && exp.includes('Math.random() < 0.5'));
  const app = await (await fetch(`${base}/app.js`)).text();
  assert.ok(app.includes("(window.__wildpassExp?.upsell ?? 'a') !== 'b'") && app.includes('/ q.trip.days'));
});
