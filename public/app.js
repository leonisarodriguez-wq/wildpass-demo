// Human website: the quote form on the landing and the 4-step checkout.
// It only collects input and shows results: every rule is checked on the server, through the SAME API
// the WebMCP tools use. Error texts are friendly versions (brand config `texts.errors`) of the server's codes.
import { callApi, loadConfig } from './api.js';
import { qrSvg } from './qr.js';
import { enhanceDestination, isHomeQuery } from './destination-picker.js';
import { track, sessionId } from './track.js';

const $ = sel => document.querySelector(sel);
// The destination field people see: the searchable box once it exists, else the plain <select>.
const destField = () => $('#destination-search') ?? $('#destination');
const destBlocked = () => $('#destination').selectedOptions[0]?.dataset.blocked === 'true';
// selected = the plan marked in step 1 (from "Elegir Wild/Wild+" on the landing, or a tap on a card); plan = the one ordered.
const state = { quote: null, plan: null, selected: null, preferredPlan: null, orderId: null, review: null, paid: null, step: 'landing' };
let T = {};      // brand texts
let C = {};      // checkout texts
let E = {};      // friendly error texts
let limits = {};
let payments = { provider: 'simulated' }; // or { provider: 'stripe_test', publishable_key }
const card = { stripe: null, elements: null }; // Stripe.js and the Payment Element of the current review

// ---------- small helpers ----------
const eur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always', minimumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
const dateEs = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
// Server texts (key conditions) contain YYYY-MM-DD dates: show them the Spanish way.
const datesEs = text => String(text).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
const travelersWord = n => (n === 1 ? C.travelerOne : C.travelerMany);
// "10–17 dic 2026", "30 oct – 12 nov 2026" or "28 dic 2026 – 5 ene 2027" (same style as the PDF).
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function rangeEs(fromIso, toIso) {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
}
// "35 años", "34 y 31 años", "40, 38 y 5 años", "menos de 1 año".
function agesText(ages) {
  const tc = C.tripCard;
  if (ages.length === 1 && ages[0] === 0) return tc.lessThanOneYear;
  if (ages.length === 1 && ages[0] === 1) return T.form.ageOne;
  const list = ages.length > 1 ? `${ages.slice(0, -1).join(', ')} ${tc.and} ${ages.at(-1)}` : String(ages[0]);
  return fill(tc.ages, { ages: list });
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v; // via CSSOM: a style="" attribute would be blocked by our CSP
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter(c => c != null && c !== false));
  return node;
}

// Today in Spain (YYYY-MM-DD), to set the earliest selectable dates.
const todayMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ---------- errors ----------
function friendly(result) {
  const template = E[result.error_code];
  if (!template) return result.message || E.generic;
  return fill(template, { ...limits, traveler: result.traveler, quotedAge: result.quoted_age, actualAge: result.age_at_departure, max: result.max_sends });
}

// ONE error component per field: the message right under its field (Ida/Vuelta: under the whole row), linked with
// aria-describedby + aria-invalid. It disappears as soon as the field is valid again (checked on input/change).
const errorSlot = field => field.closest('.field-row') ?? field.closest('.traveler-row, .field, .check') ?? field;
function setFieldError(field, message, action) {
  const id = `${field.id}-error`;
  let box = document.getElementById(id);
  const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(x => x && x !== id);
  if (!message) {
    box?.remove();
    field.removeAttribute('aria-invalid');
    if (described.length) field.setAttribute('aria-describedby', described.join(' ')); else field.removeAttribute('aria-describedby');
    return;
  }
  if (!box) {
    box = el('p', { class: 'field-error', id });
    // Both dates wrong: the Ida message comes first, like the fields.
    (field.id === 'return' && document.getElementById('departure-error')) ? $('#departure-error').after(box) : errorSlot(field).after(box);
  }
  box.replaceChildren(message, ...(action ? [' ', action] : []));
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', [id, ...described].join(' '));
}

// Checks every field of a form (validators: [field, () => message | null]), shows each error under its field in
// reading order and focuses the first one. Returns true when all are fine.
function validateAll(checks) {
  let first = null;
  for (const [field, check] of checks) {
    const message = check();
    setFieldError(field, message);
    if (message && !first) first = field;
  }
  first?.focus();
  return !first;
}

// While a field shows an error, re-check it on every change: the message goes away as soon as the field is valid.
function liveCheck(form, checksFor) {
  const recheck = e => {
    for (const [field, check] of checksFor()) {
      if (field === e.target && field.getAttribute('aria-invalid') === 'true' && !check()) setFieldError(field, null);
    }
  };
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);
}

// Messages that are not about one field (network, payment…): the scope's own box, wherever it sits inside it
// (step 3 keeps it in .pay-col). Each scope has exactly one (test/flow.test.js). Never throws: a missing box once
// stopped the success step from showing after a card payment.
function showError(scope, message, field) {
  if (field) { setFieldError(field, message); field.focus(); return; }
  const box = scope.querySelector('.error[role="alert"]');
  if (!box) { if (message) console.error('[Wildpass] no error box for:', message); return; }
  if (!message) { box.hidden = true; box.textContent = ''; return; }
  box.textContent = message;
  box.hidden = false;
}

// While a request runs, its button says so and the action bar's button waits too (no double sends).
async function busy(button, label, fn) {
  const original = button.textContent;
  const bar = $('#bar-action');
  button.disabled = true;
  bar.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = label;
  try { await fn(); } finally {
    button.disabled = false;
    bar.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = original;
    updateTotalBar();
  }
}

// ---------- views: landing ↔ checkout steps ----------
const STEPS = ['1', '2', '3', '4'];

function render(step, { push = true, focus = true } = {}) {
  state.step = step;
  const inCheckout = step !== 'landing';
  $('#landing').hidden = inCheckout;
  $('#checkout').hidden = !inCheckout;
  $('#trip-card').hidden = !inCheckout || step === '3' || step === '4'; // step 3 has its own summary card
  if (inCheckout && step !== '4') renderTripCard();
  for (const s of STEPS) $(`#step-${s}`).hidden = s !== step;
  if (push) history.pushState({ step }, '', inCheckout ? `#paso-${step}` : location.pathname);
  if (inCheckout) {
    $('#progress-text').textContent = fill(C.progress, { x: step });
    $('#progress-bar').setAttribute('aria-valuenow', step);
    $('#progress-fill').style.width = `${Number(step) * 25}%`;
    updateTotalBar();
    window.scrollTo(0, 0);
    if (focus) $(`#step-${step}-title`).focus();
  }
}

// Only allow going to a step whose data exists (e.g. after a page reload everything starts over).
function canShow(step) {
  return step === 'landing'
    || (step === '1' && state.quote)
    || (step === '2' && state.orderId && !state.paid)
    || (step === '3' && state.review && !state.paid)
    || (step === '4' && state.paid);
}

window.addEventListener('popstate', e => {
  const step = e.state?.step ?? 'landing';
  render(canShow(step) ? step : 'landing', { push: false });
});

// The fixed bar: total on the left, the step's action on the right. The button only triggers the step's own button
// or form, so both always do exactly the same thing.
function barAction() {
  const B = C.bar;
  const step = state.step;
  if (step === '1') {
    const p = state.selected && state.quote.plans.find(x => x.plan === state.selected);
    return p ? { text: fill(B.continueWith, { plan: p.plan_name }), run: button => choosePlan(p.plan, button) }
      : { text: B.pickPlan, run: () => { $('#compare').scrollIntoView({ behavior: smooth(), block: 'start' }); [...document.querySelectorAll('#compare button')].find(b => b.offsetParent)?.focus({ preventScroll: true }); } };
  }
  if (step === '2') return { text: B.continue, run: () => $('#details-form').requestSubmit() };
  if (step === '3') {
    return $('#pay').disabled
      ? { text: B.goToPay, run: () => { $('#accept-terms').scrollIntoView({ behavior: smooth(), block: 'center' }); $('#accept-terms').focus({ preventScroll: true }); } }
      : { text: fill(B.pay, { total: eur(state.review.total_eur) }), run: () => $('#pay').click() };
  }
  return null;
}
$('#bar-action').addEventListener('click', e => barAction()?.run(e.currentTarget));

function updateTotalBar() {
  const action = state.step !== 'landing' && barAction();
  $('#bar-action').hidden = !action;
  if (action && !$('#bar-action').disabled) $('#bar-action').textContent = action.text;
  const label = $('#total-label');
  const value = $('#total-value');
  if (state.paid) {
    label.textContent = state.paid.payment_ref ? C.totalPaidStripeLabel : C.totalPaidLabel;
    value.textContent = eur(state.review.total_eur);
  } else if (state.review && state.step === '3') {
    label.textContent = `${C.totalLabel} · ${state.review.summary.plan.plan_name}`;
    value.textContent = eur(state.review.total_eur);
  } else if (state.plan && state.step !== '1') {
    const p = state.quote.plans.find(x => x.plan === state.plan);
    label.textContent = `${C.totalLabel} · ${p.plan_name}`;
    value.textContent = eur(p.total_price_eur);
  } else if (state.quote && state.selected) {
    const p = state.quote.plans.find(x => x.plan === state.selected);
    label.textContent = `${C.totalLabel} · ${p.plan_name}`;
    value.textContent = eur(p.total_price_eur);
  } else if (state.quote) {
    // Step 1, no plan chosen yet: show the price range of the plans.
    const totals = state.quote.plans.map(p => p.total_price_eur);
    label.textContent = C.choosePlan;
    value.textContent = fill(C.priceRange, { min: eur(Math.min(...totals)), max: eur(Math.max(...totals)) });
  }
}

// ---------- landing: quote form ----------
// One row per traveller: "Viajero N" + age dropdown (the first row comes from the server; the others copy its options).
function ageInputs() { return [...document.querySelectorAll('#ages .age')]; }

function relabelAges() {
  [...document.querySelectorAll('#ages .traveler-row')].forEach((row, i) => {
    const n = i + 1;
    row.querySelector('label').textContent = fill(T.form.travelerRow, { n });
    row.querySelector('label').htmlFor = `age-${n}`;
    row.querySelector('select').id = `age-${n}`;
    row.querySelector('.remove-age')?.setAttribute('aria-label', fill(T.form.removeTravelerLabel, { n }));
  });
  const full = ageInputs().length >= limits.maxTravelers;
  $('#add-age').hidden = full;
  $('#max-travelers').hidden = !full;
}

function addTraveler() {
  const first = ageInputs()[0];
  // New travellers have no age yet: it has to be chosen (no silent default).
  const select = el('select', { class: 'age', name: 'age', 'aria-required': 'true' },
    el('option', { value: '', text: T.form.chooseAge, disabled: true, selected: true }),
    [...first.options].map(o => el('option', { value: o.value, text: o.textContent })));
  const remove = el('button', { type: 'button', class: 'remove-age', onclick: () => {
    row.remove();
    relabelAges();
    (ageInputs().at(-1) ?? $('#add-age')).focus();
  } });
  remove.append($('#remove-icon').content.cloneNode(true));
  const row = el('div', { class: 'traveler-row' }, el('label'), select, remove);
  remove.addEventListener('click', () => document.getElementById(`${select.id}-error`)?.remove());
  $('#ages').append(row);
  relabelAges();
  return select;
}

$('#add-age').addEventListener('click', () => addTraveler().focus());
// Convenience checks for the quote form (the server decides; these only spare a round trip).
// Trip length counts both days, like the server: the latest return is departure + (maxTripDays − 1).
const tripDaysOf = (dep, ret) => Math.round((Date.parse(ret) - Date.parse(dep)) / 86_400_000) + 1;
function quoteChecks() {
  const dep = $('#departure').value;
  const ret = $('#return').value;
  return [
    [destField(), () => (destBlocked() ? E.DESTINATION_NOT_COVERED : $('#destination').value ? null
      : isHomeQuery(destField().value, T.form) ? T.form.homeMessage : E.missingDestination)],
    [$('#departure'), () => (dep ? null : E.missingDeparture)],
    [$('#return'), () => (!ret ? E.missingReturn : dep && ret <= dep ? friendly({ error_code: 'RETURN_BEFORE_DEPARTURE' })
      : dep && tripDaysOf(dep, ret) > limits.maxTripDays ? friendly({ error_code: 'TRIP_TOO_LONG' }) : null)],
    ...ageInputs().map((a, i) => [a, () => (a.value === '' ? fill(E.missingAge, { n: i + 1 }) : null)]),
  ];
}
liveCheck($('#quote-form'), quoteChecks);
const checkOne = field => { const c = quoteChecks().find(([f]) => f === field); if (c) setFieldError(field, c[1]()); };

// Destinations with official "do not travel" advice: say so at once, right under the box (the quote is refused anyway).
$('#destination').addEventListener('change', () => {
  if (destBlocked() || destField().getAttribute('aria-invalid')) checkOne(destField());
  if ($('#destination').value) track('destination_selected'); // the "hero" experiment's metric
});

$('#departure').addEventListener('change', () => {
  const dep = $('#departure').value;
  if (!dep) return;
  $('#return').min = addDays(dep, 1);
  $('#return').max = addDays(dep, limits.maxTripDays - 1);
  if ($('#return').value && $('#return').value <= dep) $('#return').value = '';
  if ($('#return').value) checkOne($('#return'));
});
// Too long a trip: said at once, under the dates (the date picker also stops at the latest allowed return).
$('#return').addEventListener('change', () => { if ($('#return').value) checkOne($('#return')); });

$('#quote-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = $('#quote-form');
  const ages = ageInputs();
  if (!validateAll(quoteChecks())) return;

  await busy($('#quote-submit'), T.form.loading, async () => {
    const result = await callApi('get_quote', {
      origin_country: 'ES',
      destination_country: $('#destination').value,
      departure_date: $('#departure').value,
      return_date: $('#return').value,
      traveler_ages: ages.map(a => Number(a.value)),
    });
    if (!result.ok) {
      const fieldFor = {
        SAME_COUNTRY: '#destination-search', INVALID_COUNTRY: '#destination-search', DESTINATION_NOT_COVERED: '#destination-search',
        DEPARTURE_NOT_IN_FUTURE: '#departure', INVALID_DATE: '#departure',
        RETURN_BEFORE_DEPARTURE: '#return', TRIP_TOO_LONG: '#return',
      }[result.error_code];
      // For an age outside the limits, point at the first such age (limits come from the config).
      const badAge = result.error_code === 'INVALID_AGE' ? ages.find(a => Number(a.value) < limits.minAge || Number(a.value) > limits.maxAge) ?? ages[0] : null;
      return showError(form, friendly(result), badAge ?? (fieldFor && $(fieldFor)));
    }
    showError(form, null);
    for (const field of form.querySelectorAll('[aria-invalid="true"]')) setFieldError(field, null);
    Object.assign(state, { quote: result, plan: null, selected: state.preferredPlan, orderId: null, review: null, paid: null });
    renderStep1();
    render('1');
    track('quote_viewed');
  });
});

// «Probar con un ejemplo»: fills Tailandia, the example dates and two travellers, and calculates. If the form already has
// data, it asks first (inline, keyboard friendly); «No» keeps what was typed.
function formHasData() {
  const ages = ageInputs();
  return Boolean($('#destination').value || $('#departure').value || $('#return').value || ages.length > 1 || (ages[0] && Number(ages[0].value) !== T.form.defaultAge));
}
function fillExample() {
  const ex = T.form.example;
  $('#destination').value = ex.destination;
  $('#destination').dispatchEvent(new Event('change', { bubbles: true }));
  $('#departure').value = ex.departure;
  $('#departure').dispatchEvent(new Event('change', { bubbles: true }));
  $('#return').value = ex.return;
  $('#return').dispatchEvent(new Event('change', { bubbles: true }));
  while (ageInputs().length > ex.ages.length) $('#ages').lastElementChild.remove();
  relabelAges();
  while (ageInputs().length < ex.ages.length) addTraveler();
  ageInputs().forEach((select, i) => { select.value = String(ex.ages[i]); select.dispatchEvent(new Event('change', { bubbles: true })); });
  for (const field of $('#quote-form').querySelectorAll('[aria-invalid="true"]')) setFieldError(field, null);
  showError($('#quote-form'), null);
  track('example_used');
  $('#quote-form').requestSubmit();
}
function closeExampleAsk(focusButton) {
  $('#example-confirm').hidden = true;
  $('#example-fill').hidden = false;
  if (focusButton) $('#example-fill').focus();
}
$('#example-fill').addEventListener('click', () => {
  if (!formHasData()) return fillExample();
  $('#example-fill').hidden = true;
  $('#example-confirm').hidden = false;
  $('#example-yes').focus();
});
$('#example-yes').addEventListener('click', () => { closeExampleAsk(false); fillExample(); });
$('#example-no').addEventListener('click', () => closeExampleAsk(true));
$('#example-confirm').addEventListener('keydown', e => { if (e.key === 'Escape') closeExampleAsk(true); });

// "Ver mi precio" links (also the header's, and the links inside FAQ answers): go to the form and put the cursor in
// the first field. From the checkout, the landing comes back first.
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
document.addEventListener('click', e => {
  const link = e.target.closest('[data-focus-form]');
  if (!link) return;
  e.preventDefault();
  if (link.dataset.plan) state.preferredPlan = link.dataset.plan; // "Elegir Wild+": that plan comes preselected in step 1
  if (state.step !== 'landing') render('landing');
  $('#quote-form').scrollIntoView({ behavior: smooth(), block: 'center' });
  destField().focus({ preventScroll: true });
});

// ---------- FAQ: closed behind "Ver preguntas frecuentes"; the header link (#preguntas) opens it and goes there ----------
function setFaqOpen(open) {
  const button = $('#faq-toggle');
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? button.dataset.hide : button.dataset.show;
  $('#faq-list').hidden = !open;
}
$('#faq-toggle').addEventListener('click', () => setFaqOpen($('#faq-list').hidden));
function openFaq({ scroll = true } = {}) {
  if (state.step !== 'landing') render('landing');
  setFaqOpen(true);
  if (scroll) { $('#preguntas').scrollIntoView({ behavior: smooth(), block: 'start' }); $('#preguntas').focus({ preventScroll: true }); }
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-open-faq]')) return;
  e.preventDefault();
  openFaq();
});

// ---------- trip summary card (steps 1–3; the same card, plus the plan, on the success step) ----------
function tripLines(trip) {
  const n = trip.traveler_ages.length;
  return {
    destination: trip.destination_name,
    dates: `${rangeEs(trip.departure_date, trip.return_date)} · ${fill(C.tripCard.days, { days: trip.days })}`,
    travelers: `${n} ${travelersWord(n)} · ${agesText(trip.traveler_ages)}`,
  };
}
function renderTripCard() {
  const lines = tripLines(state.quote.trip);
  for (const key of ['destination', 'dates', 'travelers']) $(`#trip-${key}`).textContent = lines[key];
}
// Success screen = boarding pass: names, destination, dates, plan, policy number and a QR code (made in the browser,
// public/qr.js) that opens the policy PDF. The stamp animates in CSS; a short confetti burst runs once (never with reduced motion).
function renderDoneTrip() {
  const { trip, plan, travelers } = state.review.summary;
  const B = C.boarding;
  $('#done-names-label').textContent = travelers.length === 1 ? B.passenger : B.passengers;
  $('#done-names').replaceChildren(...travelers.map(t => el('span', { class: 'done-name', text: t.full_name })));
  $('#done-destination').textContent = trip.destination_name;
  $('#done-departure').textContent = dateEs(trip.departure_date);
  $('#done-return').textContent = dateEs(trip.return_date);
  $('#done-plan').textContent = plan.plan_name;
  // Always masked (*****678Z); without a DNI (agent purchases) the policy status says so.
  $('#done-holder-id').textContent = state.paid.holder_id_number_masked ?? state.paid.status_text;
  $('#policy-qr').innerHTML = qrSvg(state.paid.pdf_url, { label: B.qrLabel });
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('#confetti');
  const colours = ['--turquoise', '--night', '--mint', '--turquoise-text'];
  box.replaceChildren(...Array.from({ length: 36 }, (_, i) => {
    const piece = el('i');
    piece.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 520)}px`);
    piece.style.setProperty('--y', `${Math.round(-140 - Math.random() * 220)}px`);
    piece.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.setProperty('--d', `${(Math.random() * 0.25).toFixed(2)}s`);
    piece.style.background = `var(${colours[i % colours.length]})`;
    return piece;
  }));
  setTimeout(() => box.replaceChildren(), 2600);
}

// ---------- step 1: compare plans ----------
// Three separate plan cards (stacked below 960 px); CSS subgrid keeps each coverage row at the same height in both cards.
function renderStep1() {
  const q = state.quote;
  const n = q.trip.traveler_ages.length;
  const cmp = C.compare;
  $('#step-1-title').textContent = fill(C.step1Title, { destination: q.trip.destination_name });
  $('#step-1-line').textContent = fill(C.step1Line, { n, travelersWord: travelersWord(n) });

  const money = v => (v > 0 ? eur(v) : cmp.notIncluded);
  const highestTrek = Math.max(0, ...q.plans.map(p => p.adventure_sports_limits?.trekking_max_altitude_m ?? 0));
  const features = [
    [fill(cmp.medical, { zone: q.trip.zone_name }), p => eur(p.medical_limit_for_this_trip_eur)],
    [cmp.repatriation, p => p.coverage_limits_eur.repatriation],
    [cmp.baggage, p => money(p.coverage_limits_eur.baggage_theft_damage_eur)],
    [cmp.cancellation, p => (p.cancellation_included ? `${eur(p.coverage_limits_eur.cancellation_per_traveler_eur)} ${cmp.perTraveler}` : cmp.notIncluded)],
    [cmp.excess, p => eur(p.excess_per_medical_claim_eur)],
    [cmp.adventure, p => (p.adventure_sports_included ? fill(cmp.adventureYes, { rescue: eur(p.search_and_rescue_eur) }) : cmp.adventureNo)],
    // Trekking altitude: the hook of Wild Max (the highest one among the plans) is the Kilimanjaro.
    [cmp.trekking, p => {
      const m = p.adventure_sports_limits?.trekking_max_altitude_m;
      if (!m) return cmp.trekkingNo;
      const altitude = m.toLocaleString('es-ES', { useGrouping: 'always' });
      return fill(m >= highestTrek ? cmp.trekkingHook : cmp.trekkingUpTo, { altitude });
    }],
    [cmp.sportsEquipment, p => (p.coverage_limits_eur.sports_equipment_eur > 0 ? eur(p.coverage_limits_eur.sports_equipment_eur) : cmp.trekkingNo)],
    [cmp.interruption, p => (p.coverage_limits_eur.trip_interruption_per_traveler_eur > 0 ? `${eur(p.coverage_limits_eur.trip_interruption_per_traveler_eur)} ${cmp.perTraveler}` : cmp.notIncluded)],
  ];

  // The same two plan cards at every width: side by side from 600 px, one under the other (full width) on phones.
  // Experiment "upsell" (public/exp.js): A = only each plan's total; B = under the Wild+ price, what it costs on top of
  // Wild PER DAY, from this quote: (Wild+ − Wild) / trip days, always with cents ("+3,35 € al día por aventura y cancelación").
  const base = q.plans.find(p => p.plan === 'wild');
  const cents = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const difference = p => {
    if ((window.__wildpassExp?.upsell ?? 'a') !== 'b' || p.plan !== 'wild_plus' || !base) return null;
    const values = { perDay: cents(Math.round(((p.total_price_eur - base.total_price_eur) / q.trip.days) * 100) / 100), plan: base.plan_name };
    return el('p', { class: 'plan-diff' }, el('span', { 'aria-hidden': 'true', text: fill(cmp.upsellDaily, values) }), el('span', { class: 'sr-only', text: fill(cmp.upsellDailyLabel, values) }));
  };
  $('#compare').replaceChildren(el('div', { class: 'plan-compare' }, q.plans.map(p => {
    const featured = p.plan === 'wild_plus';
    const nameId = `plan-${p.plan}-name`;
    // Rows: name, price, one per coverage, button (the CSS subgrid needs the count).
    return el('article', { class: featured ? 'plan-option featured' : 'plan-option', 'data-plan-card': p.plan, 'aria-labelledby': nameId, style: `grid-row: span ${features.length + 3}`,
      onclick: e => { if (!e.target.closest('button')) markPlan(p.plan); } },
      featured && el('p', { class: 'badge', text: T.plans.wildPlusBadge }),
      el('h3', { id: nameId, text: p.plan_name }),
      el('div', { class: 'plan-price-box' }, el('p', { class: 'plan-price' }, el('span', { class: 'sr-only', text: `${cmp.price}: ` }), eur(p.total_price_eur)), difference(p)),
      el('dl', { style: `grid-row: span ${features.length}` }, features.map(([label, value]) => el('div', { class: 'feature' }, el('dt', { text: label }), el('dd', { text: value(p) })))),
      el('button', { type: 'button', class: featured ? 'primary' : 'secondary', text: fill(C.choose, { plan: p.plan_name }), onclick: e => choosePlan(p.plan, e.currentTarget) }),
    );
  })));

  // Exclusions, closed by default: common ones, then each plan's own (Wild: adventure sports; Wild+: its limits).
  const common = q.exclusions_all_plans;
  const groups = [
    [cmp.bothPlans, common],
    ...q.plans.map(p => [fill(p.adventure_sports_included ? cmp.limitsOf : cmp.onlyIn, { plan: p.plan_name }), p.exclusions.filter(x => !common.includes(x))]),
  ].filter(([, list]) => list.length);
  if (state.selected) markPlan(state.selected);
  $('#exclusions').replaceChildren(el('details', { class: 'exclusions' },
    el('summary', { text: cmp.exclusionsToggle }),
    groups.map(([title, list]) => el('div', { class: 'exclusion-group' }, el('h3', { text: title }), el('ul', {}, list.map(x => el('li', { text: x }))))),
  ));
}

// Step 1: the marked plan (a tap on its card, or "Elegir Wild+" on the landing). The bar shows its total and
// "Continuar con …"; the cards' own "Elegir" buttons still order straight away.
function markPlan(plan) {
  state.selected = plan;
  for (const card of document.querySelectorAll('#compare [data-plan-card]')) {
    const on = card.dataset.planCard === plan;
    card.classList.toggle('is-selected', on);
    card.querySelector('.selected-note')?.remove();
    if (on) card.querySelector('h3').append(el('span', { class: 'selected-note', text: ` · ${C.selectedPlan}` }));
  }
  updateTotalBar();
}

async function choosePlan(plan, button) {
  const step = $('#step-1');
  await busy(button, C.working, async () => {
    const result = await callApi('select_plan', { quote_id: state.quote.quote_id, plan });
    if (!result.ok) return showError(step, friendly(result));
    showError(step, null);
    track('plan_selected', { plan });
    Object.assign(state, { plan, orderId: result.order_id, review: null });
    renderStep2();
    render('2');
  });
}

// ---------- step 2: who travels ----------
// Birth dates are typed as dd/mm/aaaa (numeric keyboard) and sent to the server as YYYY-MM-DD.
function toIsoDate(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function formatBirthInput(e) {
  const input = e.target;
  if (!input.classList.contains('t-birth') || e.inputType?.startsWith('delete')) return;
  const d = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}

function renderStep2() {
  const previous = [...document.querySelectorAll('#travelers fieldset')].map(f => ({ name: f.querySelector('.t-name').value, birth: f.querySelector('.t-birth').value }));
  $('#travelers').replaceChildren(...state.quote.trip.traveler_ages.map((age, i) => {
    const nameId = `t-name-${i}`;
    const birthId = `t-birth-${i}`;
    const same = i === 0 && el('label', { class: 'check' },
      el('input', { type: 'checkbox', class: 'same-as-holder', onchange: e => { const n = $(`#${nameId}`); n.value = e.target.checked ? $('#ph-name').value : ''; n.readOnly = e.target.checked; } }),
      el('span', { text: C.sameAsPolicyholder }));
    return el('fieldset', { class: 'person' },
      el('legend', { text: fill(C.traveler, { n: i + 1, age }) }),
      same,
      el('div', { class: 'field' }, el('label', { for: nameId, text: C.fullName }), el('input', { id: nameId, class: 't-name', autocomplete: 'off', 'aria-required': 'true', value: previous[i]?.name ?? '' })),
      el('div', { class: 'field' }, el('label', { for: birthId, text: C.birthDate }),
        el('p', { class: 'hint field-hint', id: `${birthId}-hint`, text: C.birthDateHint }),
        el('input', { id: birthId, class: 't-birth', type: 'text', inputmode: 'numeric', placeholder: C.birthDatePlaceholder, maxlength: '10', autocomplete: 'off', 'aria-required': 'true', 'aria-describedby': `${birthId}-hint`, value: previous[i]?.birth ?? '' })),
    );
  }));
}

$('#ph-name').addEventListener('input', () => {
  const same = $('.same-as-holder');
  if (same?.checked) $('#t-name-0').value = $('#ph-name').value;
});
$('#travelers').addEventListener('input', formatBirthInput);

// Step 2 convenience checks, in reading order (empty or unreadable fields; the server checks everything else).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// DNI (8 numbers + letter) or NIE (X/Y/Z + 7 numbers + letter) with its mod-23 control letter. The server checks it again.
const ID_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
function idProblem(raw) {
  const value = raw.toUpperCase().replace(/[\s.-]/g, '');
  if (!value) return C.holderIdMissing;
  const m = /^(\d{8}|[XYZ]\d{7})([A-Z])$/.exec(value);
  if (!m) return T.form.idFormat;
  return ID_LETTERS[Number(m[1].replace(/^[XYZ]/, ch => String('XYZ'.indexOf(ch)))) % 23] === m[2] ? null : T.form.idLetter;
}
function detailChecks() {
  const name = input => [input, () => (input.value.trim() ? null : E.missingName)];
  const fieldsets = [...document.querySelectorAll('#travelers fieldset')];
  return [
    name($('#ph-name')),
    [$('#ph-email'), () => (EMAIL_SHAPE.test($('#ph-email').value.trim()) ? null : friendly({ error_code: 'INVALID_EMAIL' }))],
    [$('#ph-id'), () => idProblem($('#ph-id').value)],
    [$('#ph-resident'), () => ($('#ph-resident').checked ? null : C.notResident)],
    ...fieldsets.flatMap(f => {
      const birth = f.querySelector('.t-birth');
      return [name(f.querySelector('.t-name')), [birth, () => (toIsoDate(birth.value) ? null : E.missingBirthDate)]];
    }),
  ];
}
liveCheck($('#details-form'), detailChecks);

// "Actualizar a X años y recalcular": the birth date is right, the quoted age was not. New quote with that age,
// same plan, then back to this step with everything typed kept (the server prices it; nothing is decided here).
async function updateAgeAndRequote(index, age, button) {
  const q = state.quote.trip;
  const ages = q.traveler_ages.map((a, i) => (i === index ? age : a));
  await busy(button, C.working, async () => {
    const quote = await callApi('get_quote', { origin_country: 'ES', destination_country: q.destination_country, departure_date: q.departure_date, return_date: q.return_date, traveler_ages: ages });
    if (!quote.ok) return showError($('#details-form'), friendly(quote));
    const order = await callApi('select_plan', { quote_id: quote.quote_id, plan: state.plan });
    if (!order.ok) return showError($('#details-form'), friendly(order));
    Object.assign(state, { quote, orderId: order.order_id, review: null });
    const select = ageInputs()[index]; // keep the landing form in step with the new quote
    if (select) select.value = String(age);
    renderStep2();
    renderTripCard();
    updateTotalBar();
    const total = eur(quote.plans.find(p => p.plan === state.plan).total_price_eur);
    $('#details-status').textContent = fill(C.ageUpdated, { traveler: index + 1, age, total });
    $(`#t-birth-${index}`).focus();
  });
}

$('#details-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = $('#details-form');
  const names = [...document.querySelectorAll('#travelers .t-name')];
  const births = [...document.querySelectorAll('#travelers .t-birth')];
  $('#details-status').textContent = '';
  if (!validateAll(detailChecks())) return;

  await busy(e.submitter ?? form.querySelector('button[type=submit]'), C.working, async () => {
    const result = await callApi('set_traveler_details', {
      order_id: state.orderId,
      policyholder: { full_name: $('#ph-name').value, email: $('#ph-email').value.trim() },
      holder_id_number: $('#ph-id').value,
      travelers: names.map((n, i) => ({ full_name: n.value, birth_date: toIsoDate(births[i].value) })),
    });
    if (!result.ok) {
      if (result.error_code === 'INVALID_ID_NUMBER') return showError(form, result.reason === 'letter' ? T.form.idLetter : T.form.idFormat, $('#ph-id'));
      const field = { INVALID_EMAIL: $('#ph-email'), AGE_MISMATCH: births[(result.traveler ?? 1) - 1], INVALID_BIRTH_DATE: births[0] }[result.error_code];
      if (result.error_code === 'AGE_MISMATCH' && field && Number.isInteger(result.age_at_departure)) {
        const index = (result.traveler ?? 1) - 1;
        const fix = el('button', { type: 'button', class: 'link-button error-action', text: fill(C.updateAge, { age: result.age_at_departure }),
          onclick: ev => updateAgeAndRequote(index, result.age_at_departure, ev.currentTarget) });
        setFieldError(field, friendly(result), fix);
        return field.focus();
      }
      return showError(form, friendly(result), field);
    }
    track('details_completed');
    const review = await callApi('review_order', { order_id: state.orderId });
    if (!review.ok) return showError(form, friendly(review));
    track('review_viewed');
    showError(form, null);
    state.review = review;
    renderStep3();
    render('3');
  });
});

// ---------- step 3: review + payment (Stripe test mode, or simulated when Stripe is off) ----------
// Compact: one summary card (trip, dates, plan, who buys + "Editar"), the price zone, the travellers on one line,
// three key chips, two closed lists ("Todas las coberturas", "Qué no cubre") and the total; then the payment.
function renderStep3() {
  const r = state.review;
  const s = r.summary;
  const plan = s.plan;
  const K = C.chips;
  // value = text, or a list of lines (one per line, e.g. name / email / DNI).
  const row = (label, value) => el('div', { class: 'row' }, el('dt', { text: label }),
    Array.isArray(value) ? el('dd', { class: 'lines' }, ...value.map(line => el('span', { text: line }))) : el('dd', { text: value }));
  const chips = [
    fill(K.medical, { amount: eur(plan.medical_limit_for_this_trip_eur) }),
    plan.excess_per_medical_claim_eur > 0 ? fill(K.excess, { amount: eur(plan.excess_per_medical_claim_eur) }) : K.noExcess,
    plan.adventure_sports_included ? K.adventure
      : plan.cancellation_included ? fill(K.cancellation, { amount: eur(plan.coverage_limits_eur.cancellation_per_traveler_eur) }) : K.noCancellation,
  ];
  const folded = (title, items, extra) => el('details', { class: 'review-more' }, el('summary', { text: title }),
    el('ul', {}, items.map(x => el('li', { text: x }))), extra);
  $('#review').replaceChildren(el('section', { class: 'summary review-card', 'aria-labelledby': 'review-title' },
    el('div', { class: 'review-head' },
      el('h3', { id: 'review-title', text: C.reviewTitle }),
      el('button', { type: 'button', class: 'link-button', text: C.editReview, 'aria-label': C.editReviewLabel, onclick: () => render('2') })),
    el('dl', {},
      row(C.trip, `${s.trip.origin_name} → ${s.trip.destination_name}`),
      row(C.dates, `${rangeEs(s.trip.departure_date, s.trip.return_date)} · ${fill(C.tripCard.days, { days: s.trip.days })}`),
      row(C.plan, plan.plan_name),
      row(C.whoBuys, [s.policyholder.full_name, s.policyholder.email, s.policyholder.id_number_masked && fill(C.holderIdShort, { id: s.policyholder.id_number_masked })].filter(Boolean)),
      row(C.travelers, s.travelers.map(t => `${t.full_name} (${t.age_at_departure})`).join(' · ')),
    ),
    el('p', { class: 'review-zone', text: fill(C.zone, { zone: s.trip.zone_name }) }),
    el('ul', { class: 'chips' }, chips.map(c => el('li', { class: 'chip', text: c }))),
    folded(C.allCoverage, [...plan.coverage_summary, ...r.key_conditions.map(datesEs)],
      el('p', {}, el('a', { href: r.terms_url, target: '_blank', rel: 'noopener', text: C.terms }))),
    folded(C.notCovered, s.exclusions),
    el('div', { class: 'total-row' }, el('span', { text: C.totalLabel }), el('strong', { text: eur(r.total_eur) })),
  ));
  $('#accept-terms').checked = false;
  syncPay();
  const stripeOn = payments.provider === 'stripe_test';
  $('#pay').textContent = fill(stripeOn ? C.payStripe : C.pay, { total: eur(r.total_eur) });
  $('#card-payment').hidden = !stripeOn;
  $('#pay-note').hidden = stripeOn;
  if (stripeOn) mountCard(r.total_eur);
}

// "Pagar" stays disabled until the terms box is ticked.
// Under the disabled button: "Acepta las condiciones para pagar". The bar's button follows ("Ir al pago" → "Pagar X €").
function syncPay() {
  $('#pay').disabled = !$('#accept-terms').checked;
  $('#pay-hint').hidden = !$('#pay').disabled;
  updateTotalBar();
}
$('#accept-terms').addEventListener('change', syncPay);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = el('script', { src });
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

// Stripe Appearance API: our font and colours inside Stripe's card frame (brand.css values).
// Inter comes from Google Fonts INSIDE Stripe's frame (cssSrc); our own pages still never call Google.
// gridRowSpacing leaves room under each field so a (two-line) error message never overlaps the next label.
const STRIPE_FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap' }];
function stripeAppearance() {
  const v = name => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return {
    theme: 'stripe',
    variables: {
      fontFamily: 'Inter, system-ui, sans-serif', fontSizeBase: '16px',
      colorText: v('night'), colorTextSecondary: v('secondary'), colorPrimary: v('turquoise'), colorDanger: v('red'), colorBackground: v('white'),
      borderRadius: '10px', gridRowSpacing: '20px', gridColumnSpacing: '12px',
    },
    rules: {
      '.Label': { fontWeight: '700', color: v('night'), marginBottom: '6px' },
      '.Input': { border: `1.5px solid ${v('field-border')}`, boxShadow: 'none', padding: '12px' },
      '.Input:focus': { borderColor: v('turquoise'), boxShadow: `0 0 0 1px ${v('turquoise')}` },
      '.Input--invalid': { borderColor: v('red'), boxShadow: `0 0 0 1px ${v('red')}`, color: v('night') },
      '.Error': { color: v('red'), fontSize: '14px', lineHeight: '1.4', marginTop: '6px' },
    },
  };
}

// The Stripe Payment Element (cards only). Card data goes from Stripe's own frame straight to Stripe.
async function mountCard(totalEur) {
  card.elements = null;
  try {
    if (!window.Stripe) await loadScript('https://js.stripe.com/v3/');
    card.stripe ??= window.Stripe(payments.publishable_key, { locale: 'es' });
    const elements = card.stripe.elements({ mode: 'payment', amount: Math.round(totalEur * 100), currency: 'eur', allowedPaymentMethodTypes: ['card'], appearance: stripeAppearance(), fonts: STRIPE_FONTS });
    $('#payment-element').replaceChildren();
    elements.create('payment', { layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never', link: 'never' } }).mount('#payment-element');
    card.elements = elements;
  } catch {
    $('#payment-element').replaceChildren(el('p', { class: 'form-note', text: E.stripeLoadError }));
  }
}

// Friendly Spanish text for a Stripe card error (declined test cards, wrong CVC…).
function cardMessage(error) {
  return E.card[error.decline_code] ?? E.card[error.code] ?? (error.type === 'card_error' ? E.card.card_declined : error.message || E.generic);
}

// 1) Stripe checks the card form, 2) our server runs every check and prepares the payment,
// 3) Stripe.js confirms the card with Stripe, 4) our server asks Stripe whether it succeeded and issues the policy.
async function payWithCard(confirmation) {
  if (!card.elements) return { ok: false, friendlyText: E.stripeLoadError };
  const { error: invalid } = await card.elements.submit();
  if (invalid) return { ok: false, friendlyText: cardMessage(invalid) };
  const start = await callApi('start_card_payment', confirmation);
  if (!start.ok) return start;
  if (start.status !== 'succeeded') {
    const { error } = await card.stripe.confirmPayment({ elements: card.elements, clientSecret: start.client_secret, confirmParams: { return_url: location.href }, redirect: 'if_required' });
    if (error) return { ok: false, friendlyText: cardMessage(error) };
  }
  return callApi('finish_card_payment', { ...confirmation, payment_intent_id: start.payment_intent_id });
}

$('#pay').addEventListener('click', async e => {
  const step = $('#step-3');
  const stripeOn = payments.provider === 'stripe_test';
  await busy(e.currentTarget, stripeOn ? C.processing : C.working, async () => {
    // Pressing "Pagar" after seeing the full summary is the person's explicit confirmation.
    const confirmation = {
      order_id: state.orderId,
      review_token: state.review.review_token,
      accept_terms: $('#accept-terms').checked,
      confirmed_total_eur: state.review.total_eur,
      user_confirmed: true,
    };
    track('payment_started', { plan: state.plan });
    const result = stripeOn ? await payWithCard(confirmation) : await callApi('confirm_payment', confirmation);
    if (!result.ok) return showError(step, result.friendlyText ?? friendly(result), result.error_code === 'TERMS_NOT_ACCEPTED' ? $('#accept-terms') : null);
    showError(step, null);
    track('policy_issued', { plan: state.plan });
    state.paid = result;
    $('#policy-number').textContent = result.policy_number;
    $('#pdf-link').href = result.pdf_url;
    $('#email-line').textContent = result.email_status === 'not_configured'
      ? C.emailNotConfigured
      : fill(C.emailSent, { email: state.review.summary.policyholder.email });
    renderDoneTrip();
    renderAfterActions();
    // The review and order can't be reused after payment: going back starts a new quote.
    history.replaceState({ step: 'landing' }, '', location.pathname);
    render('4');
    confetti();
  });
  syncPay();
});

// ---------- success step: resend the email, forward it to a travel companion ----------
// Only for the policy just bought in this tab: the server checks the private manage_token from the payment answer.
// At most 5 sends per policy (the server counts them); each copy shows its real Brevo delivery status.
const A = () => C.after;
const sendAuth = () => ({ policy_number: state.paid.policy_number, manage_token: state.paid.manage_token });
let sendPoll = [];
let sendsBlocked = false; // email off, or the 5 sends used: both buttons stay disabled
const syncSendButtons = () => { for (const b of [$('#resend'), $('#forward-send')]) b.disabled = sendsBlocked; };

function renderAfterActions() {
  const n = state.review.summary.travelers.length;
  $('#forward-title').textContent = n > 1 ? fill(n === 2 ? A().forwardHighlight : A().forwardHighlightMany, { n }) : A().forwardTitle;
  for (const id of ['#resend-status', '#forward-status']) $(id).textContent = '';
  $('#resend').hidden = false;
  // Policy issued without DNI/NIE («DNI pendiente»): the person completes it with the one-time link.
  $('#complete-id-line').hidden = !state.paid.complete_id_url;
  if (state.paid.complete_id_url) $('#complete-id-link').href = state.paid.complete_id_url;
  $('#forward-email').value = '';
  setFieldError($('#forward-email'), null);
  showError($('#forward-form'), null);
  $('#send-list').replaceChildren();
  $('#send-log').hidden = true;
  sendsBlocked = state.paid.email_status === 'not_configured';
  syncSendButtons();
  sendPoll.forEach(clearTimeout);
}

const sendsLeftText = n => (n === 1 ? A().sendsLeftOne : fill(A().sendsLeft, { n }));
function afterSend(result, statusEl, doneText) {
  if (!result.ok) {
    statusEl.textContent = '';
    if (result.error_code === 'SEND_LIMIT_REACHED') sendsBlocked = true;
    return false;
  }
  // The one-line resend result stays short; the forward card also says how many sends are left.
  statusEl.textContent = statusEl.id === 'resend-status' ? fill(doneText, { email: result.to_masked }) : `${fill(doneText, { email: result.to_masked })} ${sendsLeftText(result.sends_left)}`;
  if (result.sends_left === 0) sendsBlocked = true;
  // Brevo reports delivery a few seconds later: ask again a few times.
  sendPoll.forEach(clearTimeout);
  sendPoll = [3000, 12000, 30000, 70000].map(ms => setTimeout(refreshSends, ms));
  refreshSends();
  return true;
}

async function refreshSends() {
  if (!state.paid?.manage_token) return;
  const result = await callApi('policy_sends', sendAuth());
  if (!result.ok || state.step !== '4') return;
  $('#send-log').hidden = result.sends.length === 0;
  $('#send-list').replaceChildren(...result.sends.map(s => el('li', {},
    el('span', { class: 'send-kind', text: s.kind === 'resend' ? A().resendKind : A().forwardKind }),
    el('span', { class: 'send-to', text: s.to_masked }),
    el('span', { class: `send-state is-${s.delivery.status}`, text: A().delivery[s.delivery.status] ?? s.delivery.status }))));
}

$('#resend').addEventListener('click', async e => {
  await busy(e.currentTarget, C.working, async () => {
    const result = await callApi('send_policy_copy', { ...sendAuth(), kind: 'resend' });
    showError($('#forward-form'), null);
    // The result takes the link's place on the same line, so nothing below moves.
    if (!afterSend(result, $('#resend-status'), A().resent)) $('#resend-status').textContent = friendly(result);
    else track('policy_resent');
    $('#resend').hidden = true;
  });
  syncSendButtons();
});

$('#forward-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#forward-email');
  const holder = state.review.summary.policyholder.email.toLowerCase();
  const check = () => (!input.value.trim() ? A().missingEmail
    : !EMAIL_SHAPE.test(input.value.trim()) ? friendly({ error_code: 'INVALID_EMAIL' })
      : input.value.trim().toLowerCase() === holder ? A().forwardSelf : null);
  if (!validateAll([[input, check]])) return;
  await busy($('#forward-send'), C.working, async () => {
    const result = await callApi('send_policy_copy', { ...sendAuth(), kind: 'forward', to_email: input.value.trim() });
    if (!result.ok) return showError($('#forward-form'), friendly(result), ['INVALID_EMAIL', 'FORWARD_TO_SELF'].includes(result.error_code) ? input : null);
    showError($('#forward-form'), null);
    afterSend(result, $('#forward-status'), A().forwarded);
    track('policy_forwarded');
    input.value = ''; // one address at a time: ready for the next one
  });
  syncSendButtons();
});
liveCheck($('#forward-form'), () => [[$('#forward-email'), () => (EMAIL_SHAPE.test($('#forward-email').value.trim()) ? null : A().missingEmail)]]);

// ---------- contact form (FAQ) ----------
// Sent to /api/contact; the server validates again, limits per session and never shows the owner's address.
const contactForm = $('#contact-form');
if (contactForm) {
  const K = () => T.contact;
  const f = id => $(`#contact-${id}`);
  const checks = () => [
    [f('name'), () => (f('name').value.trim().length >= 2 ? null : K().missingName)],
    [f('email'), () => (!f('email').value.trim() ? K().missingEmail : EMAIL_SHAPE.test(f('email').value.trim()) ? null : E.INVALID_EMAIL)],
    [f('message'), () => (f('message').value.trim().length >= 2 ? null : K().missingMessage)],
    [f('consent'), () => (f('consent').checked ? null : K().missingConsent)],
  ];
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    $('#contact-status').textContent = '';
    if (!validateAll(checks())) return;
    await busy($('#contact-send'), K().sending, async () => {
      const result = await callApi('contact', {
        name: f('name').value, email: f('email').value.trim(), message: f('message').value,
        consent: f('consent').checked, website: f('website').value, session_id: sessionId(),
      });
      if (!result.ok) return showError(contactForm, friendly(result));
      showError(contactForm, null);
      $('#contact-status').textContent = fill(K().sent, { email: f('email').value.trim() });
      f('message').value = '';
    });
  });
  liveCheck(contactForm, checks);
}

// ---------- navigation ----------
for (const b of document.querySelectorAll('[data-go]')) {
  b.addEventListener('click', () => {
    const step = b.dataset.go;
    if (step === 'landing') {
      render('landing');
      $('#quote-form').scrollIntoView({ block: 'center' });
      destField().focus({ preventScroll: true });
    } else render(step);
  });
}

$('#start-over').addEventListener('click', () => {
  Object.assign(state, { quote: null, plan: null, orderId: null, review: null, paid: null });
  $('#details-form').reset();
  render('landing');
  window.scrollTo(0, 0);
  destField().focus({ preventScroll: true });
});

// ---------- start ----------
async function init() {
  const tomorrow = addDays(todayMadrid(), 1);
  $('#departure').min = tomorrow;
  $('#return').min = addDays(tomorrow, 1);
  const config = await loadConfig();
  T = config.brand.texts;
  C = T.checkout;
  E = T.errors;
  limits = config.limits;
  payments = config.payments ?? payments;
  relabelAges();
  enhanceDestination($('#destination'), T.form);
  track('page_view', { page: '/' });
  // A reload in the middle of the checkout starts again from the landing (nothing is stored in the browser).
  if (location.hash.startsWith('#paso-')) history.replaceState({ step: 'landing' }, '', location.pathname);
  history.replaceState({ step: 'landing' }, '', location.pathname + location.hash);
  if (location.hash === '#preguntas') openFaq(); // the header link from another page
}

init().catch(() => showError($('#quote-form'), 'No hemos podido cargar la página. Recarga para intentarlo de nuevo.'));
