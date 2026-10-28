// End-to-end tests of the JSON API (the same API the website and the WebMCP tools use).
// Runs against a temporary database; email is not configured on purpose.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import pricing from '../config/pricing.config.js';
import marketQuotes, { quoteCount } from '../config/market-quotes.js';
import { fromPrices } from '../src/landing.js';

let server, base, dataDir, business;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-test-'));
  let app;
  ({ app, business } = createApp({ dataDir, env: {} }));
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

// Spanish money format puts a non-breaking space before €; compare with normal spaces.
const nbsp = s => s.replace(/\u00a0/g, ' ');

const quoteInput = (over = {}) => ({ origin_country: 'ES', destination_country: 'US', departure_date: DEP, return_date: addDays(DEP, 9), traveler_ages: [35, 38], ...over });

// Birth date that gives exactly `age` on the departure date (birthday was the day before).
const birthFor = (age, departure = DEP) => addDays(`${Number(departure.slice(0, 4)) - age}${departure.slice(4)}`, -1);

async function orderReadyToReview(plan = 'wild') {
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

// ---------- pricing (market targets are checked in pricing-targets.test.js) ----------
test('age factors and per-day decrease', async () => {
  const q = await call('get_quote', quoteInput({ traveler_ages: [10, 40, 70, 80] }));
  const [child, adult, senior, older] = q.plans[0].price_per_traveler.map(t => t.price_eur);
  // Age factor is applied before rounding to cents, so allow up to 2 cents of difference.
  for (const [price, factor] of [[child, 0.7], [senior, 1.65], [older, 2.2]]) {
    assert.ok(Math.abs(price - adult * factor) <= 0.02, `${price} is not ${factor} × ${adult}`);
  }
  const short = await call('get_quote', quoteInput({ destination_country: 'FR', return_date: addDays(DEP, 6), traveler_ages: [40] }));
  const long = await call('get_quote', quoteInput({ destination_country: 'FR', return_date: addDays(DEP, 59), traveler_ages: [40] }));
  assert.ok(long.plans[0].total_price_eur / 60 < short.plans[0].total_price_eur / 7);
});

test('quote contains coverage, excess and exclusions for both plans', async () => {
  const q = await call('get_quote', quoteInput());
  assert.equal(q.ok, true);
  assert.equal(q.plans.length, 2);
  const [wild, wild_plus] = q.plans;
  assert.equal(wild.medical_limit_for_this_trip_eur, 1_000_000); // USA counts as rest of world
  assert.equal(wild_plus.medical_limit_for_this_trip_eur, 5_000_000);
  assert.equal(wild.excess_per_medical_claim_eur, 75);
  assert.equal(wild_plus.excess_per_medical_claim_eur, 0);
  assert.equal(wild.cancellation_included, false);
  assert.equal(wild_plus.cancellation_included, true);
  assert.ok(q.exclusions_all_plans.length >= 5);
  const perPerson = wild.price_per_traveler.map(t => t.price_eur);
  assert.equal(wild.total_price_eur, Math.round(perPerson.reduce((a, b) => a + b) * 100) / 100);
  assert.deepEqual(q.plans.map(p => [p.plan, p.plan_name]), [['wild', 'Wild'], ['wild_plus', 'Wild+']]);
});

test('only Wild+ covers adventure sports and search & rescue; extreme sports excluded in both', async () => {
  const q = await call('get_quote', quoteInput());
  const [wild, wildPlus] = q.plans;
  assert.equal(wild.adventure_sports_included, false);
  assert.equal(wild.search_and_rescue_eur, 0);
  assert.ok(wild.exclusions.some(x => /deportes de aventura/i.test(x)));
  assert.equal(wildPlus.adventure_sports_included, true);
  assert.equal(wildPlus.search_and_rescue_eur, 15000);
  assert.deepEqual(wildPlus.adventure_sports_limits, { trekking_max_altitude_m: 4000, scuba_diving_max_depth_m: 30, skiing_snowboarding: 'marked slopes only', other_included: ['surf', 'rafting', 'canyoning'] });
  assert.ok(wildPlus.coverage_summary.map(nbsp).includes('Búsqueda y rescate: 15.000 €'));
  for (const plan of [wild, wildPlus]) {
    assert.ok(plan.exclusions.some(x => /profesionales/.test(x) && /BASE/.test(x)), `${plan.plan} must exclude professional and extreme sports`);
  }
  assert.ok(!wildPlus.exclusions.some(x => x.startsWith('Deportes de aventura (trekking')), 'Wild+ must not exclude adventure sports');

  // The review shows the chosen plan's own exclusions and adventure condition.
  const orderId = await orderReadyToReview('wild_plus');
  const review = await call('review_order', { order_id: orderId });
  assert.ok(review.key_conditions.some(x => nbsp(x).includes('Búsqueda y rescate hasta 15.000 €')));
  assert.deepEqual(review.summary.exclusions, wildPlus.exclusions);
  await expectError('select_plan', { quote_id: q.quote_id, plan: 'premium' }, 'INVALID_PLAN'); // old names are gone
});

// ---------- full flow ----------
test('full purchase flow issues a policy with a downloadable PDF', async () => {
  const orderId = await orderReadyToReview('wild_plus');
  const review = await call('review_order', { order_id: orderId });
  assert.equal(review.ok, true);
  assert.ok(review.total_eur > 0);
  assert.ok(review.review_token.length >= 30);
  assert.match(review.terms_url, /\/condiciones$/);
  const total = review.total_eur;

  const paid = await call('confirm_payment', { order_id: orderId, review_token: review.review_token, accept_terms: true, confirmed_total_eur: total, user_confirmed: true });
  assert.equal(paid.ok, true, paid.message);
  assert.match(paid.policy_number, /^WILD-\d{4}-[A-Z2-9]{6}$/);
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
  await expectError('get_policy', { policy_number: 'WILD-2026-ZZZZZZ', email: 'ana.prueba@example.com' }, 'POLICY_NOT_FOUND');
  const again = await expectError('confirm_payment', { order_id: orderId, review_token: review.review_token, accept_terms: true, confirmed_total_eur: total, user_confirmed: true }, 'ALREADY_PAID');
  assert.equal(again.policy_number, paid.policy_number);
});

test('a sold policy keeps its original coverage when the config changes later', async () => {
  const orderId = await orderReadyToReview('wild_plus');
  const review = await call('review_order', { order_id: orderId });
  const paid = await call('confirm_payment', { order_id: orderId, review_token: review.review_token, accept_terms: true, confirmed_total_eur: review.total_eur, user_confirmed: true });
  assert.equal(paid.ok, true, paid.message);

  // Simulate a later change of the plan in config/pricing.config.js (restored afterwards).
  const plan = pricing.plans.wild_plus;
  const original = { baggage: plan.coverage.baggage_theft_damage_eur, excess: plan.excess_per_medical_claim_eur, extra: plan.extraExclusions, base: pricing.basePrice7Days.usa_canada_japan.wild_plus };
  try {
    plan.coverage.baggage_theft_damage_eur = 1;
    plan.excess_per_medical_claim_eur = 999;
    plan.extraExclusions = ['NUEVA EXCLUSIÓN'];
    pricing.basePrice7Days.usa_canada_japan.wild_plus = 1;

    const policy = await call('get_policy', { policy_number: paid.policy_number, email: 'ana.prueba@example.com' });
    assert.equal(policy.ok, true, policy.message);
    assert.equal(policy.coverage_source, 'snapshot_at_sale');
    assert.deepEqual(policy.details, review.summary);
    assert.equal(policy.details.plan.coverage_limits_eur.baggage_theft_damage_eur, original.baggage);
    assert.equal(policy.details.plan.excess_per_medical_claim_eur, original.excess);
    assert.ok(!policy.details.exclusions.includes('NUEVA EXCLUSIÓN'));
    assert.equal(policy.details.total_eur, review.total_eur);

    // New quotes do see the change, proving the config really changed.
    const q = await call('get_quote', quoteInput());
    assert.equal(q.plans[1].excess_per_medical_claim_eur, 999);
  } finally {
    plan.coverage.baggage_theft_damage_eur = original.baggage;
    plan.excess_per_medical_claim_eur = original.excess;
    plan.extraExclusions = original.extra;
    pricing.basePrice7Days.usa_canada_japan.wild_plus = original.base;
  }
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
  await expectError('select_plan', { quote_id: 'nope', plan: 'wild' }, 'QUOTE_NOT_FOUND');
});

// ---------- traveller detail refusals ----------
test('traveller details refusals: wrong ages, count, email, birth date, extra fields', async () => {
  const q = await call('get_quote', quoteInput());
  const { order_id } = await call('select_plan', { quote_id: q.quote_id, plan: 'wild' });
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
  let total = 0;
  const pay = over => ({ order_id: orderId, accept_terms: true, confirmed_total_eur: total, user_confirmed: true, ...over });

  await expectError('confirm_payment', pay({ review_token: 'anything' }), 'NOT_REVIEWED'); // paying without review
  await expectError('review_order', { order_id: 'missing' }, 'ORDER_NOT_FOUND');

  const first = await call('review_order', { order_id: orderId });
  const review = await call('review_order', { order_id: orderId }); // replaces the first token
  const token = review.review_token;
  total = review.total_eur;
  await expectError('confirm_payment', pay({ review_token: first.review_token }), 'INVALID_REVIEW_TOKEN');
  await expectError('confirm_payment', pay({ review_token: 'wrong-token' }), 'INVALID_REVIEW_TOKEN');
  await expectError('confirm_payment', pay({ review_token: token, accept_terms: false }), 'TERMS_NOT_ACCEPTED');
  await expectError('confirm_payment', pay({ review_token: token, accept_terms: 'true' }), 'TERMS_NOT_ACCEPTED');
  await expectError('confirm_payment', pay({ review_token: token, user_confirmed: false }), 'USER_CONFIRMATION_REQUIRED');
  const mismatch = await expectError('confirm_payment', pay({ review_token: token, confirmed_total_eur: Math.round((total - 0.01) * 100) / 100 }), 'TOTAL_MISMATCH');
  assert.equal(mismatch.reviewed_total_eur, total);
  await expectError('confirm_payment', pay({ review_token: token, confirmed_total_eur: total + 0.004 }), 'TOTAL_MISMATCH');
  await expectError('confirm_payment', pay({ review_token: token, confirmed_total_eur: String(total) }), 'TOTAL_MISMATCH');
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
  const { order_id } = await call('select_plan', { quote_id: q.quote_id, plan: 'wild' });
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
    assert.ok(html.includes('Demo — no es un seguro real. Ningún pago es real.'), `banner missing on ${path}`);
  }
});

test('landing: complete server-rendered page with prices from the pricing engine', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = nbsp(await res.text());
  // Every template placeholder was filled (an unknown one would have thrown).
  assert.ok(!/\{\{|\}\}/.test(html), 'leftover template braces');
  for (const text of ['Travel wild. We’ve got you.', 'Ver mi precio', 'Gratis y sin compromiso: no te pedimos datos personales.',
    'Viajeros y edad el día de la ida', '+ Añadir viajero', 'Cómo funciona',
    'Tu asistente también puede contratarlo', 'Tú pon la aventura. Nosotros, todo lo demás.', 'Elige cómo quieres viajar',
    'El favorito de los aventureros', '¿Preparado para empezar tu viaje?', 'Hecho con WebMCP']) {
    assert.ok(html.includes(text.replace('’', "'")) || html.includes(text) || html.includes(text.replace('’', '&#39;')), `missing: ${text}`);
  }
  // "Desde X €" = 7 days, Europe, 1 adult, straight from the engine (never hardcoded).
  const from = fromPrices(business, pricing);
  const eur = n => `Desde ${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  assert.ok(html.includes(eur(from.wild)), `Wild ${eur(from.wild)} missing`);
  assert.ok(html.includes(eur(from.wild_plus)), `Wild+ ${eur(from.wild_plus)} missing`);
  const q = await call('get_quote', quoteInput({ destination_country: 'IT', return_date: addDays(DEP, 6), traveler_ages: [35] }));
  assert.equal(q.plans[0].total_price_eur, from.wild);
  assert.equal(q.plans[1].total_price_eur, from.wild_plus);
  // The FAQ quote count is computed from the market data; the methodology line and page are gone.
  assert.equal(quoteCount(marketQuotes), 13);
  assert.ok(html.includes('Lo calibramos con 13 presupuestos reales de otras aseguradoras.'));
  assert.ok(!html.includes('/metodologia') && !html.includes('Precios calibrados'));
  // Traveller ages: a dropdown per traveller, 0–85, "Menos de 1 año" for 0, 30 años selected by default.
  const options = [...html.matchAll(/<option value="(\d+)"( selected)?>([^<]+)<\/option>/g)];
  assert.equal(options.length, pricing.limits.maxAge - pricing.limits.minAge + 1);
  assert.equal(options[0][3], 'Menos de 1 año');
  assert.equal(options[1][3], '1 año');
  assert.equal(options.at(-1)[3], '85 años');
  assert.deepEqual(options.filter(o => o[2]).map(o => o[1]), ['30']);
  // Checkout steps are in the page; no ID or card fields anywhere.
  for (const id of ['quote-form', 'trip-card', 'step-1', 'step-2', 'step-3', 'step-4', 'total-bar', 'accept-terms', 'exclusions']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!/dni|tarjeta de cr|card-number|cc-number/i.test(html.replace('Nada de DNI', '').replace('datos de tarjeta', '')));
});

test('the old methodology page is gone (research stays in docs/pricing-research.md)', async () => {
  assert.equal((await fetch(`${base}/metodologia`)).status, 404);
});

test('brand: name, claim, colours and self-hosted fonts', async () => {
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.brand.name, 'Seguros Wildpass');
  assert.deepEqual(config.brand.logo, { wordmark: 'wildpass', tagline: 'seguros de viaje' });
  assert.equal(config.brand.claim, "Travel wild. We've got you.");
  assert.equal(config.brand.claimEs, 'Viaja salvaje. Nosotros te cubrimos.');
  assert.deepEqual(config.plans, { wild: 'Wild', wild_plus: 'Wild+' });

  const css = await (await fetch(`${base}/brand.css`)).text();
  for (const colour of ['#E3F4FB', '#FFFFFF', '#0B1F3A', '#3C5368', '#0E7C86', '#0B6770', '#FFC21A', '#D7263D']) assert.ok(css.includes(colour), `${colour} missing`);
  assert.ok(css.includes('Space Grotesk') && css.includes('Inter'));
  const font = await fetch(`${base}/fonts/inter-latin-400-normal.woff2`);
  assert.equal(font.status, 200);
  assert.equal((await fetch(`${base}/fonts/..%2Fpackage.json`)).status, 404);

  const terms = nbsp(await (await fetch(`${base}/condiciones`)).text());
  assert.ok(terms.includes('wildpass') && terms.includes('Wild+') && terms.includes('15.000 €'));

  // Logo: sun + mountain inline SVG on the home page and the terms page; favicons served.
  const home = await (await fetch(`${base}/`)).text();
  for (const html of [home, terms]) {
    assert.ok(html.includes('<circle cx="36" cy="18" r="10" fill="#FFC21A"/>'), 'sun missing');
    assert.ok(html.includes('<polygon points="4,48 22,18 31,32 38,24 52,48" fill="#0E7C86"/>'), 'mountain missing');
    assert.ok(html.includes('href="/favicon.svg"'), 'favicon link missing');
  }
  assert.ok(home.includes('<!--logo-->') === false);
  assert.ok((await (await fetch(`${base}/api/config`)).json()).brand.texts.heroSubtitle.startsWith('Seguro de viaje con deportes de aventura'));
  const favicon = await fetch(`${base}/favicon.svg`);
  assert.equal(favicon.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.ok((await favicon.text()).includes('rx="12"'));
  for (const png of ['/favicon-32.png', '/apple-touch-icon.png', '/brand/logo-symbol-email.png']) {
    const r = await fetch(`${base}${png}`);
    assert.equal(r.status, 200, png);
    assert.equal(r.headers.get('content-type'), 'image/png');
  }
});

test('brand rule: yellow only on clickable primary buttons', async () => {
  const css = await (await fetch(`${base}/style.css`)).text();
  // Every rule that uses the yellow colour must be the .primary button rule.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(rule => rule.includes('var(--yellow)') || /#FFC21A/i.test(rule));
  assert.ok(rules.length >= 1);
  for (const rule of rules) assert.match(rule.trim(), /^\.primary \{/, `yellow used outside buttons: ${rule.trim().slice(0, 60)}`);
  assert.ok(!css.includes('--pale-yellow'), 'pale yellow is not used on the site');
});
