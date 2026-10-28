// Human website: the quote form on the landing and the 4-step checkout.
// It only collects input and shows results: every rule is checked on the server, through the SAME API
// the WebMCP tools use. Error texts are friendly versions (brand config `texts.errors`) of the server's codes.
import { callApi, loadConfig } from './api.js';

const $ = sel => document.querySelector(sel);
const state = { quote: null, plan: null, orderId: null, review: null, paid: null, step: 'landing' };
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
  return fill(template, { ...limits, traveler: result.traveler, quotedAge: result.quoted_age, actualAge: result.age_at_departure });
}

// Shows a message in the box of `scope` and marks/focuses the field it is about (if any).
function showError(scope, message, field) {
  const box = scope.querySelector('.error');
  for (const f of scope.querySelectorAll('[aria-invalid]')) { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-errormessage'); }
  if (!message) { box.hidden = true; box.textContent = ''; return; }
  box.id ||= `${scope.id || 'form'}-error`;
  box.textContent = message;
  box.hidden = false;
  // Show the message right below the field it is about (so it's on screen), else in its usual place.
  if (!box.home) { box.home = document.createComment('error'); box.before(box.home); }
  if (field) (field.closest('.field, .check') ?? field).after(box); else box.home.after(box);
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-errormessage', box.id);
    field.focus();
  }
}

async function busy(button, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = label;
  try { await fn(); } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = original;
  }
}

// ---------- views: landing ↔ checkout steps ----------
const STEPS = ['1', '2', '3', '4'];

function render(step, { push = true, focus = true } = {}) {
  state.step = step;
  const inCheckout = step !== 'landing';
  $('#landing').hidden = inCheckout;
  $('#checkout').hidden = !inCheckout;
  $('#trip-card').hidden = !inCheckout || step === '4';
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

function updateTotalBar() {
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
  $('#add-age').hidden = ageInputs().length >= limits.maxTravelers;
}

function addTraveler() {
  const first = ageInputs()[0];
  const select = el('select', { class: 'age', name: 'age' }, [...first.options].map(o => el('option', { value: o.value, text: o.textContent })));
  select.value = String(T.form.defaultAge);
  const remove = el('button', { type: 'button', class: 'remove-age', onclick: () => {
    row.remove();
    relabelAges();
    (ageInputs().at(-1) ?? $('#add-age')).focus();
  } });
  remove.append($('#remove-icon').content.cloneNode(true));
  const row = el('div', { class: 'traveler-row' }, el('label'), select, remove);
  $('#ages').append(row);
  relabelAges();
  return select;
}

$('#add-age').addEventListener('click', () => addTraveler().focus());
$('#departure').addEventListener('change', () => {
  const dep = $('#departure').value;
  if (!dep) return;
  $('#return').min = addDays(dep, 1);
  if ($('#return').value && $('#return').value <= dep) $('#return').value = '';
});

$('#quote-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = $('#quote-form');
  const ages = ageInputs();
  // Convenience checks only (empty fields). Every real rule is decided by the server.
  if (!$('#destination').value) return showError(form, E.missingDestination, $('#destination'));
  if (!$('#departure').value) return showError(form, E.missingDates, $('#departure'));
  if (!$('#return').value) return showError(form, E.missingDates, $('#return'));

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
        SAME_COUNTRY: '#destination', INVALID_COUNTRY: '#destination',
        DEPARTURE_NOT_IN_FUTURE: '#departure', INVALID_DATE: '#departure',
        RETURN_BEFORE_DEPARTURE: '#return', TRIP_TOO_LONG: '#return',
        INVALID_TRAVELER_COUNT: '#add-age',
      }[result.error_code];
      // For an age outside the limits, point at the first such age (limits come from the config).
      const badAge = result.error_code === 'INVALID_AGE' ? ages.find(a => Number(a.value) < limits.minAge || Number(a.value) > limits.maxAge) ?? ages[0] : null;
      return showError(form, friendly(result), badAge ?? (fieldFor && $(fieldFor)));
    }
    showError(form, null);
    Object.assign(state, { quote: result, plan: null, orderId: null, review: null, paid: null });
    renderStep1();
    render('1');
  });
});

// "Ver mi precio" links: go to the form and put the cursor in the first field.
for (const link of document.querySelectorAll('[data-focus-form]')) {
  link.addEventListener('click', e => {
    e.preventDefault();
    $('#quote-form').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    $('#destination').focus({ preventScroll: true });
  });
}

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
function renderDoneTrip() {
  const lines = tripLines(state.review.summary.trip);
  for (const key of ['destination', 'dates', 'travelers']) $(`#done-${key}`).textContent = lines[key];
  $('#done-plan').textContent = state.review.summary.plan.plan_name;
}

// ---------- step 1: compare plans ----------
// Two separate plan cards; CSS subgrid keeps each coverage row at the same height in both cards.
function renderStep1() {
  const q = state.quote;
  const n = q.trip.traveler_ages.length;
  const cmp = C.compare;
  $('#step-1-title').textContent = fill(C.step1Title, { destination: q.trip.destination_name });
  $('#step-1-line').textContent = fill(C.step1Line, { n, travelersWord: travelersWord(n) });

  const money = v => (v > 0 ? eur(v) : cmp.notIncluded);
  const features = [
    [fill(cmp.medical, { zone: q.trip.zone_name }), p => eur(p.medical_limit_for_this_trip_eur)],
    [cmp.repatriation, p => p.coverage_limits_eur.repatriation],
    [cmp.baggage, p => money(p.coverage_limits_eur.baggage_theft_damage_eur)],
    [cmp.cancellation, p => (p.cancellation_included ? `${eur(p.coverage_limits_eur.cancellation_per_traveler_eur)} ${cmp.perTraveler}` : cmp.notIncluded)],
    [cmp.excess, p => eur(p.excess_per_medical_claim_eur)],
    [cmp.adventure, p => (p.adventure_sports_included ? fill(cmp.adventureYes, { rescue: eur(p.search_and_rescue_eur) }) : cmp.adventureNo)],
  ];

  $('#compare').replaceChildren(el('div', { class: 'plan-compare' }, q.plans.map(p => {
    const featured = p.plan === 'wild_plus';
    const nameId = `plan-${p.plan}-name`;
    // Rows: name, price, one per coverage, button (the CSS subgrid needs the count).
    return el('article', { class: featured ? 'plan-option featured' : 'plan-option', 'aria-labelledby': nameId, style: `grid-row: span ${features.length + 3}` },
      featured && el('p', { class: 'badge', text: T.plans.wildPlusBadge }),
      el('h3', { id: nameId, text: p.plan_name }),
      el('p', { class: 'plan-price' }, el('span', { class: 'sr-only', text: `${cmp.price}: ` }), eur(p.total_price_eur)),
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
  $('#exclusions').replaceChildren(el('details', { class: 'exclusions' },
    el('summary', { text: cmp.exclusionsToggle }),
    groups.map(([title, list]) => el('div', { class: 'exclusion-group' }, el('h3', { text: title }), el('ul', {}, list.map(x => el('li', { text: x }))))),
  ));
}

async function choosePlan(plan, button) {
  const step = $('#step-1');
  await busy(button, C.working, async () => {
    const result = await callApi('select_plan', { quote_id: state.quote.quote_id, plan });
    if (!result.ok) return showError(step, friendly(result));
    showError(step, null);
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
        el('input', { id: birthId, class: 't-birth', type: 'text', inputmode: 'numeric', placeholder: C.birthDatePlaceholder, maxlength: '10', autocomplete: 'off', 'aria-required': 'true', value: previous[i]?.birth ?? '' })),
    );
  }));
}

$('#ph-name').addEventListener('input', () => {
  const same = $('.same-as-holder');
  if (same?.checked) $('#t-name-0').value = $('#ph-name').value;
});
$('#travelers').addEventListener('input', formatBirthInput);

$('#details-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = $('#details-form');
  const names = [...document.querySelectorAll('#travelers .t-name')];
  const births = [...document.querySelectorAll('#travelers .t-birth')];
  // Convenience checks only (empty or unreadable fields); the server checks everything else.
  for (const input of [$('#ph-name'), ...names]) if (!input.value.trim()) return showError(form, E.missingName, input);
  if (!$('#ph-email').value.trim()) return showError(form, friendly({ error_code: 'INVALID_EMAIL' }), $('#ph-email'));
  const badBirth = births.find(b => !toIsoDate(b.value));
  if (badBirth) return showError(form, E.missingBirthDate, badBirth);

  await busy(e.submitter ?? form.querySelector('button[type=submit]'), C.working, async () => {
    const result = await callApi('set_traveler_details', {
      order_id: state.orderId,
      policyholder: { full_name: $('#ph-name').value, email: $('#ph-email').value.trim() },
      travelers: names.map((n, i) => ({ full_name: n.value, birth_date: toIsoDate(births[i].value) })),
    });
    if (!result.ok) {
      const field = { INVALID_EMAIL: $('#ph-email'), AGE_MISMATCH: births[(result.traveler ?? 1) - 1], INVALID_BIRTH_DATE: births[0] }[result.error_code];
      return showError(form, friendly(result), field);
    }
    const review = await callApi('review_order', { order_id: state.orderId });
    if (!review.ok) return showError(form, friendly(review));
    showError(form, null);
    state.review = review;
    renderStep3();
    render('3');
  });
});

// ---------- step 3: review + payment (Stripe test mode, or simulated when Stripe is off) ----------
function renderStep3() {
  const r = state.review;
  const s = r.summary;
  const row = (label, value) => el('div', { class: 'row' }, el('dt', { text: label }), el('dd', { text: value }));
  $('#review').replaceChildren(el('div', { class: 'summary' },
    el('dl', {},
      row(C.trip, `${s.trip.origin_name} → ${s.trip.destination_name} (${s.trip.zone_name})`),
      row(C.dates, fill(C.tripLine, { from: dateEs(s.trip.departure_date), to: dateEs(s.trip.return_date), days: s.trip.days, n: s.travelers.length, travelersWord: travelersWord(s.travelers.length) })),
      row(C.plan, s.plan.plan_name),
      row(C.whoBuys, `${s.policyholder.full_name} · ${s.policyholder.email}`),
    ),
    el('h3', { text: C.travelers }),
    el('table', { class: 'people' },
      el('tbody', {}, s.travelers.map(t => el('tr', {},
        el('td', { text: t.full_name }),
        el('td', { text: `${dateEs(t.birth_date)} · ${fill(C.ageYears, { age: t.age_at_departure })}` }),
        el('td', { class: 'num', text: eur(t.price_eur) }))))),
    el('h3', { text: C.keyConditions }),
    el('ul', {}, r.key_conditions.map(c => el('li', { text: datesEs(c) }))),
    el('h3', { text: C.coverage }),
    el('ul', {}, s.plan.coverage_summary.map(c => el('li', { text: c }))),
    el('h3', { text: C.exclusions }),
    el('ul', {}, s.exclusions.map(x => el('li', { text: x }))),
    el('p', {}, el('a', { href: r.terms_url, target: '_blank', rel: 'noopener', text: C.terms })),
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
function syncPay() { $('#pay').disabled = !$('#accept-terms').checked; }
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
      '.Input': { border: `1.5px solid ${v('border')}`, boxShadow: 'none', padding: '12px' },
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
    const result = stripeOn ? await payWithCard(confirmation) : await callApi('confirm_payment', confirmation);
    if (!result.ok) return showError(step, result.friendlyText ?? friendly(result), result.error_code === 'TERMS_NOT_ACCEPTED' ? $('#accept-terms') : null);
    showError(step, null);
    state.paid = result;
    $('#policy-number').textContent = result.policy_number;
    $('#pdf-link').href = result.pdf_url;
    $('#email-line').textContent = result.email_status === 'not_configured'
      ? C.emailNotConfigured
      : fill(C.emailSent, { email: state.review.summary.policyholder.email });
    $('#payment-line').textContent = result.payment_text ?? '';
    renderDoneTrip();
    // The review and order can't be reused after payment: going back starts a new quote.
    history.replaceState({ step: 'landing' }, '', location.pathname);
    render('4');
  });
  syncPay();
});

// ---------- AI block: copy the example prompt ----------
$('#copy-prompt').addEventListener('click', async e => {
  const button = e.currentTarget;
  const text = $('#example-prompt').textContent.trim();
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch {
    // Older browsers / no permission: select the text so the person can copy it by hand.
    getSelection().selectAllChildren($('#example-prompt'));
  }
  if (!copied) return;
  button.textContent = T.ai.copied;
  $('#copy-status').textContent = T.ai.copied;
  clearTimeout(button.reset);
  button.reset = setTimeout(() => { button.textContent = T.ai.copy; $('#copy-status').textContent = ''; }, 2000);
});

// ---------- navigation ----------
for (const b of document.querySelectorAll('[data-go]')) {
  b.addEventListener('click', () => {
    const step = b.dataset.go;
    if (step === 'landing') {
      render('landing');
      $('#quote-form').scrollIntoView({ block: 'center' });
      $('#destination').focus({ preventScroll: true });
    } else render(step);
  });
}

$('#start-over').addEventListener('click', () => {
  Object.assign(state, { quote: null, plan: null, orderId: null, review: null, paid: null });
  $('#details-form').reset();
  render('landing');
  window.scrollTo(0, 0);
  $('#destination').focus({ preventScroll: true });
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
  // A reload in the middle of the checkout starts again from the landing (nothing is stored in the browser).
  if (location.hash.startsWith('#paso-')) history.replaceState({ step: 'landing' }, '', location.pathname);
  history.replaceState({ step: 'landing' }, '', location.pathname + location.hash);
}

init().catch(() => showError($('#quote-form'), 'No hemos podido cargar la página. Recarga para intentarlo de nuevo.'));
