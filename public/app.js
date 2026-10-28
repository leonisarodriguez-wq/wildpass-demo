// Human website flow. It only collects input and shows results: every rule is checked on the server.
import { callApi, loadConfig } from './api.js';

const $ = sel => document.querySelector(sel);
const STEPS = ['step-quote', 'step-plans', 'step-details', 'step-review', 'step-done'];
const state = { quote: null, orderId: null, review: null };
let T = {};
let limits = {};

const eur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.flat().filter(c => c != null));
  return node;
}

function show(stepId) {
  for (const id of STEPS) document.getElementById(id).hidden = id !== stepId;
  window.scrollTo(0, 0);
}

function showError(stepId, result) {
  const box = document.querySelector(`#${stepId} .error`);
  if (!result) { box.hidden = true; box.replaceChildren(); return; }
  // People see only `message`; `how_to_fix` is worded for AI agents (it names fields and tools).
  const text = result.error_code === 'TERMS_NOT_ACCEPTED' ? T.mustAcceptTerms : result.message;
  box.replaceChildren(el('strong', { textContent: text }));
  box.hidden = false;
}

async function withBusy(button, fn) {
  button.disabled = true;
  try { await fn(); } finally { button.disabled = false; }
}

// ---------- Step 1: quote ----------
function addAgeRow(value = '') {
  const input = el('input', { type: 'number', min: limits.minAge, max: limits.maxAge, step: 1, value, required: true, className: 'age' });
  const row = el('div', { className: 'age-row' }, input, el('button', { type: 'button', textContent: T.removeTraveler, onclick: () => { if ($('#ages').children.length > 1) row.remove(); } }));
  $('#ages').append(row);
}

$('#add-age').addEventListener('click', () => {
  if ($('#ages').children.length < limits.maxTravelers) addAgeRow();
});

$('#quote-form').addEventListener('submit', async e => {
  e.preventDefault();
  await withBusy(e.submitter ?? $('#quote-form button[type=submit]'), async () => {
    const input = {
      origin_country: $('#origin').value,
      destination_country: $('#destination').value,
      departure_date: $('#departure').value,
      return_date: $('#return').value,
      traveler_ages: [...document.querySelectorAll('#ages .age')].map(i => (i.value === '' ? null : Number(i.value))),
    };
    const result = await callApi('get_quote', input);
    if (!result.ok) return showError('step-quote', result);
    showError('step-quote', null);
    state.quote = result;
    renderPlans();
    show('step-plans');
  });
});

// ---------- Step 2: plans ----------
function renderPlans() {
  const q = state.quote;
  $('#trip-line').textContent = `${q.trip.origin_name} → ${q.trip.destination_name} (${q.trip.zone_name}) · ${q.trip.departure_date} → ${q.trip.return_date} · ${q.trip.days} días · ${q.trip.traveler_ages.length} ${T.travelers.toLowerCase()}`;
  $('#plans').replaceChildren(...q.plans.map(p => el('div', { className: 'plan' },
    el('h3', { textContent: p.plan_name }),
    el('div', { className: 'price', textContent: eur(p.total_price_eur) }),
    el('div', { textContent: T.total }),
    el('ul', {}, p.price_per_traveler.map(t => el('li', { textContent: `${T.traveler} ${t.traveler} (${t.age} ${T.age}): ${eur(t.price_eur)}` }))),
    el('ul', {}, p.coverage_summary.map(s => el('li', { textContent: s }))),
    el('p', { textContent: `${T.excess}: ${eur(p.excess_per_medical_claim_eur)}` }),
    el('button', { type: 'button', className: 'primary', textContent: `${T.choosePlan} ${p.plan_name}`, onclick: e => choosePlan(p.plan, e.target) }),
  )));
  $('#exclusions').replaceChildren(...q.exclusions.map(x => el('li', { textContent: x })));
}

async function choosePlan(plan, button) {
  await withBusy(button, async () => {
    const result = await callApi('select_plan', { quote_id: state.quote.quote_id, plan });
    if (!result.ok) return showError('step-plans', result);
    showError('step-plans', null);
    state.orderId = result.order_id;
    renderTravelerFields();
    show('step-details');
  });
}

// ---------- Step 3: traveller details ----------
function renderTravelerFields() {
  $('#travelers').replaceChildren(...state.quote.trip.traveler_ages.map((age, i) => el('fieldset', {},
    el('legend', { textContent: `${T.traveler} ${i + 1} (${age} ${T.age})` }),
    el('label', {}, el('span', { textContent: T.fullName }), el('input', { className: 't-name', required: true })),
    el('label', {}, el('span', { textContent: T.birthDate }), el('input', { className: 't-birth', type: 'date', required: true })),
  )));
}

$('#details-form').addEventListener('submit', async e => {
  e.preventDefault();
  await withBusy(e.submitter ?? $('#details-form button[type=submit]'), async () => {
    const names = [...document.querySelectorAll('#travelers .t-name')];
    const births = [...document.querySelectorAll('#travelers .t-birth')];
    const result = await callApi('set_traveler_details', {
      order_id: state.orderId,
      policyholder: { full_name: $('#ph-name').value, email: $('#ph-email').value },
      travelers: names.map((n, i) => ({ full_name: n.value, birth_date: births[i].value })),
    });
    if (!result.ok) return showError('step-details', result);
    const review = await callApi('review_order', { order_id: state.orderId });
    if (!review.ok) return showError('step-details', review);
    showError('step-details', null);
    state.review = review;
    renderReview();
    show('step-review');
  });
});

// ---------- Step 4: review + simulated payment ----------
function renderReview() {
  const r = state.review;
  const s = r.summary;
  $('#review').replaceChildren(
    el('p', { textContent: `${T.trip}: ${s.trip.origin_name} → ${s.trip.destination_name} · ${s.trip.departure_date} → ${s.trip.return_date} (${s.trip.days} días)` }),
    el('p', { textContent: `${T.plan}: ${s.plan.plan_name}` }),
    el('p', { textContent: `${T.policyholder}: ${s.policyholder.full_name} · ${s.policyholder.email}` }),
    el('div', { className: 'table-wrap' }, el('table', {},
      el('tr', {}, el('th', { textContent: T.traveler }), el('th', { textContent: T.birthDate }), el('th', { textContent: T.age }), el('th', { textContent: 'Precio' })),
      s.travelers.map(t => el('tr', {}, el('td', { textContent: t.full_name }), el('td', { textContent: t.birth_date }), el('td', { textContent: t.age_at_departure }), el('td', { textContent: eur(t.price_eur) }))),
    )),
    el('h3', { textContent: `${T.total}: ${eur(r.total_eur)}` }),
    el('ul', {}, r.key_conditions.map(c => el('li', { textContent: c }))),
    el('ul', {}, s.plan.coverage_summary.map(c => el('li', { textContent: c }))),
    el('h4', { textContent: T.exclusionsTitle }),
    el('ul', {}, s.exclusions.map(x => el('li', { textContent: x }))),
  );
  $('#terms-link').href = r.terms_url;
  $('#accept-terms').checked = false;
  $('#pay').textContent = `${T.payButton} · ${eur(r.total_eur)}`;
}

$('#pay').addEventListener('click', e => withBusy(e.target, async () => {
  // Clicking the pay button after seeing the summary is the user's explicit confirmation.
  const result = await callApi('confirm_payment', {
    order_id: state.orderId,
    review_token: state.review.review_token,
    accept_terms: $('#accept-terms').checked,
    confirmed_total_eur: state.review.total_eur,
    user_confirmed: true,
  });
  if (!result.ok) return showError('step-review', result);
  showError('step-review', null);
  $('#policy-number').textContent = result.policy_number;
  $('#pdf-link').href = result.pdf_url;
  $('#email-status').textContent = T.emailStatuses[result.email_status] ?? result.email_status;
  show('step-done');
}));

// ---------- navigation + start ----------
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => show(b.dataset.back));

$('#start-over').addEventListener('click', () => {
  Object.assign(state, { quote: null, orderId: null, review: null });
  $('#quote-form').reset();
  $('#details-form').reset();
  $('#ages').replaceChildren();
  addAgeRow();
  show('step-quote');
});

async function init() {
  const config = await loadConfig();
  T = config.brand.texts;
  limits = config.limits;
  document.title = T.pageTitle;
  $('#brand-name').textContent = config.brand.name;
  $('#demo-banner').textContent = config.brand.demoBanner;
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = T[node.dataset.t] ?? node.textContent;

  const options = config.countries.map(c => el('option', { value: c.code, textContent: c.name }));
  $('#origin').append(...options.map(o => o.cloneNode(true)));
  $('#origin').value = 'ES';
  $('#destination').append(...options);

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  $('#departure').min = tomorrow;
  $('#return').min = tomorrow;
  addAgeRow();
}

init().catch(() => showError('step-quote', { message: T.networkError ?? 'Error de conexión.' }));
