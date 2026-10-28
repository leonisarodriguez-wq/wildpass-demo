// Stripe (test mode) with Stripe MOCKED: no real Stripe calls. Covers the key safety check,
// the AI-agent payment (pm_card_visa), the website card payment, declines, Stripe being down
// and attempts to pay the same order twice.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createStripe } from '../src/stripe.js';

const PK = 'pk_test_FAKEpublishable';
const SK = 'sk_test_FAKEsecretNEVERshown';

// ---------- a tiny fake Stripe API ----------
function fakeStripe() {
  const m = { mode: 'ok', calls: [], intents: new Map(), byKey: new Map(), charges: 0, n: 0, tamper: false };
  m.fetch = async (url, { method, headers, body }) => {
    const path = new URL(url).pathname;
    const params = Object.fromEntries(new URLSearchParams(body ?? ''));
    m.calls.push({ method, path, params, headers });
    if (m.mode === 'down') throw new TypeError('fetch failed');
    assert.equal(headers.Authorization, `Bearer ${SK}`);
    const json = (status, data) => ({ ok: status < 400, status, json: async () => structuredClone(data) });
    const key = headers['Idempotency-Key'];
    if (key && m.byKey.has(key)) return m.byKey.get(key)(); // same key → same answer, like Stripe
    const remember = res => { if (key) m.byKey.set(key, () => res); return res; };

    if (method === 'POST' && path === '/v1/payment_intents') {
      const id = `pi_test_${++m.n}`;
      const pi = { id, object: 'payment_intent', amount: Number(params.amount) + (m.tamper ? 1 : 0), currency: params.currency, status: 'requires_payment_method', client_secret: `${id}_secret_x`, metadata: { order_id: params['metadata[order_id]'], plan: params['metadata[plan]'] } };
      m.intents.set(id, pi);
      return remember(json(200, pi));
    }
    const pi = m.intents.get(path.split('/')[3]);
    if (!pi) return json(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such payment_intent' } });
    if (method === 'GET') return json(200, pi);
    if (path.endsWith('/confirm')) {
      if (m.mode === 'decline') return remember(json(402, { error: { type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' } }));
      if (pi.status === 'succeeded') return json(400, { error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state', message: 'already succeeded' } });
      pi.status = 'succeeded';
      m.charges += 1;
      return remember(json(200, pi));
    }
    return json(400, { error: { type: 'invalid_request_error', message: 'unexpected call' } });
  };
  // What Stripe.js does in the browser when the person pays with card 4242.
  m.payInBrowser = id => { m.intents.get(id).status = 'succeeded'; m.charges += 1; };
  return m;
}

let server, base, dataDir, stripe;
const logs = [];
const log = { warn: msg => logs.push(msg) };

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-stripe-'));
  stripe = fakeStripe();
  const { app } = createApp({ dataDir, env: { STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK }, stripeFetch: stripe.fetch, log });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});
beforeEach(() => { stripe.mode = 'ok'; stripe.tamper = false; });

// ---------- helpers ----------
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DEP = addDays(today, 30);
const birthFor = age => addDays(`${Number(DEP.slice(0, 4)) - age}${DEP.slice(4)}`, -1);

async function call(action, body, url = base) {
  const res = await fetch(`${url}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, ...(await res.json()) };
}

// A reviewed order (Wild+, 1 traveller) and the confirmation the person gives.
async function reviewedOrder(url = base) {
  const q = await call('get_quote', { origin_country: 'ES', destination_country: 'JP', departure_date: DEP, return_date: addDays(DEP, 10), traveler_ages: [35] }, url);
  const o = await call('select_plan', { quote_id: q.quote_id, plan: 'wild_plus' }, url);
  await call('set_traveler_details', { order_id: o.order_id, policyholder: { full_name: 'Ana Prueba', email: 'ana.prueba@example.com' }, travelers: [{ full_name: 'Ana Prueba', birth_date: birthFor(35) }] }, url);
  const r = await call('review_order', { order_id: o.order_id }, url);
  assert.equal(r.ok, true, r.message);
  return { orderId: o.order_id, review: r, pay: { order_id: o.order_id, review_token: r.review_token, accept_terms: true, confirmed_total_eur: r.total_eur, user_confirmed: true } };
}

// ---------- key safety ----------
test('only test keys turn Stripe on; live, missing or odd keys keep the simulated payment (key never logged)', () => {
  const cases = [
    [{ STRIPE_PUBLISHABLE_KEY: 'pk_live_REALKEY123', STRIPE_SECRET_KEY: 'sk_live_REALSECRET456' }, 'live_key'],
    [{ STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: 'sk_live_REALSECRET456' }, 'live_key'],
    [{ STRIPE_PUBLISHABLE_KEY: 'pk_live_REALKEY123', STRIPE_SECRET_KEY: SK }, 'live_key'],
    [{}, 'no_key'],
    [{ STRIPE_PUBLISHABLE_KEY: PK }, 'not_test_key'],
    [{ STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: 'rk_test_restricted' }, 'not_test_key'],
  ];
  for (const [env, reason] of cases) {
    const warnings = [];
    const s = createStripe({ env, fetchImpl: () => assert.fail('no Stripe call expected'), log: { warn: w => warnings.push(w) } });
    assert.equal(s.enabled, false);
    assert.equal(s.reason, reason);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Stripe OFF/);
    for (const k of Object.values(env)) assert.ok(!warnings[0].includes(k), 'a key was written to the log');
  }
  assert.equal(createStripe({ env: { STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK }, log }).enabled, true);
});

test('with a live key the site refuses Stripe: simulated payment, no Stripe in the page or the headers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'travel-demo-live-'));
  const warnings = [];
  const { app, stripe: status } = createApp({ dataDir: dir, env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_REALKEY123', STRIPE_SECRET_KEY: 'sk_live_REALSECRET456' }, stripeFetch: () => assert.fail('a live key must never reach Stripe'), log: { warn: w => warnings.push(w) } });
  const srv = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal(status.enabled, false);
    assert.match(warnings.join(), /LIVE key/);
    const config = await (await fetch(`${url}/api/config`)).json();
    assert.deepEqual(config.payments, { provider: 'simulated' });
    const page = await fetch(`${url}/`);
    assert.ok(!page.headers.get('content-security-policy').includes('stripe'));
    assert.ok(!(await page.text()).includes('live_'));
    const { pay } = await reviewedOrder(url);
    const paid = await call('confirm_payment', pay, url);
    assert.equal(paid.ok, true, paid.message);
    assert.equal(paid.payment, 'simulated — nothing was charged');
    assert.equal(paid.payment_ref, undefined);
  } finally {
    srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('site settings: publishable key only, never the secret; CSP allows Stripe and nothing more', async () => {
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.deepEqual(config.payments, { provider: 'stripe_test', publishable_key: PK });
  const page = await fetch(`${base}/`);
  const html = await page.text();
  assert.ok(!html.includes(SK) && !JSON.stringify(config).includes(SK));
  assert.ok(html.includes('Usa la tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier CVC. No se cobra nada.'));
  assert.equal(page.headers.get('content-security-policy'),
    "default-src 'self'; script-src 'self' https://js.stripe.com https://*.js.stripe.com; frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com; connect-src 'self' https://api.stripe.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
});

// ---------- AI agent: confirm_payment with pm_card_visa ----------
test('agent payment: all checks before Stripe, then one PaymentIntent for the exact total, paid with pm_card_visa', async () => {
  const { orderId, review, pay } = await reviewedOrder();
  const before = stripe.calls.length;
  for (const [bad, code] of [[{ review_token: 'wrong' }, 'INVALID_REVIEW_TOKEN'], [{ accept_terms: false }, 'TERMS_NOT_ACCEPTED'], [{ user_confirmed: false }, 'USER_CONFIRMATION_REQUIRED'], [{ confirmed_total_eur: review.total_eur - 1 }, 'TOTAL_MISMATCH']]) {
    assert.equal((await call('confirm_payment', { ...pay, ...bad })).error_code, code);
  }
  assert.equal(stripe.calls.length, before, 'Stripe was called before the checks passed');

  const paid = await call('confirm_payment', pay);
  assert.equal(paid.ok, true, paid.message);
  const [create, confirm] = stripe.calls.slice(before);
  assert.equal(create.path, '/v1/payment_intents');
  assert.equal(create.params.amount, String(Math.round(review.total_eur * 100)));
  assert.equal(create.params.currency, 'eur');
  assert.equal(create.params['allowed_payment_method_types[0]'], 'card');
  assert.equal(create.params['payment_method_types[0]'], undefined); // refused by current Stripe API versions
  assert.equal(create.params['metadata[order_id]'], orderId);
  assert.equal(create.params['metadata[plan]'], 'wild_plus');
  assert.equal(create.headers['Idempotency-Key'], `wildpass-order-${orderId}`);
  assert.equal(confirm.path, `/v1/payment_intents/${paid.payment_ref}/confirm`);
  assert.equal(confirm.params.payment_method, 'pm_card_visa');
  assert.ok(confirm.headers['Idempotency-Key']);
  assert.match(paid.payment_ref, /^pi_/);
  assert.equal(paid.payment_text, `Pago de prueba Stripe · ref. ${paid.payment_ref}`);

  const policy = await call('get_policy', { policy_number: paid.policy_number, email: 'ana.prueba@example.com' });
  assert.equal(policy.payment, `Pago de prueba Stripe · ref. ${paid.payment_ref}`);
  assert.equal(policy.payment_ref, paid.payment_ref);
  assert.equal(policy.details.payment.provider, 'stripe_test');
  assert.ok(existsSync(join(dataDir, 'policies', `${new URL(paid.pdf_url).pathname.split('/').pop()}`)));
});

test('declined card: clear error, no policy; a retry reuses the same PaymentIntent', async () => {
  const { orderId, pay } = await reviewedOrder();
  stripe.mode = 'decline';
  const declined = await call('confirm_payment', pay);
  assert.equal(declined.status, 402);
  assert.equal(declined.error_code, 'PAYMENT_DECLINED');
  assert.equal(declined.decline_code, 'insufficient_funds');
  assert.ok(declined.how_to_fix.includes('4242'));
  const review = await call('review_order', { order_id: orderId }); // still unpaid: can be reviewed again
  assert.equal(review.ok, true);

  stripe.mode = 'ok';
  stripe.byKey.clear(); // a real retry after a decline would come with a new card / new confirm
  const paid = await call('confirm_payment', { ...pay, review_token: review.review_token });
  assert.equal(paid.ok, true, paid.message);
  const created = stripe.calls.filter(c => c.path === '/v1/payment_intents' && c.params['metadata[order_id]'] === orderId);
  assert.equal(created.length, 1, 'a second PaymentIntent was created for the same order');
});

test('Stripe unreachable: clear error, no policy and no silent fallback to the simulated payment', async () => {
  const { orderId, pay } = await reviewedOrder();
  stripe.mode = 'down';
  const down = await call('confirm_payment', pay);
  assert.equal(down.status, 503);
  assert.equal(down.error_code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  const start = await call('start_card_payment', pay);
  assert.equal(start.error_code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  stripe.mode = 'ok';
  const review = await call('review_order', { order_id: orderId });
  assert.equal(review.ok, true, 'the order must still be unpaid (no policy issued)');
});

test('double-pay attempts: a paid order is never charged again, even with two calls at once', async () => {
  const first = await reviewedOrder();
  const paid = await call('confirm_payment', first.pay);
  assert.equal(paid.ok, true);
  const calls = stripe.calls.length;
  const again = await call('confirm_payment', first.pay);
  assert.equal(again.error_code, 'ALREADY_PAID');
  assert.equal(again.policy_number, paid.policy_number);
  assert.equal((await call('start_card_payment', first.pay)).error_code, 'ALREADY_PAID');
  assert.equal(stripe.calls.length, calls, 'Stripe was called for an already paid order');

  const second = await reviewedOrder();
  const chargesBefore = stripe.charges;
  const results = await Promise.all([call('confirm_payment', second.pay), call('confirm_payment', second.pay)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(stripe.charges - chargesBefore, 1, 'the order was charged twice');
});

test('a Stripe amount that does not match the order is refused', async () => {
  const { pay } = await reviewedOrder();
  stripe.tamper = true;
  assert.equal((await call('confirm_payment', pay)).error_code, 'PAYMENT_MISMATCH');
});

// ---------- website: Payment Element ----------
test('website card payment: checks first, then the policy only once Stripe says the payment succeeded', async () => {
  const { orderId, pay } = await reviewedOrder();
  const before = stripe.calls.length;
  assert.equal((await call('start_card_payment', { ...pay, accept_terms: false })).error_code, 'TERMS_NOT_ACCEPTED');
  assert.equal(stripe.calls.length, before);

  const start = await call('start_card_payment', pay);
  assert.equal(start.ok, true, start.message);
  assert.match(start.client_secret, /_secret_/);
  assert.equal((await call('start_card_payment', pay)).payment_intent_id, start.payment_intent_id, 'pressing Pagar again must reuse the PaymentIntent');

  // Not paid yet in the browser → no policy.
  assert.equal((await call('finish_card_payment', { ...pay, payment_intent_id: start.payment_intent_id })).error_code, 'PAYMENT_NOT_COMPLETED');
  assert.equal((await call('finish_card_payment', { ...pay, payment_intent_id: 'pi_someone_else' })).error_code, 'PAYMENT_MISMATCH');
  assert.equal((await call('finish_card_payment', { ...pay })).error_code, 'PAYMENT_MISMATCH');

  stripe.payInBrowser(start.payment_intent_id);
  const paid = await call('finish_card_payment', { ...pay, payment_intent_id: start.payment_intent_id });
  assert.equal(paid.ok, true, paid.message);
  assert.equal(paid.payment_ref, start.payment_intent_id);
  assert.equal((await call('finish_card_payment', { ...pay, payment_intent_id: start.payment_intent_id })).error_code, 'ALREADY_PAID');
  const created = stripe.calls.filter(c => c.path === '/v1/payment_intents' && c.params['metadata[order_id]'] === orderId);
  assert.equal(created.length, 1);
});

test('card data never goes to our server: no card fields accepted', async () => {
  const { pay } = await reviewedOrder();
  for (const action of ['confirm_payment', 'start_card_payment', 'finish_card_payment']) {
    assert.equal((await call(action, { ...pay, card_number: '4242424242424242' })).error_code, 'UNKNOWN_FIELD');
  }
});
