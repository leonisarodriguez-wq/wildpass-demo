// End-to-end tests of the JSON API (the same API the website and the WebMCP tools use).
// Runs against a temporary database; email is not configured on purpose.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import pricing from '../config/pricing.config.js';
import marketQuotes, { quoteCount } from '../config/market-quotes.js';
import { fromPrices } from '../src/landing.js';
import { buildTools } from '../public/webmcp-tools.js';
import { sceneFor } from '../src/scenes.js';
import brand from '../config/brand.config.js';

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
  assert.equal(policy.status, 'pending_id'); // no DNI/NIE sent → issued as «DNI pendiente»
  assert.equal(policy.status_text, 'DNI pendiente');
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
    // What was reviewed, plus how it was paid (Stripe is off in these tests).
    // Plus the policy status set at issue (no DNI/NIE sent → «DNI pendiente»).
    const { payment, id_status, status_text, ...sold } = policy.details;
    assert.deepEqual(sold, review.summary);
    assert.equal(id_status, 'pending_id');
    assert.equal(status_text, 'DNI pendiente');
    assert.deepEqual(payment, { provider: 'simulated', ref: null, text: 'Pago simulado' });
    assert.equal(policy.payment, 'Pago simulado');
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
  for (const path of ['/', '/condiciones', '/agentes', '/no-existe']) {
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
  // Headline: two fixed lines, never a lonely "you.".
  assert.ok(/<h1 id="hero-title"><span class="hero-a" lang="en"><span class="claim-part">Travel wild\.<\/span> <span class="claim-part">We(’|'|&#39;)ve got you\.<\/span><\/span><span class="hero-b">El seguro de viaje que sí cubre tu aventura<\/span><\/h1>/.test(html), 'headline in two parts, plus the hidden variant B');
  // Live price line sits ABOVE the button and stays hidden until there is a price (no placeholder).
  assert.ok(html.indexOf('id="price-preview"') < html.indexOf('id="quote-submit"') && html.includes('<p class="price-preview" id="price-preview" hidden><span class="pp-main"></span>'));
  assert.ok(!html.includes('Elige destino y fechas para verlo'));
  // Header: skip link first, then menu links and "Ver mi precio"; phones fold them into "Menú".
  assert.ok(html.indexOf('class="skip-link" href="#contenido"') < html.indexOf('id="demo-banner"') && html.includes('id="contenido" tabindex="-1"'));
  for (const link of ['<a href="#preguntas" data-open-faq>Preguntas frecuentes</a>', '<a href="/agentes">Agentes</a>', '<a href="/condiciones">Condiciones</a>',
    '<a class="primary nav-cta" href="#quote-form" data-focus-form>Ver mi precio</a>', 'id="menu-toggle" aria-expanded="false" aria-controls="site-nav"']) assert.ok(html.includes(link), link);
  // Sticky header: "Ver mi precio" sits in the bar, outside the folding menu; the landing's header is marked is-home
  // (CSS hides its button on phones, where the bottom sticky bar says it: never two at once).
  const header = html.slice(html.indexOf('<header class="site-header is-home">'), html.indexOf('</header>'));
  assert.ok(header.length > 0 && header.indexOf('nav-cta') > header.indexOf('</nav>'));
  assert.ok(!(await (await fetch(`${base}/condiciones`)).text()).includes('site-header is-home'));
  const css = await (await fetch(`${base}/style.css`)).text();
  assert.ok(css.includes('.site-header { position: sticky; top: var(--banner-h, 31px);') && css.includes('.site-header.is-home .nav-cta { display: none; }') && css.includes('scroll-padding-top'));
  // FAQ: about ten questions, closed behind a button; some answers link to the quote form.
  assert.ok(html.includes('id="faq-toggle" aria-expanded="false" aria-controls="faq-list"') && html.includes('<div class="faq-list" id="faq-list" hidden>'));
  assert.ok((html.match(/<details class="faq-item">/g) ?? []).length >= 9);
  assert.ok(html.includes('<a href="#quote-form" data-focus-form>Calcula tu precio</a>'));
  for (const text of ['Ver mi precio', 'Gratis y sin compromiso: para ver tu precio no te pedimos datos personales.',
    'Viajeros y edad el día de la ida', 'La edad influye en el precio.', '+ Añadir viajero',
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
  // Checkout steps are in the page; no card or passport fields anywhere. ONE DNI/NIE field: the policyholder's, in step 2.
  for (const id of ['quote-form', 'trip-card', 'step-1', 'step-2', 'step-3', 'step-4', 'total-bar', 'accept-terms', 'exclusions', 'ph-id', 'ph-resident']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Simulación: puedes usar el DNI de prueba 12345678Z.'), 'DNI test note in step 2');
  assert.ok(!/tarjeta de cr|card-number|cc-number/i.test(html.replace('datos de tarjeta', '').replace('Tarjeta de crédito o débito', '')));
  assert.ok(!/<input[^>]*(card|dni|passport|cvc)/i.test(html));
  assert.equal((html.match(/<input id="ph-id"[^>]*autocomplete="off"/g) ?? []).length, 1);
});

test('landing hero: destination scenes and the AI example use real prices and the real WebMCP tools', async () => {
  const html = nbsp(await (await fetch(`${base}/`)).text());
  // Destination → scene (explicit ones first, then any European country → old town, else mountains).
  for (const [code, scene] of [['TH', 'thailand'], ['JP', 'japan'], ['PE', 'peru'], ['IS', 'iceland'], ['MX', 'mexico'], ['US', 'usa'], ['IT', 'europe'], ['AR', 'mountains']]) {
    assert.equal(sceneFor(code, pricing), scene, code);
    assert.ok(html.includes(`value="${code}" data-scene="${scene}"`), `option ${code}`);
  }
  for (const id of ['hero-scene', 'route', 'price-preview', 'showcase', 'showcase-replay']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Ilustración de cómo funciona'));
  // The example price is the engine's total for Wild+ to Thailand, 10–24 Dec (15 days), ages 35 + 38.
  const q = await call('get_quote', { origin_country: 'ES', destination_country: 'TH', departure_date: '2027-12-10', return_date: '2027-12-24', traveler_ages: [35, 38] });
  const plus = q.plans.find(p => p.plan === 'wild_plus').total_price_eur.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  assert.ok(html.includes(`Wild+: ${plus} € para los dos`), `example price ${plus}`);
  assert.ok(html.includes(`¿Confirmas el pago de ${plus} €?`));
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
  // Under the English claim: the short Spanish line (turquoise, Space Grotesk), then the explanation.
  assert.ok(home.includes('<p class="hero-tagline">Viaja salvaje. Nosotros te cubrimos.</p>\n          <p class="hero-sub">Seguro de viaje con deportes de aventura y la póliza en tu email en 2 minutos.</p>'));
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

test('AI block on the landing: only title, text, the example chat and the compatibility line', async () => {
  const html = nbsp(await (await fetch(`${base}/`)).text());
  const ai = html.slice(html.indexOf('id="ia"'), html.indexOf('</section>', html.indexOf('id="ia"')));
  assert.ok(ai.includes('Tu asistente también puede contratarlo') && ai.includes('id="showcase"') && ai.includes('id="showcase-replay"'));
  // ONE discreet link to /agentes, server-rendered; the old visible "¿Usas un asistente de IA?…" line is gone.
  assert.ok(ai.includes('<p class="ai-agents"><a href="/agentes">Ver cómo funciona<span class="arrow" aria-hidden="true">→</span></a></p>'));
  assert.ok(!html.includes('¿Usas un asistente de IA?'));
  assert.ok(!ai.includes('Funciona con asistentes y navegadores compatibles con WebMCP'));
  // Developer material lives on /agentes now.
  for (const gone of ['copy-prompt', 'Para desarrolladores</summary>', 'Herramientas WebMCP que usa', 'data-tool=', 'Prueba a pedirle esto']) assert.ok(!html.includes(gone), gone);
  // Screen readers: each message once. The visual copy is aria-hidden, the sr-only copy carries the speaker.
  const bubbles = [...ai.matchAll(/<li class="bubble[^"]*"[^>]*>(.*?)<\/li>/g)].map(m => m[1]);
  assert.equal(bubbles.length, 6);
  for (const b of bubbles) {
    const readable = b.replace(/<span class="bubble-text" aria-hidden="true">.*?<\/span>/, '');
    assert.equal((readable.match(/<span class="sr-only">/g) ?? []).length, 1, b);
    assert.ok(b.includes('<span class="bubble-text" aria-hidden="true">'), b);
  }
  assert.ok(bubbles[0].startsWith('<span class="sr-only">Usuario: Necesito un seguro para Tailandia'));
  // Section order: hero → benefits → ¿Y si…? → destinations → plans → AI → FAQ → final CTA; footer links.
  const order = ['hero-title', 'editorial-title', 'whatif-title', 'dest-title', 'plans-title', 'ai-title', 'faq-title', 'cta-title'].map(id => html.indexOf(`id="${id}"`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!order.includes(-1));
  assert.ok(html.includes('<a href="/condiciones">') && html.includes('<a href="/agentes">Para desarrolladores y agentes de IA</a>'));
  // Trust strip right under the hero: 4 facts, values from the pricing config; no 24 h promise anywhere (not in the terms).
  assert.ok(html.indexOf('class="trust"') > html.indexOf('id="quote-form"') && html.indexOf('class="trust"') < html.indexOf('id="editorial-title"'));
  assert.equal((html.match(/<li class="trust-item">/g) ?? []).length, 4);
  for (const [main, sub] of [['Póliza en tu email en 2 min', 'sin papeleos'], ['Si cancelas, recuperas hasta 3.000 €', 'por viajero, con Wild+'],
    ['Deportes de aventura incluidos', 'trekking, buceo, esquí… con Wild+'], ['Sin letra pequeña', 'condiciones claras']]) {
    assert.ok(html.includes(`<span class="trust-main">${main}</span><span class="trust-sub">${sub}</span>`), main);
  }
  // The success step shows no payment reference (it stays in the API, the PDF and the email).
  assert.ok(!html.includes('payment-line'));
  const visibleText = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/\b24 ?h\b|demoras|asistencia 24/i.test(visibleText), 'no promise the terms do not make');
  assert.ok(html.includes('Médicos, dentista urgente, equipaje y retraso de maleta'));
  // CTAs: plan buttons are secondary and preselect their plan; "Comparar planes" and "Ver qué cubre" are secondary too.
  assert.ok(html.includes('<a class="secondary block card-button" href="#quote-form" data-focus-form data-plan="wild">Elegir Wild</a>'));
  assert.ok(html.includes('<a class="secondary block card-button" href="#quote-form" data-focus-form data-plan="wild_plus">Elegir Wild+</a>'));
  assert.ok(html.includes('<a class="secondary button-link" href="#planes">Comparar planes</a>') && html.includes('<a class="secondary button-link" href="/condiciones">Ver qué cubre</a>'));
  // Benefits: no AI repeat; plans: two cards only.
  assert.ok(html.includes('Sin franquicia en Wild+') && !html.includes('Contrátalo con tu asistente de IA'));
  assert.equal((html.match(/<li class="plan-card/g) ?? []).length, 2);
  assert.ok(html.includes('¿Y si me tuerzo el tobillo haciendo trekking?'));
});

test('/agentes: WebMCP explained, example prompt, the real tools and the confirm_payment rules', async () => {
  const res = await fetch(`${base}/agentes`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Demo — no es un seguro real'), 'demo banner');
  assert.ok(html.includes('<h1>Asistentes de IA en Wildpass</h1>') && html.includes('Qué es WebMCP'));
  assert.ok(html.includes('Búscame un seguro de viaje para 2 personas de 35 y 38 años, de España a Tailandia, del 10 al 24 de diciembre, y enséñame el resumen antes de pagar.'));
  assert.ok(html.includes('id="copy-prompt"') && html.includes('<script type="module" src="/agentes.js"></script>'));
  assert.equal((await fetch(`${base}/agentes.js`)).status, 200);
  const plans = Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name]));
  for (const payments of [{ provider: 'simulated' }, { provider: 'stripe_test' }]) {
    const tools = buildTools({ limits: pricing.limits, plans, brand: { name: 'Seguros Wildpass' }, payments });
    assert.deepEqual(tools.map(t => t.name), ['get_quote', 'select_plan', 'set_traveler_details', 'review_order', 'confirm_payment', 'get_policy']);
    for (const t of tools) assert.ok(t.es?.length > 10, `${t.name} has no Spanish line`);
    const pay = tools.find(t => t.name === 'confirm_payment');
    for (const field of pay.inputSchema.required.filter(f => f !== 'order_id')) assert.ok(pay.rulesEs[field], `no Spanish rule for ${field}`);
  }
  const tools = buildTools({ limits: pricing.limits, plans, brand: { name: 'Seguros Wildpass' }, payments: { provider: 'simulated' } });
  assert.ok(html.includes(`Las ${tools.length} herramientas`));
  for (const t of tools) assert.ok(html.includes(`<li><code>${t.name}</code> ${t.es.replace(/[<>&]/g, '')}`), `${t.name} missing from the list`);
  for (const field of ['review_token', 'accept_terms', 'user_confirmed', 'confirmed_total_eur']) assert.ok(html.includes(`<li><code>${field}</code>:`), field);
});

test('/agentes: the tool list comes right under its "Las 6 herramientas" heading', async () => {
  const html = await (await fetch(`${base}/agentes`)).text();
  assert.match(html, /<h3>Las 6 herramientas, en orden<\/h3>\s*<ol class="dev-tool-list">/);
});

test('/agentes: two parts, for anyone first, then for developers (flow, browsers, real error codes, copyable examples)', async () => {
  const html = nbsp(await (await fetch(`${base}/agentes`)).text());
  const people = html.indexOf('<section class="agents-part" id="personas"');
  const dev = html.indexOf('<section class="agents-part" id="desarrolladores"');
  assert.ok(people > 0 && dev > people, 'people part, then developers part');
  assert.ok(html.includes('<a href="#personas">Para cualquier persona</a><a href="#desarrolladores">Para desarrolladores</a>'));
  const forPeople = html.slice(people, dev);
  for (const text of ['Qué puede hacer un asistente aquí', 'Un ejemplo', 'id="copy-prompt"', 'Qué pasa después',
    'Tu asistente nunca paga sin tu confirmación explícita y nunca toca tu tarjeta']) assert.ok(forPeople.includes(text), text);
  const forDev = html.slice(dev);
  for (const text of ['Las 6 herramientas', 'El flujo', 'Reglas de seguridad de confirm_payment', 'Compatibilidad con navegadores', 'id="webmcp-provider"', 'Errores', 'Ejemplos para copiar']) assert.ok(forDev.includes(text), text);
  // The flow: the tools in order, the user's "yes" right before confirm_payment.
  assert.match(forDev, /<code>get_quote<\/code> → <code>select_plan<\/code> → <code>set_traveler_details<\/code> → <code>review_order<\/code> → <em>[^<]+<\/em> → <code>confirm_payment<\/code>/);
  // Every error code listed is one the server really returns.
  const business = readFileSync(new URL('../src/business.js', import.meta.url), 'utf8');
  const codes = [...forDev.matchAll(/<ul class="dev-errors">(.*?)<\/ul>/g)][0][1].match(/<code>([A-Z_]+)<\/code>/g).map(c => c.slice(6, -7));
  assert.ok(codes.length >= 8);
  for (const c of codes) assert.ok(business.includes(`fail('${c}'`), c);
  // Three copyable examples, each with its own button; the dates in the get_quote example are in the future.
  assert.equal((forDev.match(/class="secondary copy-code" data-copy="code-\d"/g) ?? []).length, 3);
  const [dep] = forDev.match(/departure_date: &#39;(\d{4}-\d{2}-\d{2})&#39;/).slice(1);
  assert.ok(dep > new Date().toISOString().slice(0, 10), dep);
});

test('/condiciones: Wild vs Wild+ table first, an index with working anchors, "Ver mi precio" at the end', async () => {
  const html = nbsp(await (await fetch(`${base}/condiciones`)).text());
  const index = html.indexOf('class="terms-index"');
  const table = html.indexOf('<table class="terms-table">');
  assert.ok(index > 0 && table > index, 'index, then the table');
  assert.ok(table < html.indexOf('id="quien"') && table < html.indexOf('id="exclusiones"'), 'the table comes before the other sections');
  const anchors = [...html.slice(index, table).matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(anchors, ['comparativa', 'quien', 'plan-wild', 'plan-wild-plus', 'exclusiones']);
  for (const id of anchors) assert.ok(html.includes(`id="${id}"`), `anchor #${id} has no target`);
  assert.ok(html.includes('<th scope="col">Wild</th><th scope="col">Wild+</th>'));
  // Every coverage line, with the values from the pricing config.
  for (const label of Object.values(pricing.coverageLabels)) assert.ok(html.includes(`<th scope="row">${label}</th>`), label);
  assert.ok(html.includes('<td data-plan="Wild">75 €</td><td data-plan="Wild+">Sin franquicia</td>'));
  assert.ok(html.includes('<td data-plan="Wild">No incluida</td><td data-plan="Wild+">15.000 €</td>'));
  const cta = html.indexOf('<div class="page-cta">');
  assert.ok(cta > html.indexOf('id="exclusiones"'), 'CTA at the end');
  assert.ok(html.slice(cta).includes('<a class="primary" href="/#quote-form">Ver mi precio</a>'));
});

test('404: unknown addresses get the branded page with the way back to the quote form', async () => {
  for (const path of ['/no-existe', '/poliza', '/agentes/x']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, path);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.ok(html.includes('Demo — no es un seguro real. Ningún pago es real.'), 'demo banner');
    assert.ok(html.includes('<title>Página no encontrada · Seguros Wildpass</title>'));
    assert.ok(html.includes('<a class="primary" href="/#quote-form">Ver mi precio</a>') && html.includes('<a class="secondary" href="/">'));
  }
  // The API keeps answering JSON.
  const api = await fetch(`${base}/api/nope`, { method: 'POST' });
  assert.equal(api.status, 404);
  assert.equal((await api.json()).error_code, 'UNKNOWN_ENDPOINT');
});

test('link previews: Open Graph + twitter:card with absolute URLs and a 1200×630 PNG', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const meta = name => html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)">`))?.[1];
  assert.equal(meta('og:url'), `${base}/`);
  assert.equal(meta('og:image'), `${base}/og-image.png`);
  assert.equal(meta('twitter:image'), `${base}/og-image.png`);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  for (const name of ['og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description']) assert.ok(meta(name)?.length > 10, name);
  assert.ok(meta('og:description').startsWith('Demo — no es un seguro real.'), 'the preview says it is a demo');
  const png = await fetch(`${base}/og-image.png`);
  assert.equal(png.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await png.arrayBuffer());
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1200, 630]); // PNG header: width, height
});

test('agent activity: a hidden floating pill instead of the technical footer line; provider info only on /agentes', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(!html.includes('Actividad del asistente de IA en esta página') && !html.includes('id="webmcp-status"') && !html.includes('id="agent-activity"'));
  assert.ok(!/MCP-B|polyfill|modelContext/.test(html.slice(html.indexOf('<footer'))), 'no technical WebMCP info in the footer');
  const pill = html.match(/<aside class="agent-pill" id="agent-pill"[^>]*>/)?.[0];
  assert.ok(pill && pill.includes(' hidden'), 'pill exists and starts hidden');
  assert.ok(html.includes('Tu asistente está usando Wildpass') && html.includes('aria-expanded="false" aria-controls="agent-log"') && html.includes('role="status" id="agent-status"'));
  assert.equal((await fetch(`${base}/agent-pill.js`)).status, 200);
  const steps = brand.texts.agentPill.steps;
  assert.deepEqual(Object.keys(steps), ['get_quote', 'select_plan', 'set_traveler_details', 'review_order', 'confirm_payment', 'get_policy']);
  const agents = await (await fetch(`${base}/agentes`)).text();
  assert.ok(agents.includes('id="webmcp-provider"') && agents.includes('polyfill MCP-B'));
});

test('destinations: popular first, remote territories gone, "do not travel" countries refused everywhere', async () => {
  const html = nbsp(await (await fetch(`${base}/`)).text());
  const popular = html.slice(html.indexOf('<optgroup label="Destinos populares">'), html.indexOf('</optgroup>'));
  assert.deepEqual([...popular.matchAll(/<option value="([A-Z]{2})"/g)].map(m => m[1]), ['FR', 'IT', 'PT', 'GB', 'US', 'MX', 'TH', 'JP', 'PE', 'MA']);
  assert.ok(html.includes('<optgroup label="Todos los destinos">'));
  for (const code of ['AQ', 'BV', 'HM', 'GS', 'TF', 'IO', 'UM']) {
    assert.ok(!html.includes(`value="${code}"`), `${code} still offered`);
    await expectError('get_quote', quoteInput({ destination_country: code }), 'INVALID_COUNTRY');
  }
  assert.equal((html.match(/value="FR"/g) ?? []).length, 1, 'popular countries are not listed twice');
  // Every "do not travel" country is marked in the page and refused by the server (= the WebMCP get_quote tool).
  assert.ok(pricing.destinationsNotCovered.length >= 18);
  for (const code of pricing.destinationsNotCovered) {
    assert.ok(new RegExp(`value="${code}" data-scene="\\w+" data-blocked="true"`).test(html), `${code} not marked`);
    const r = await call('get_quote', quoteInput({ destination_country: code }));
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'DESTINATION_NOT_COVERED', code);
    assert.match(r.message, /recomendación oficial de no viajar/);
    assert.match(r.how_to_fix, /otro destino/);
  }
  assert.ok(!/value="FR"[^>]*data-blocked/.test(html));
  // List checked 29 Oct 2026: Lebanon refused, Belarus and Venezuela priced again.
  assert.equal((await call('get_quote', quoteInput({ destination_country: 'LB' }))).error_code, 'DESTINATION_NOT_COVERED');
  for (const code of ['BY', 'VE']) {
    const ok = await call('get_quote', quoteInput({ destination_country: code }));
    assert.ok(ok.ok && ok.plans.length === 2 && ok.plans[0].total_price_eur > 0, code);
  }
  // The agent is told about the rule in the tool description; the website shows the friendly text.
  const tools = buildTools({ limits: pricing.limits, plans: { wild: 'Wild', wild_plus: 'Wild+' }, brand, payments: { provider: 'simulated' } });
  assert.match(tools[0].description, /DESTINATION_NOT_COVERED/);
  assert.equal(brand.texts.errors.DESTINATION_NOT_COVERED, 'No podemos asegurar viajes a destinos con recomendación oficial de no viajar.');
});

// app.js showError() looks for ONE `.error[role="alert"]` inside each scope. When step 3's box moved into .pay-col,
// the old selector found nothing, threw after a successful card payment and the success step never showed.
test('every scope app.js shows errors in has exactly one error box', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const part = (from, to) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));
  const scopes = {
    'quote-form': part('<form id="quote-form"', '</form>'),
    'step-1': part('id="step-1"', 'id="step-2"'),
    'details-form': part('<form id="details-form"', '</form>'),
    'step-3': part('id="step-3"', 'id="step-4"'),
  };
  for (const [name, chunk] of Object.entries(scopes)) {
    assert.equal((chunk.match(/class="error"[^>]*role="alert"/g) ?? []).length, 1, name);
  }
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes(`scope.querySelector('.error[role="alert"]')`), 'showError uses the box wherever it sits');
});

test('checkout copy: Spanish dates, new success title and the boarding pass on the success step', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.equal((html.match(/type="date"[^>]*lang="es"/g) ?? []).length, 2);
  assert.ok(html.includes('¡Todo listo para empezar tu aventura!'));
  assert.ok(!html.includes('Ya puedes irte salvaje'));
  for (const id of ['done-names', 'done-destination', 'done-departure', 'done-return', 'done-plan', 'done-holder-id', 'policy-number', 'policy-qr', 'pdf-link', 'email-line', 'resend', 'forward-form', 'forward-email', 'send-list', 'start-over']) assert.ok(html.includes(`id="${id}"`), id);
  // Resend / forward come right under "Descargar mi póliza", before "Calcular otro viaje".
  assert.ok(html.indexOf('id="pdf-link"') < html.indexOf('id="resend"') && html.indexOf('id="forward-form"') < html.indexOf('id="start-over"'));
  assert.ok(html.includes('¿No te ha llegado? Reenviar') && html.includes('Comparte la póliza con quien viaja contigo'));
  // ONE forward card; "Reenviar" and "Calcular otro viaje" are links (no card, no yellow).
  assert.equal((html.match(/class="after-card"/g) ?? []).length, 1);
  assert.ok(/<button type="button" class="link-button" id="resend">/.test(html) && /<button type="button" class="link-button" id="start-over">/.test(html));
  assert.ok(/<input id="forward-email" name="companion" type="email" inputmode="email" autocomplete="off"/.test(html), 'companion field is never autofilled with the holder email');
  for (const label of ['Pasajero/a', 'Destino', 'Salida', 'Regreso', 'Cubierto']) assert.ok(html.includes(label), label);
});

test('QR code: the hand-written encoder makes valid codes (structure checks)', async () => {
  const { qrMatrix } = await import('../public/qr.js');
  const url = 'https://wildpass.example.ts.net/poliza/' + 'A'.repeat(43) + '.pdf';
  const m = qrMatrix(url);
  const size = m.length;
  assert.equal(size, 41); // 89 bytes → version 6 at level M
  // Finder patterns in three corners (7×7 dark ring + 3×3 centre) and the timing pattern alternating.
  for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let i = 0; i < 7; i++) assert.ok(m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]);
    assert.ok(m[y + 3][x + 3] && !m[y + 1][x + 1]);
  }
  for (let i = 8; i < size - 8; i++) assert.equal(m[6][i], i % 2 === 0);
  assert.ok(m[size - 8][8], 'dark module');
  assert.throws(() => qrMatrix('x'.repeat(300)), /too long/);
});

test('landing: what-if scenarios and destination cards use the real limits and engine prices', async () => {
  const html = nbsp(await (await fetch(`${base}/`)).text());
  assert.ok(html.includes('Ejemplos orientativos. Consulta coberturas y exclusiones completas en las'));
  const plus = pricing.plans.wild_plus.coverage;
  for (const amount of [plus.medical_expenses_rest_of_world_eur, plus.baggage_theft_damage_eur, plus.cancellation_per_traveler_eur, plus.search_and_rescue_eur]) {
    assert.ok(html.includes(`data-to="${amount}"`), `figure ${amount}`);
  }
  assert.ok(html.includes('hasta 3.000 € por viajero') && html.includes('hasta 15.000 €'));
  // 15 situations: a category filter, one chip (tab) each and ONE card shown; the first is covered by BOTH plans.
  const filters = [...html.matchAll(/<button type="button" class="whatif-filter" data-cat="(\w+)" aria-pressed="(true|false)">([^<]+)</g)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(filters.map(f => f[2]), ['Todas', 'Salud', 'Equipaje', 'Aventura', 'Cancelación y viaje']);
  assert.deepEqual(filters.map(f => f[1]), ['true', 'false', 'false', 'false', 'false']);
  const tabs = [...html.matchAll(/role="tab" class="whatif-tab" id="wi-tab-(\w+)" data-cat="(\w+)"/g)];
  assert.equal(tabs.length, 15);
  for (const [, , cat] of tabs) assert.ok(filters.some(f => f[0] === cat), cat);
  const panels = [...html.matchAll(/<div class="whatif-panel" role="tabpanel" id="wi-panel-\w+"[^>]*>(.*?)<\/ul><\/div>/g)];
  assert.equal(panels.length, 15);
  assert.ok(!panels[0][0].includes(' hidden>') && panels.slice(1).every(p => p[0].includes(' hidden>')), 'only the first card shows');
  assert.equal((panels[0][1].match(/verdict is-ok/g) ?? []).length, 2, 'first situation covered by both plans');
  assert.ok(html.includes('Desliza para ver más situaciones') && !html.includes('id="whatif-strip"'));
  // 10 destination cards.
  assert.equal((html.match(/class="dest-card"/g) ?? []).length, 10);
  // "7 días desde X €" = Wild, 7 days, 1 adult, from the engine for that country's zone.
  for (const code of ['TH', 'IT', 'US', 'FR', 'MA', 'CA']) {
    const q = await call('get_quote', quoteInput({ destination_country: code, return_date: addDays(DEP, 6), traveler_ages: [35] }));
    const wild = q.plans.find(p => p.plan === 'wild').total_price_eur.toLocaleString('es-ES', { minimumFractionDigits: 2 });
    assert.ok(html.includes(`data-country="${code}"`) && html.includes(`7 días desde ${wild} €`), `${code} ${wild}`);
    const plus = q.plans.find(p => p.plan === 'wild_plus').total_price_eur.toLocaleString('es-ES', { minimumFractionDigits: 2 });
    assert.ok(html.includes(`Wild+ desde ${plus} €`), `${code} Wild+ ${plus}`);
  }
});

test('agents are welcome: robots.txt allows all, /llms.txt lists the 6 tools, the landing says so in its HTML, no user-agent gets 403', async () => {
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.equal(await robots.text(), 'User-agent: *\nAllow: /\n');
  const llms = await (await fetch(`${base}/llms.txt`)).text();
  assert.ok(llms.startsWith('# Seguros Wildpass') && llms.includes('Demo — no es un seguro real'));
  const order = ['get_quote', 'select_plan', 'set_traveler_details', 'review_order', 'confirm_payment', 'get_policy'].map((name, i) => llms.indexOf(`${i + 1}. ${name}:`));
  assert.ok(!order.includes(-1) && [...order].sort((a, b) => a - b).join() === order.join(), llms);
  assert.ok(llms.includes(`(${base}/agentes)`) && llms.includes('WebMCP'));
  const html = nbsp(await (await fetch(`${base}/`)).text());
  assert.ok(html.includes('<a href="/agentes">Ver cómo funciona<span class="arrow" aria-hidden="true">→</span></a>'));
  // Agents never type a card: said on /llms.txt, /agentes and in confirm_payment's description.
  const noCard = 'Los agentes no deben introducir datos de tarjeta. Usa las herramientas WebMCP: tras la confirmación explícita del usuario, confirm_payment completa el pago de prueba en el servidor.';
  assert.ok(llms.includes(noCard), 'llms.txt');
  assert.ok((await (await fetch(`${base}/agentes`)).text()).includes(noCard), '/agentes');
  const step3 = html.slice(html.indexOf('id="step-3"'), html.indexOf('id="step-4"'));
  // The payment step's own line for agents was removed from the page (owner's request): the rule lives in the three places above.
  assert.ok(!step3.includes('agent-pay-note') && !html.includes('¿Eres un asistente de IA?'), 'payment step has no agent line');
  const plans = Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name]));
  for (const payments of [{ provider: 'simulated' }, { provider: 'stripe_test' }]) {
    const pay = buildTools({ limits: pricing.limits, plans, brand: { name: 'Seguros Wildpass' }, payments }).find(t => t.name === 'confirm_payment');
    assert.match(pay.description, /AI agents must NOT enter card details .*confirm_payment completes the (test|simulated) payment on the server/);
  }
  for (const ua of ['ChatGPT-User/1.0', 'GPTBot/1.1', 'OAI-SearchBot/1.0', 'ClaudeBot/1.0', 'Claude-User/1.0', 'PerplexityBot/1.0', 'Google-Extended']) {
    for (const path of ['/', '/robots.txt', '/llms.txt', '/agentes']) {
      assert.equal((await fetch(`${base}${path}`, { headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${ua})` } })).status, 200, `${ua} ${path}`);
    }
  }
});

test('quote form helpers: destination aliases point at real, coverable countries; max travellers note; birth date hint', async () => {
  const { COUNTRY_CODES } = await import('../config/countries.js');
  const f = brand.texts.form;
  for (const [code, aliases] of Object.entries(f.destinationAliases)) {
    assert.ok(COUNTRY_CODES.includes(code) && code !== 'ES', `${code} is not a destination`);
    assert.ok(!pricing.destinationsNotCovered.includes(code), `${code} is not coverable`);
    assert.ok(aliases.length > 0);
  }
  for (const [code, alias] of [['US', 'EEUU'], ['US', 'USA'], ['US', 'Nueva York'], ['GB', 'UK'], ['GB', 'Inglaterra'], ['JP', 'Tokio']]) assert.ok(f.destinationAliases[code].includes(alias), alias);
  assert.ok(f.homeAliases.includes('España') && f.homeMessage === 'Este seguro es para viajes desde España al extranjero.');
  const html = nbsp(await (await fetch(`${base}/`)).text());
  assert.ok(html.includes(`<p class="field-help max-travelers" id="max-travelers" hidden>Máximo ${pricing.limits.maxTravelers} viajeros por póliza</p>`));
  assert.ok(html.includes('id="details-status" role="status"'));
  assert.equal(brand.texts.checkout.birthDateHint, 'Formato dd/mm/aaaa, por ejemplo 07/03/1990.');
});

test('/caso: hidden case page (noindex, only «Sobre esta demo» in the footer), 9 parts, roadmap, nothing left to fill in', async () => {
  const res = await fetch(`${base}/caso`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const html = nbsp(await res.text());
  assert.ok(html.includes('Demo — no es un seguro real'));
  const parts = ['El reto', 'Para quién', 'La propuesta', 'Marca', 'Distribución en la era de los agentes', 'Cómo mido', 'Experimentos en marcha', 'Hoja de ruta a 90 días', 'Con un equipo y un presupuesto reales'];
  const at = parts.map(p => html.indexOf(`-title">${p}</h2>`));
  assert.ok(!at.includes(-1) && [...at].sort((a, b) => a - b).join() === at.join(), 'all 9 parts, in order');
  assert.equal((html.match(/<li class="phase">/g) ?? []).length, 3);
  for (const when of ['Días 0–30', 'Días 30–60', 'Días 60–90']) assert.ok(html.includes(when), when);
  assert.ok(html.includes('href="/metricas"') && html.includes('<code>policy_forwarded</code>'));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!/COMPLETAR|DATO A VERIFICAR|mark class="todo"/.test(html), 'no placeholders left');
  assert.ok(html.includes('<a href="https://www.ine.es/dyngs/Prensa/ETR4T25.htm" rel="noopener">'));
  for (const step of ['KYC', 'residentes de otros países', 'JSON-LD', 'email_quote']) assert.ok(html.includes(step), step);
  assert.ok(html.includes('Los datos sensibles (tarjeta y DNI) los introduce siempre la persona, nunca el agente'));
  for (const thing of ['Render', 'Railway', 'Dominio propio', 'aseguradora real']) assert.ok(html.includes(thing), thing);
  for (const path of ['/', '/agentes', '/condiciones', '/caso']) {
    const page = await (await fetch(`${base}${path}`)).text();
    assert.ok(!page.includes('<li><a href="/caso">'), `not in the menu on ${path}`);
    assert.ok(page.includes('<a class="footer-quiet" href="/caso">Sobre esta demo</a>'), `footer on ${path}`);
    assert.ok(!page.includes('href="/metricas"') || path === '/caso', `/metricas only linked from /caso (${path})`);
  }
});
