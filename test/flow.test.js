// End-to-end tests of the JSON API (the same API the website and the WebMCP tools use).
// Runs against a temporary database; email is not configured on purpose.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

let server, base, dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-test-'));
  const { app } = createApp({ dataDir, env: {} });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// ---------- helpers ----------
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DEP = addDays(today, 30);

async function call(action, body) {
  const res = await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!json.ok) {
    // Every refusal must be structured and actionable.
    assert.equal(typeof json.error_code, 'string');
    assert.ok(json.message?.length > 0, `${json.error_code} has no message`);
    assert.ok(json.how_to_fix?.length > 0, `${json.error_code} has no how_to_fix`);
  }
  return { status: res.status, ...json };
}

async function expectError(action, body, code) {
  const r = await call(action, body);
  assert.equal(r.ok, false, `expected ${code} but call succeeded`);
  assert.equal(r.error_code, code, `expected ${code}, got ${r.error_code}: ${r.message}`);
  return r;
}

const quoteInput = (over = {}) => ({ origin_country: 'ES', destination_country: 'US', departure_date: DEP, return_date: addDays(DEP, 9), traveler_ages: [35, 38], ...over });

// Birth date that gives exactly `age` on the departure date (birthday was the day before).
const birthFor = (age, departure = DEP) => addDays(`${Number(departure.slice(0, 4)) - age}${departure.slice(4)}`, -1);

async function orderReadyToReview(plan = 'esencial') {
  const q = await call('get_quote', quoteInput());
  const o = await call('select_plan', { quote_id: q.quote_id, plan });
  const d = await call('set_traveler_details', {
    order_id: o.order_id,
    policyholder: { full_name: 'Ana Prueba', email: 'ana.prueba@example.com' },
    travelers: [{ full_name: 'Ana Prueba', birth_date: birthFor(35) }, { full_name: 'Luis Prueba', birth_date: birthFor(38) }],
  });
  assert.equal(d.ok, true, d.message);
  return o.order_id;
}

// ---------- pricing ----------
test('prices match the provisional targets', async () => {
  const price = async (dest, days, plan) => {
    const q = await call('get_quote', quoteInput({ destination_country: dest, return_date: addDays(DEP, days - 1), traveler_ages: [40] }));
    assert.equal(q.ok, true, q.message);
    return q.plans.find(p => p.plan === plan).total_price_eur;
  };
  assert.equal(await price('FR', 7, 'esencial'), 18);
  assert.equal(await price('FR', 7, 'premium'), 35);
  assert.equal(await price('TH', 7, 'esencial'), 32);
  assert.equal(await price('TH', 7, 'premium'), 58);
  assert.equal(await price('US', 10, 'esencial'), 45);
  assert.equal(await price('US', 10, 'premium'), 100);
});

test('age factors and per-day decrease', async () => {
  const q = await call('get_quote', quoteInput({ traveler_ages: [10, 40, 70, 80] }));
  const per = q.plans[0].price_per_traveler.map(t => t.price_eur);
  assert.deepEqual(per, [31.5, 45, 72.01, 99.01]); // age factor applied before rounding to cents
  const short = await call('get_quote', quoteInput({ destination_country: 'FR', return_date: addDays(DEP, 6), traveler_ages: [40] }));
  const long = await call('get_quote', quoteInput({ destination_country: 'FR', return_date: addDays(DEP, 59), traveler_ages: [40] }));
  assert.ok(long.plans[0].total_price_eur / 60 < short.plans[0].total_price_eur / 7);
});

test('quote contains coverage, excess and exclusions for both plans', async () => {
  const q = await call('get_quote', quoteInput());
  assert.equal(q.ok, true);
  assert.equal(q.plans.length, 2);
  const [esencial, premium] = q.plans;
  assert.equal(esencial.medical_limit_for_this_trip_eur, 1_000_000); // USA counts as rest of world
  assert.equal(premium.medical_limit_for_this_trip_eur, 5_000_000);
  assert.equal(esencial.excess_per_medical_claim_eur, 75);
  assert.equal(premium.excess_per_medical_claim_eur, 0);
  assert.equal(esencial.cancellation_included, false);
  assert.equal(premium.cancellation_included, true);
  assert.ok(q.exclusions.length >= 5);
  assert.equal(esencial.total_price_eur, 90);
});

// ---------- full flow ----------
test('full purchase flow issues a policy with a downloadable PDF', async () => {
  const orderId = await orderReadyToReview('premium');
  const review = await call('review_order', { order_id: orderId });
  assert.equal(review.ok, true);
  assert.equal(review.total_eur, 200);
  assert.ok(review.review_token.length >= 30);
  assert.match(review.terms_url, /\/condiciones$/);

  const paid = await call('confirm_payment', { order_id: orderId, review_token: review.review_token, accept_terms: true, confirmed_total_eur: 200, user_confirmed: true });
  assert.equal(paid.ok, true, paid.message);
  assert.match(paid.policy_number, /^BRAND-\d{4}-[A-Z2-9]{6}$/);
  assert.equal(paid.email_status, 'not_configured');
  assert.match(paid.pdf_url, /\/poliza\/[A-Za-z0-9_-]{43}\.pdf$/);

  const pdf = await fetch(paid.pdf_url);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 2000);

  const policy = await call('get_policy', { policy_number: paid.policy_number.toLowerCase(), email: 'ANA.PRUEBA@example.com' });
  assert.equal(policy.ok, true);
  assert.equal(policy.status, 'active');
  assert.equal(policy.coverage_period, 'not_started');
  assert.equal(policy.email_delivery.status, 'not_configured');
  assert.equal(policy.details.travelers.length, 2);

  await expectError('get_policy', { policy_number: paid.policy_number, email: 'someone@else.com' }, 'POLICY_NOT_FOUND');
  await expectError('get_policy', { policy_number: 'BRAND-2026-ZZZZZZ', email: 'ana.prueba@example.com' }, 'POLICY_NOT_FOUND');
  const again = await expectError('confirm_payment', { order_id: orderId, review_token: review.review_token, accept_terms: true, confirmed_total_eur: 200, user_confirmed: true }, 'ALREADY_PAID');
  assert.equal(again.policy_number, paid.policy_number);
});

test('a wrong PDF link returns 404', async () => {
  assert.equal((await fetch(`${base}/poliza/${'A'.repeat(43)}.pdf`)).status, 404);
  assert.equal((await fetch(`${base}/poliza/../../package.json`)).status, 404);
});

// ---------- quote refusals ----------
test('quote refusals: origin, countries, dates, length, travellers, ages', async () => {
  await expectError('get_quote', quoteInput({ origin_country: 'FR' }), 'ORIGIN_NOT_SUPPORTED');
  await expectError('get_quote', quoteInput({ destination_country: 'ES' }), 'SAME_COUNTRY');
  await expectError('get_quote', quoteInput({ destination_country: 'XX' }), 'INVALID_COUNTRY');
  await expectError('get_quote', quoteInput({ departure_date: today, return_date: addDays(today, 5) }), 'DEPARTURE_NOT_IN_FUTURE');
  await expectError('get_quote', quoteInput({ departure_date: addDays(today, -3), return_date: addDays(today, 5) }), 'DEPARTURE_NOT_IN_FUTURE');
  await expectError('get_quote', quoteInput({ return_date: DEP }), 'RETURN_BEFORE_DEPARTURE');
  await expectError('get_quote', quoteInput({ return_date: addDays(DEP, -2) }), 'RETURN_BEFORE_DEPARTURE');
  await expectError('get_quote', quoteInput({ departure_date: '2026-02-30' }), 'INVALID_DATE');
  await expectError('get_quote', quoteInput({ departure_date: '10/12/2026' }), 'INVALID_DATE');
  await expectError('get_quote', quoteInput({ return_date: addDays(DEP, 90) }), 'TRIP_TOO_LONG'); // 91 days
  assert.equal((await call('get_quote', quoteInput({ return_date: addDays(DEP, 89) }))).ok, true); // exactly 90 days
  await expectError('get_quote', quoteInput({ traveler_ages: [] }), 'INVALID_TRAVELER_COUNT');
  await expectError('get_quote', quoteInput({ traveler_ages: Array(9).fill(30) }), 'INVALID_TRAVELER_COUNT');
  await expectError('get_quote', quoteInput({ traveler_ages: [30, 86] }), 'INVALID_AGE');
  await expectError('get_quote', quoteInput({ traveler_ages: [-1] }), 'INVALID_AGE');
  await expectError('get_quote', quoteInput({ traveler_ages: [30.5] }), 'INVALID_AGE');
  await expectError('get_quote', quoteInput({ traveler_ages: ['30'] }), 'INVALID_AGE');
  await expectError('get_quote', { ...quoteInput(), dni: '12345678Z' }, 'UNKNOWN_FIELD');
});

test('select_plan refusals', async () => {
  const q = await call('get_quote', quoteInput());
  await expectError('select_plan', { quote_id: q.quote_id, plan: 'gold' }, 'INVALID_PLAN');
  await expectError('select_plan', { quote_id: 'nope', plan: 'esencial' }, 'QUOTE_NOT_FOUND');
});

// ---------- traveller detail refusals ----------
test('traveller details refusals: wrong ages, count, email, birth date, extra fields', async () => {
  const q = await call('get_quote', quoteInput());
  const { order_id } = await call('select_plan', { quote_id: q.quote_id, plan: 'esencial' });
  const ph = { full_name: 'Ana Prueba', email: 'ana.prueba@example.com' };
  const ok = [{ full_name: 'Ana Prueba', birth_date: birthFor(35) }, { full_name: 'Luis Prueba', birth_date: birthFor(38) }];

  const mismatch = await expectError('set_traveler_details', { order_id, policyholder: ph, travelers: [ok[0], { ...ok[1], birth_date: birthFor(40) }] }, 'AGE_MISMATCH');
  assert.equal(mismatch.quoted_age, 38);
  assert.equal(mismatch.age_at_departure, 40);
  await expectError('set_traveler_details', { order_id, policyholder: ph, travelers: [ok[1], ok[0]] }, 'AGE_MISMATCH'); // wrong order
  // Birthday the day after departure: still 34, not 35.
  await expectError('set_traveler_details', { order_id, policyholder: ph, travelers: [{ ...ok[0], birth_date: addDays(birthFor(35), 2) }, ok[1]] }, 'AGE_MISMATCH');
  await expectError('set_traveler_details', { order_id, policyholder: ph, travelers: [ok[0]] }, 'TRAVELER_COUNT_MISMATCH');
  await expectError('set_traveler_details', { order_id, policyholder: { ...ph, email: 'not-an-email' }, travelers: ok }, 'INVALID_EMAIL');
  await expectError('set_traveler_details', { order_id, policyholder: ph, travelers: [{ ...ok[0], birth_date: '1991-13-01' }, ok[1]] }, 'INVALID_BIRTH_DATE');
  await expectError('set_traveler_details', { order_id, policyholder: ph, travelers: [{ ...ok[0], passport: 'X123' }, ok[1]] }, 'UNKNOWN_FIELD');
  await expectError('set_traveler_details', { order_id, policyholder: { ...ph, card_number: '4111111111111111' }, travelers: ok }, 'UNKNOWN_FIELD');
  await expectError('set_traveler_details', { order_id, policyholder: { ...ph, full_name: 'A' }, travelers: ok }, 'INVALID_NAME');
  assert.equal((await call('set_traveler_details', { order_id, policyholder: ph, travelers: ok })).ok, true);
});

// ---------- payment refusals ----------
test('payment refusals: no review, bad token, terms, confirmation, total mismatch', async () => {
  const orderId = await orderReadyToReview();
  const pay = over => ({ order_id: orderId, accept_terms: true, confirmed_total_eur: 90, user_confirmed: true, ...over });

  await expectError('confirm_payment', pay({ review_token: 'anything' }), 'NOT_REVIEWED'); // paying without review
  await expectError('review_order', { order_id: 'missing' }, 'ORDER_NOT_FOUND');

  const first = await call('review_order', { order_id: orderId });
  const review = await call('review_order', { order_id: orderId }); // replaces the first token
  const token = review.review_token;
  await expectError('confirm_payment', pay({ review_token: first.review_token }), 'INVALID_REVIEW_TOKEN');
  await expectError('confirm_payment', pay({ review_token: 'wrong-token' }), 'INVALID_REVIEW_TOKEN');
  await expectError('confirm_payment', pay({ review_token: token, accept_terms: false }), 'TERMS_NOT_ACCEPTED');
  await expectError('confirm_payment', pay({ review_token: token, accept_terms: 'true' }), 'TERMS_NOT_ACCEPTED');
  await expectError('confirm_payment', pay({ review_token: token, user_confirmed: false }), 'USER_CONFIRMATION_REQUIRED');
  const mismatch = await expectError('confirm_payment', pay({ review_token: token, confirmed_total_eur: 89.99 }), 'TOTAL_MISMATCH');
  assert.equal(mismatch.reviewed_total_eur, 90);
  await expectError('confirm_payment', pay({ review_token: token, confirmed_total_eur: 90.004 }), 'TOTAL_MISMATCH');
  await expectError('confirm_payment', pay({ review_token: token, confirmed_total_eur: '90' }), 'TOTAL_MISMATCH');
  await expectError('confirm_payment', { ...pay({ review_token: token }), card_number: '4111' }, 'UNKNOWN_FIELD');

  // Changing details after review cancels the token.
  await call('set_traveler_details', {
    order_id: orderId,
    policyholder: { full_name: 'Ana Prueba', email: 'ana.prueba@example.com' },
    travelers: [{ full_name: 'Ana Cambio', birth_date: birthFor(35) }, { full_name: 'Luis Prueba', birth_date: birthFor(38) }],
  });
  await expectError('confirm_payment', pay({ review_token: token }), 'NOT_REVIEWED');

  // After a fresh review, the correct payment works — exactly once, even if sent twice at the same time.
  const fresh = await call('review_order', { order_id: orderId });
  const [a, b] = await Promise.all([call('confirm_payment', pay({ review_token: fresh.review_token })), call('confirm_payment', pay({ review_token: fresh.review_token }))]);
  assert.equal([a, b].filter(r => r.ok).length, 1);
  assert.equal([a, b].find(r => !r.ok).error_code, 'ALREADY_PAID');
});

test('review before traveller details is refused', async () => {
  const q = await call('get_quote', quoteInput());
  const { order_id } = await call('select_plan', { quote_id: q.quote_id, plan: 'esencial' });
  await expectError('review_order', { order_id }, 'DETAILS_MISSING');
});

// ---------- general ----------
test('broken JSON and unknown endpoints give structured errors', async () => {
  const res = await fetch(`${base}/api/get_quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  const json = await res.json();
  assert.equal(json.error_code, 'INVALID_JSON');
  assert.ok(json.how_to_fix);
  await expectError('does_not_exist', {}, 'UNKNOWN_ENDPOINT');
});

test('demo banner is on every page', async () => {
  for (const path of ['/', '/condiciones']) {
    const html = await (await fetch(`${base}${path}`)).text();
    assert.ok(html.includes('Demo — no es un seguro real'), `banner missing on ${path}`);
  }
});
