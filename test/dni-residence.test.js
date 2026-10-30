// Policyholder DNI/NIE (required on the website, optional for agents → «DNI pendiente» + one-time link) and
// residence in Spain (get_quote's optional residence_country). Brevo is faked: no real emails.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { checkIdNumber, maskIdNumber } from '../src/business.js';

const sent = [];
let server, base, dataDir;

async function fakeFetch(url, init = {}) {
  if (String(url).endsWith('/smtp/email')) {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ messageId: `<m${sent.length}@example.com>` }), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-dni-'));
  const { app } = createApp({ dataDir, env: { BREVO_API_KEY: 'xkeysib-test', SENDER_EMAIL: 'polizas@example.com' }, fetchImpl: fakeFetch });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function call(action, body) {
  const res = await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DEP = addDays(today, 30);
const quoteInput = extra => ({ origin_country: 'ES', destination_country: 'FR', departure_date: DEP, return_date: addDays(DEP, 6), traveler_ages: [40], ...extra });
const birth40 = addDays(`${Number(DEP.slice(0, 4)) - 40}${DEP.slice(4)}`, -1);
const HOLDER = 'dni.prueba@example.com';

// Quote → plan → details (with or without DNI) → review → pay, like an agent with tools only.
async function buy(details = {}) {
  const q = await call('get_quote', quoteInput());
  const o = await call('select_plan', { quote_id: q.quote_id, plan: 'wild' });
  const d = await call('set_traveler_details', { order_id: o.order_id, policyholder: { full_name: 'Dani Prueba', email: HOLDER }, travelers: [{ full_name: 'Dani Prueba', birth_date: birth40 }], ...details });
  assert.equal(d.ok, true, d.message);
  const review = await call('review_order', { order_id: o.order_id });
  const paid = await call('confirm_payment', { order_id: o.order_id, review_token: review.review_token, accept_terms: true, confirmed_total_eur: review.total_eur, user_confirmed: true });
  assert.equal(paid.ok, true, paid.message);
  return { review, paid };
}

test('DNI and NIE: format and mod-23 control letter', () => {
  assert.deepEqual(checkIdNumber('12345678Z'), { value: '12345678Z' });
  assert.deepEqual(checkIdNumber(' 12.345.678-z '), { value: '12345678Z' });
  assert.deepEqual(checkIdNumber('X1234567L'), { value: 'X1234567L' }); // NIE: X → 0
  assert.deepEqual(checkIdNumber('Y1234567X'), { value: 'Y1234567X' }); // NIE: Y → 1
  assert.deepEqual(checkIdNumber('12345678A'), { error: 'letter' });
  for (const bad of ['1234567Z', '123456789', 'A1234567L', '', null]) assert.deepEqual(checkIdNumber(bad), { error: 'format' }, String(bad));
  assert.equal(maskIdNumber('12345678Z'), '*****678Z');
});

test('residence_country: optional, "ES" works, any other country is refused clearly', async () => {
  assert.equal((await call('get_quote', quoteInput())).ok, true);
  assert.equal((await call('get_quote', quoteInput({ residence_country: 'ES' }))).ok, true);
  const fr = await call('get_quote', quoteInput({ residence_country: 'FR' }));
  assert.equal(fr.ok, false);
  assert.equal(fr.error_code, 'RESIDENCE_NOT_COVERED');
  assert.equal(fr.how_to_fix, 'Wildpass solo asegura a residentes en España. Pregunta al usuario su país de residencia.');
});

test('a wrong DNI letter is refused with a clear how_to_fix', async () => {
  const q = await call('get_quote', quoteInput());
  const o = await call('select_plan', { quote_id: q.quote_id, plan: 'wild' });
  const d = await call('set_traveler_details', { order_id: o.order_id, policyholder: { full_name: 'Dani Prueba', email: HOLDER }, travelers: [{ full_name: 'Dani Prueba', birth_date: birth40 }], holder_id_number: '12345678A' });
  assert.equal(d.error_code, 'INVALID_ID_NUMBER');
  assert.equal(d.reason, 'letter');
  assert.match(d.how_to_fix, /letra/);
});

test('agent purchase WITH a DNI: «Activa», always masked, never the whole number', async () => {
  const { review, paid } = await buy({ holder_id_number: '12345678Z' });
  assert.equal(review.summary.policyholder.id_number_masked, '*****678Z');
  assert.equal(review.summary.policy_status_after_payment, 'Activa');
  assert.equal(paid.status, 'active');
  assert.equal(paid.holder_id_number_masked, '*****678Z');
  assert.equal(paid.complete_id_url, undefined);
  const policy = await call('get_policy', { policy_number: paid.policy_number, email: HOLDER });
  assert.equal(policy.status_text, 'Activa');
  assert.equal(policy.holder_id_number_masked, '*****678Z');
  for (const answer of [review, paid, policy]) assert.ok(!JSON.stringify(answer).includes('12345678Z'), 'full DNI never in an answer');
});

test('agent purchase WITHOUT a DNI works as before, then the person completes it with the one-time link', async () => {
  const before = sent.length;
  const { paid } = await buy();
  assert.equal(paid.status, 'pending_id');
  assert.equal(paid.status_text, 'DNI pendiente');
  assert.match(paid.complete_id_url, /\/poliza\/completar\/[A-Za-z0-9_-]{20,}$/);
  const token = paid.complete_id_url.split('/').pop();

  // The policy email carries the link.
  await new Promise(r => setTimeout(r, 50));
  const mail = sent.slice(before).find(m => m.to[0].email === HOLDER);
  assert.ok(mail.htmlContent.includes(paid.complete_id_url) && mail.textContent.includes('Completa tu DNI para activar tu póliza'));
  const pendingPolicy = await call('get_policy', { policy_number: paid.policy_number, email: HOLDER });
  assert.equal(pendingPolicy.status_text, 'DNI pendiente');
  assert.equal(pendingPolicy.id_status, 'pending');
  // The frozen review fields are not part of get_policy's details (one clear field at the top instead).
  assert.ok(!('policy_status_after_payment' in pendingPolicy.details) && !('id_status' in pendingPolicy.details.policyholder));

  // The page opens; a wrong letter is refused; the right one activates the policy and resends the PDF.
  assert.equal((await fetch(`${base}/poliza/completar/${token}`)).status, 200);
  assert.equal((await call('complete_holder_id', { token, id_number: '12345678A' })).error_code, 'INVALID_ID_NUMBER');
  const sentBefore = sent.length;
  const done = await call('complete_holder_id', { token, id_number: '12345678Z' });
  assert.equal(done.ok, true, done.message);
  assert.equal(done.status_text, 'Activa');
  assert.equal(done.holder_id_number_masked, '*****678Z');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(sent.length, sentBefore + 1, 'updated PDF emailed again');
  assert.ok(sent.at(-1).attachment?.length, 'with the PDF attached');

  const policy = await call('get_policy', { policy_number: paid.policy_number, email: HOLDER });
  assert.equal(policy.status, 'active');
  assert.equal(policy.holder_id_number_masked, '*****678Z');
  // Once the DNI is completed nothing in get_policy says pending, in any field (an agent must not misread it).
  assert.equal(policy.id_status, 'completed');
  assert.ok(!/pendiente|pending/i.test(JSON.stringify(policy)), 'no "pendiente"/"pending" anywhere in the answer');

  // One-time link: used once, then refused.
  assert.equal((await call('complete_holder_id', { token, id_number: '12345678Z' })).error_code, 'ID_LINK_INVALID');
  assert.equal((await fetch(`${base}/poliza/completar/${token}`)).status, 404);
});

test('forwarding the policy to the policyholder\'s own email is refused (use "resend")', async () => {
  const { paid } = await buy({ holder_id_number: '12345678Z' });
  const r = await call('send_policy_copy', { policy_number: paid.policy_number, manage_token: paid.manage_token, kind: 'forward', to_email: HOLDER.toUpperCase() });
  assert.equal(r.error_code, 'FORWARD_TO_SELF');
});
