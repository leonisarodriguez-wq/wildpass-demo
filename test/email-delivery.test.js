// Email delivery status, tested against a FAKE Brevo (no real emails are sent).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { deliveryStatusFromEvents } from '../src/email.js';
import brand from '../config/brand.config.js';

const FAKE_KEY = 'xkeysib-TEST-SECRET-must-never-leak';
const MESSAGE_ID = '<202610281200.123456@smtp-relay.mailin.fr>';

// ---------- the pure status logic ----------
test('Brevo events are summarised into one clear status', () => {
  const ev = (event, date, reason) => ({ event, date, messageId: MESSAGE_ID, email: 'a@example.com', ...(reason && { reason }) });
  assert.equal(deliveryStatusFromEvents([]), null);
  assert.equal(deliveryStatusFromEvents([ev('requests', '2026-10-28T12:00:00+01:00')]).status, 'accepted');
  assert.equal(deliveryStatusFromEvents([ev('requests', '2026-10-28T12:00:00+01:00'), ev('deferred', '2026-10-28T12:01:00+01:00')]).status, 'deferred');
  const delivered = deliveryStatusFromEvents([ev('requests', '2026-10-28T12:00:00+01:00'), ev('delivered', '2026-10-28T12:00:05+01:00')]);
  assert.deepEqual(delivered, { status: 'delivered', event: 'delivered', at: '2026-10-28T11:00:05.000Z', reason: null });
  assert.equal(deliveryStatusFromEvents([ev('delivered', '2026-10-28T12:00:05Z'), ev('opened', '2026-10-28T12:03:00Z')]).status, 'opened');
  // A soft bounce followed by a successful delivery counts as delivered.
  assert.equal(deliveryStatusFromEvents([ev('softBounces', '2026-10-28T12:00:05Z'), ev('delivered', '2026-10-28T12:10:00Z')]).status, 'delivered');
  const hard = deliveryStatusFromEvents([ev('requests', '2026-10-28T12:00:00Z'), ev('hardBounces', '2026-10-28T12:00:04Z', 'Unknown user')]);
  assert.deepEqual([hard.status, hard.reason], ['bounced', 'Unknown user']);
  assert.equal(deliveryStatusFromEvents([ev('requests', '2026-10-28T12:00:00Z'), ev('blocked', '2026-10-28T12:00:01Z')]).status, 'blocked');
  assert.equal(deliveryStatusFromEvents([ev('delivered', '2026-10-28T12:00:05Z'), ev('spam', '2026-10-28T13:00:00Z')]).status, 'marked_as_spam');
});

// ---------- end to end with a fake Brevo ----------
let server, base, dataDir;
let clockOffsetMs = 0;
const brevo = { events: [], eventsUp: true, sendOk: true, calls: [] };

function fakeFetch(url, options = {}) {
  brevo.calls.push({ url: String(url), headers: options.headers, body: options.body });
  const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  if (String(url).endsWith('/v3/smtp/email')) {
    return brevo.sendOk ? json(201, { messageId: MESSAGE_ID }) : json(401, { code: 'unauthorized', message: 'Key not found' });
  }
  if (String(url).includes('/v3/smtp/statistics/events')) {
    if (!brevo.eventsUp) return Promise.reject(new TypeError('fetch failed'));
    return json(200, { events: brevo.events });
  }
  return json(404, {});
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-email-'));
  const { app } = createApp({
    dataDir,
    env: { BREVO_API_KEY: FAKE_KEY, SENDER_EMAIL: 'polizas@example.com' },
    fetchImpl: fakeFetch,
    now: () => new Date(Date.now() + clockOffsetMs),
  });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const responses = [];
async function call(action, body) {
  const res = await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  responses.push(text);
  return JSON.parse(text);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function buyPolicy() {
  const dep = addDays(today, 30);
  const q = await call('get_quote', { origin_country: 'ES', destination_country: 'FR', departure_date: dep, return_date: addDays(dep, 6), traveler_ages: [40] });
  const o = await call('select_plan', { quote_id: q.quote_id, plan: 'wild' });
  const birth = addDays(`${Number(dep.slice(0, 4)) - 40}${dep.slice(4)}`, -1);
  await call('set_traveler_details', { order_id: o.order_id, policyholder: { full_name: 'Eva Prueba', email: 'eva@example.com' }, travelers: [{ full_name: 'Eva Prueba', birth_date: birth }] });
  const r = await call('review_order', { order_id: o.order_id });
  const paid = await call('confirm_payment', { order_id: o.order_id, review_token: r.review_token, accept_terms: true, confirmed_total_eur: r.total_eur, user_confirmed: true });
  assert.equal(paid.ok, true, paid.message);
  assert.equal(paid.email_status, 'pending');
  await new Promise(resolve => setTimeout(resolve, 50)); // let the background send finish
  return paid.policy_number;
}

const policyStatus = async number => (await call('get_policy', { policy_number: number, email: 'eva@example.com' })).email_delivery;

test('get_policy follows the real delivery events from Brevo', async () => {
  const number = await buyPolicy();

  // 1. Brevo accepted the email but has no events yet → fallback "sent".
  brevo.events = [];
  let d = await policyStatus(number);
  assert.equal(d.status, 'sent');
  assert.equal(d.source, 'local');
  const eventsCall = brevo.calls.find(c => c.url.includes('/statistics/events'));
  assert.ok(eventsCall.url.includes(`messageId=${encodeURIComponent(MESSAGE_ID)}`), 'asks Brevo about this exact message');
  assert.equal(eventsCall.headers['api-key'], FAKE_KEY, 'key is sent to Brevo in the header');

  // 2. Within 60 seconds we reuse the last answer instead of asking Brevo again.
  brevo.events = [{ event: 'requests', date: '2026-10-28T12:00:00+01:00', messageId: MESSAGE_ID }];
  const before = brevo.calls.length;
  d = await policyStatus(number);
  assert.equal(brevo.calls.length, before);
  assert.equal(d.status, 'sent');

  // 3. A minute later: accepted, then delivered with its timestamp.
  clockOffsetMs += 61_000;
  d = await policyStatus(number);
  assert.deepEqual([d.status, d.source], ['accepted', 'brevo_events']);
  brevo.events.push({ event: 'delivered', date: '2026-10-28T12:00:06+01:00', messageId: MESSAGE_ID });
  clockOffsetMs += 61_000;
  d = await policyStatus(number);
  assert.deepEqual([d.status, d.status_at, d.brevo_event], ['delivered', '2026-10-28T11:00:06.000Z', 'delivered']);

  // 4. If Brevo can't be reached, keep the last known status and say so.
  brevo.eventsUp = false;
  clockOffsetMs += 61_000;
  d = await policyStatus(number);
  assert.equal(d.status, 'delivered');
  assert.ok(d.check_error);
  brevo.eventsUp = true;

  // 5. Opened.
  brevo.events.push({ event: 'opened', date: '2026-10-28T12:05:00+01:00', messageId: MESSAGE_ID });
  clockOffsetMs += 61_000;
  assert.equal((await policyStatus(number)).status, 'opened');
});

test('the policy email: subject, both versions, Spanish dates, hosted logo, PDF attached', async () => {
  const before = brevo.calls.length;
  await buyPolicy();
  const sent = JSON.parse(brevo.calls.slice(before).find(c => c.url.endsWith('/v3/smtp/email')).body);
  const policyNumber = sent.attachment[0].name.replace('.pdf', '');
  assert.match(policyNumber, /^WILD-\d{4}-[A-Z2-9]{6}$/);
  assert.equal(sent.subject, `Tu póliza Wildpass ${policyNumber} · Francia (demo)`);
  assert.equal(sent.sender.name, 'Seguros Wildpass (demo)');

  for (const body of [sent.htmlContent, sent.textContent]) {
    assert.ok(body.includes('¡Listo, Eva! Tu viaje a Francia está cubierto'), 'headline');
    assert.ok(body.includes('Demo — no es un seguro real'), 'demo line');
    assert.ok(body.includes('Descargar mi póliza'), 'button text');
    assert.ok(body.includes(policyNumber) && body.includes('Wild') && body.includes('Eva Prueba'), 'key data');
    assert.ok(body.includes('(7 días)') && /\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}/.test(body), 'Spanish dates');
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(body), 'no YYYY-MM-DD dates');
    assert.ok(body.includes('¿Una emergencia?') && body.includes('producto ficticio'), 'emergency line and disclaimer');
    assert.ok(body.includes('/poliza/'), 'PDF link');
  }
  // Logo from the Brevo image gallery, never from our own (changing) website address.
  assert.ok(sent.htmlContent.includes(`<img src="${brand.emailLogoUrl}"`));
  assert.ok(brand.emailLogoUrl.startsWith('https://img.mailinblue.com/'));
  assert.ok(!sent.htmlContent.includes('/brand/logo-symbol-email.png'));
  // Yellow button with night text and no border.
  assert.match(sent.htmlContent, /background:#FFC21A;color:#0B1F3A;[^"]*border:0/);
  // The PDF is attached.
  assert.equal(Buffer.from(sent.attachment[0].content, 'base64').subarray(0, 5).toString(), '%PDF-');
});

test('a bounced email is reported with its reason', async () => {
  brevo.events = [];
  const number = await buyPolicy();
  brevo.events = [
    { event: 'requests', date: '2026-10-28T12:00:00Z', messageId: MESSAGE_ID },
    { event: 'hardBounces', date: '2026-10-28T12:00:03Z', messageId: MESSAGE_ID, reason: 'Recipient address rejected' },
  ];
  clockOffsetMs += 61_000;
  const d = await policyStatus(number);
  assert.deepEqual([d.status, d.reason], ['bounced', 'Recipient address rejected']);
});

test('if Brevo refuses the send, the policy is still issued and the email shows "failed"', async () => {
  brevo.sendOk = false;
  const number = await buyPolicy();
  const d = await policyStatus(number);
  assert.equal(d.status, 'failed');
  assert.match(d.error, /Brevo HTTP 401/);
  brevo.sendOk = true;
});

test('the API key never appears in any answer', () => {
  assert.ok(responses.length > 10);
  for (const text of responses) assert.ok(!text.includes(FAKE_KEY), 'API key leaked in a response');
});
