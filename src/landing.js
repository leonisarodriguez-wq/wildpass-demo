// Server-side rendering of the public pages: landing (public/index.html template) and the shared page shell
// (terms page). Texts come from the brand config, numbers from the pricing config and the pricing
// engine, so the copy can never disagree with the product. Pages arrive complete: no text pops in later.
import { buildTools } from '../public/webmcp-tools.js';
import { readFileSync } from 'node:fs';
import { formatEur } from './business.js';
import { logoHtml } from './logo.js';
import * as art from './illustrations.js';
import { heroScene, miniScene, routeStrip, sceneFor, sceneSprite, SCENE_IDS } from './scenes.js';
import { EVENT_NAMES } from './events.js';
import { quoteCount, comparedPriceCount, calibrationTrips } from '../config/market-quotes.js';

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

// {{path}} → escaped text from vars, {{{name}}} → raw HTML from vars. Unknown keys fail loudly.
function render(template, vars) {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, name) => {
      if (!(name in vars.html)) throw new Error(`Template: unknown HTML block ${name}`);
      return vars.html[name];
    })
    .replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
      const value = get(vars, path);
      if (value === undefined) throw new Error(`Template: unknown text ${path}`);
      return escapeHtml(value);
    });
}

// Values used inside the copy ({rescue}, {wildMedEurope}…), taken from the pricing config.
export function copyValues(pricing, market) {
  const wild = pricing.plans.wild;
  const plus = pricing.plans.wild_plus;
  const max = pricing.plans.wild_max;
  return {
    rescue: formatEur(plus.coverage.search_and_rescue_eur),
    wildMedEurope: formatEur(wild.coverage.medical_expenses_europe_eur),
    wildMedWorld: formatEur(wild.coverage.medical_expenses_rest_of_world_eur),
    wildBaggage: formatEur(wild.coverage.baggage_theft_damage_eur),
    wildBaggageDelay: formatEur(wild.coverage.baggage_delay_eur),
    plusBaggageDelay: formatEur(plus.coverage.baggage_delay_eur),
    wildExcess: formatEur(wild.excess_per_medical_claim_eur),
    plusMedEurope: formatEur(plus.coverage.medical_expenses_europe_eur),
    plusMedWorld: formatEur(plus.coverage.medical_expenses_rest_of_world_eur),
    plusBaggage: formatEur(plus.coverage.baggage_theft_damage_eur),
    plusCancellation: formatEur(plus.coverage.cancellation_per_traveler_eur),
    maxMedEurope: formatEur(max.coverage.medical_expenses_europe_eur),
    maxMedWorld: formatEur(max.coverage.medical_expenses_rest_of_world_eur),
    maxBaggage: formatEur(max.coverage.baggage_theft_damage_eur),
    maxBaggageDelay: formatEur(max.coverage.baggage_delay_eur),
    maxDental: formatEur(max.coverage.urgent_dental_eur),
    maxLiability: formatEur(max.coverage.civil_liability_eur),
    maxCancellation: formatEur(max.coverage.cancellation_per_traveler_eur),
    maxRescue: formatEur(max.coverage.search_and_rescue_eur),
    maxSportsEquipment: formatEur(max.coverage.sports_equipment_eur),
    maxInterruption: formatEur(max.coverage.trip_interruption_per_traveler_eur),
    maxTrekkingAltitude: max.adventure_sports_limits.trekking_max_altitude_m.toLocaleString('es-ES', { useGrouping: 'always' }),
    maxDivingDepth: max.adventure_sports_limits.scuba_diving_max_depth_m,
    wildDental: formatEur(wild.coverage.urgent_dental_eur),
    plusDental: formatEur(plus.coverage.urgent_dental_eur),
    wildLiability: formatEur(wild.coverage.civil_liability_eur),
    plusLiability: formatEur(plus.coverage.civil_liability_eur),
    repatriation: plus.coverage.repatriation,
    ...pricing.limits, // maxTripDays, minTravelers, maxTravelers, minAge, maxAge
    trekkingAltitude: plus.adventure_sports_limits.trekking_max_altitude_m.toLocaleString('es-ES', { useGrouping: 'always' }),
    divingDepth: plus.adventure_sports_limits.scuba_diving_max_depth_m,
    count: quoteCount(market),
    comparedPrices: comparedPriceCount(market),
    comparedTrips: calibrationTrips.length,
  };
}

// "Desde X €": 7 days, Europe, 1 adult (age factor 1.0), straight from the pricing engine.
export function fromPrices(business, pricing) {
  const adult = pricing.ageFactors.find(b => b.factor === 1).minAge;
  return Object.fromEntries(Object.keys(pricing.plans).map(plan => [plan, business.pricePerTravelerCents('europe', plan, 7, adult) / 100]));
}

const iconLinks = '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">';
const fontPreloads = ['space-grotesk-latin-700-normal', 'inter-latin-400-normal', 'inter-latin-700-normal']
  .map(f => `<link rel="preload" href="/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('');

function footerHtml(brand) {
  const t = brand.texts;
  return `<footer class="site-footer"><div class="wrap">
    <p class="footer-legal">${escapeHtml(t.footerLegal)}</p>
    <p class="footer-links"><a href="/condiciones">${escapeHtml(t.footerTerms)}</a><a href="/terminos">${escapeHtml(t.footerContracting)}</a><a href="/privacidad">${escapeHtml(t.footerPrivacy)}</a><a href="/terminos#contacto">${escapeHtml(t.footerContact)}</a><a href="/si-me-pasa-algo">${escapeHtml(t.footerIncident)}</a><a href="/agentes">${escapeHtml(t.footerAgents)}</a><a class="footer-quiet" href="/caso">${escapeHtml(t.footerCaso)}</a></p>
  </div></footer>`;
}

// Demo banner: the full sentence, and a one-line short version for phones (CSS shows one of them).
export function bannerHtml(brand) {
  return `<div class="banner" id="demo-banner"><span class="banner-long">${escapeHtml(brand.siteBanner)}</span><span class="banner-short">${escapeHtml(brand.siteBannerShort)}</span></div>`;
}

// "Saltar al contenido": the first thing a keyboard user reaches on every page (visible only when focused).
export const skipLinkHtml = brand => `<a class="skip-link" href="#contenido">${escapeHtml(brand.texts.nav.skip)}</a>`;

// Site header on every page: logo, "Preguntas frecuentes", "Agentes", "Condiciones" and "Calcular mi seguro".
// Phones and tablets: the links fold into a simple "Menú" panel (public/site-nav.js). On the landing the links stay on the page.
export function headerHtml(brand, { home = false } = {}) {
  const n = brand.texts.nav;
  const root = home ? '' : '/';
  // Sticky under the demo banner. "Calcular mi seguro" sits in the bar itself (never folded into the menu), so it is always
  // visible, except on landing phones (<700 px), where the bottom sticky bar shows it instead: never two at once.
  return `<header class="site-header${home ? ' is-home' : ''}"><div class="wrap header-bar">${logoHtml()}
  <nav class="site-nav" id="site-nav" aria-label="${escapeHtml(n.label)}">
    <ul><li><a href="${root}#preguntas" data-open-faq>${escapeHtml(n.faq)}</a></li><li><a href="/agentes">${escapeHtml(n.agents)}</a></li><li><a href="/condiciones">${escapeHtml(n.terms)}</a></li><li class="nav-contact"><a href="/terminos#contacto">${escapeHtml(n.contact)}</a></li></ul>
  </nav>
  <a class="primary nav-cta" href="${root}#quote-form"${home ? ' data-focus-form' : ''}>${home ? `<span class="cta-a">${escapeHtml(n.cta)}</span><span class="cta-b">${escapeHtml(brand.texts.ctaB)}</span>` : escapeHtml(n.cta)}</a>
  <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="site-nav" data-open="${escapeHtml(n.menu)}" data-close="${escapeHtml(n.close)}">${escapeHtml(n.menu)}</button>
</div></header>`;
}

// Shared shell for simple pages (terms, /agentes, 404).
// head: extra tags (robots meta, JSON-LD…), already-built HTML.
// "Completa tu DNI": the person types their own DNI/NIE (one-time link from the policy email). No token → "link no longer valid".
export function completeIdPageBody({ brand, policy_number }) {
  const k = brand.texts.completeId;
  const e = escapeHtml;
  if (!policy_number) return `<div class="complete-id"><h1>${e(k.title)}</h1><p>${e(k.invalid)}</p><p><a href="/">${e(k.home)}</a></p></div>`;
  return `<div class="complete-id"><h1>${e(k.title)}</h1><p>${e(fill(k.intro, { number: policy_number }))}</p>
    <form id="complete-id-form" class="complete-id-form" novalidate data-empty="${e(k.empty)}" data-format="${e(brand.texts.form.idFormat)}" data-letter="${e(brand.texts.form.idLetter)}" data-done="${e(k.done)}" data-generic="${e(brand.texts.errors.generic)}">
      <div class="field"><label for="holder-id">${e(k.label)}</label><p class="hint" id="holder-id-hint">${e(k.help)}</p>
      <input id="holder-id" name="holder-id" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" aria-required="true" aria-describedby="holder-id-hint"></div>
      <p class="error" role="alert" hidden></p>
      <button type="submit" class="primary" id="complete-id-send">${e(k.button)}</button>
    </form>
    <div class="complete-id-done" id="complete-id-done" role="status" tabindex="-1" hidden><h2>${e(k.doneTitle)}</h2><p id="complete-id-done-text"></p><p><a class="secondary button-link" id="complete-id-pdf" href="#">${e(k.pdf)}</a></p></div>
  </div>`;
}

export function pageShell({ brand, title, body, scripts = [], head = '', pageClass = '' }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(brand.name)}</title>${head}${iconLinks}${fontPreloads}<link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/style.css"></head>
<body>${skipLinkHtml(brand)}${bannerHtml(brand)}${headerHtml(brand)}
<main class="page" id="contenido" tabindex="-1"><div class="wrap"><div class="card-page${pageClass ? ` ${pageClass}` : ''}">${body}</div></div></main>
${footerHtml(brand)}${['/site-nav.js', ...scripts].map(src => `<script type="module" src="${src}"></script>`).join('')}</body></html>`;
}

// Age dropdown options ("Menos de 1 año", "1 año", "2 años"… "85 años"), from the pricing limits.
export function ageOptions(form, limits, selected) {
  const options = [];
  for (let age = limits.minAge; age <= limits.maxAge; age++) {
    const label = age === 0 ? form.ageZero : age === 1 ? form.ageOne : fill(form.age, { age });
    options.push(`<option value="${age}"${age === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`);
  }
  return options.join('');
}

// First traveller row of the quote form (public/app.js copies it for travellers 2–8).
function firstTravelerRow(form, limits) {
  return `<div class="traveler-row"><label for="age-1">${escapeHtml(fill(form.travelerRow, { n: 1 }))}</label>`
    + `<select id="age-1" class="age" name="age">${ageOptions(form, limits, form.defaultAge)}</select></div>`;
}

// The real WebMCP tools in their real order (from public/webmcp-tools.js), so the landing can never list a fake one.
function realTools({ brand, pricing, payments }) {
  return buildTools({ limits: pricing.limits, plans: Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name])), brand, payments });
}

// Pricing zone of a destination (same lookup as business.js).
const zoneOf = (code, pricing) => Object.entries(pricing.zones).find(([, codes]) => codes.includes(code))?.[0] ?? 'rest_of_world';

// "Tu asistente también puede contratarlo": an animated example chat. Each message has ONE accessible copy (sr-only,
// with the speaker) and one visual copy marked aria-hidden that public/landing-fx.js types out, so screen readers read it once.
// The visual copy is server-rendered in its final state (no JS / reduced motion). The price comes from the pricing engine.
export function showcaseHtml({ brand, pricing, business }) {
  const a = brand.texts.ai;
  const ex = a.example;
  const zone = zoneOf(ex.destination, pricing);
  const totalCents = ex.ages.reduce((sum, age) => sum + business.pricePerTravelerCents(zone, ex.plan, ex.days, age), 0);
  const values = { price: formatEur(totalCents / 100), plan: pricing.plans[ex.plan].name };
  const chat = a.chat.map((line, i) => {
    const text = escapeHtml(fill(line.text, values));
    const who = line.who === 'done' ? '' : `${escapeHtml(a.speakers[line.who])}: `;
    return `<li class="bubble bubble-${line.who}" data-i="${i}"><span class="sr-only">${who}${text}</span><span class="bubble-text" aria-hidden="true">${text}</span></li>`;
  }).join('');
  return `<figure class="showcase" id="showcase">
    <figcaption class="showcase-label">${escapeHtml(a.showcaseLabel)}</figcaption>
    <ol class="chat">${chat}</ol>
    <button type="button" class="secondary showcase-replay" id="showcase-replay" hidden>${escapeHtml(a.replay)}</button>
  </figure>`;
}

// /agentes: what WebMCP is, the example prompt, the real tools (one plain line each) and confirm_payment's safety rules.
export function agentsPageBody({ brand, pricing, payments, now = new Date() }) {
  const t = brand.texts;
  const g = t.agents;
  const tools = realTools({ brand, pricing, payments });
  const pay = tools.find(tool => tool.name === 'confirm_payment');
  const rules = (pay.inputSchema.required ?? []).filter(f => pay.rulesEs[f]);
  // Copyable examples with dates that are always valid: the same trip as the button (next 10 Dec after today, 15 days counting both ends).
  const ex = brand.texts.form.example;
  const todayMadridIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
  const md = `-${String(ex.month).padStart(2, '0')}-${String(ex.day).padStart(2, '0')}`;
  const y = Number(todayMadridIso.slice(0, 4));
  const departure = `${y}${md}` > todayMadridIso ? `${y}${md}` : `${y + 1}${md}`;
  const day = n => new Date(Date.parse(`${departure}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const examples = [
    [g.exampleCall, `const mc = document.modelContext ?? navigator.modelContext;\nconst quote = await mc.executeTool('get_quote', {\n  origin_country: 'ES', destination_country: 'TH',\n  departure_date: '${day(0)}', return_date: '${day(ex.tripDays - 1)}',\n  traveler_ages: [35, 38],\n});\nconsole.log(quote.plans.map(p => [p.plan_name, p.total_price_eur]));`],
    [g.exampleError, JSON.stringify({ ok: false, error_code: 'TOTAL_MISMATCH', message: 'El total confirmado no coincide con el total revisado (170,16 €).', how_to_fix: 'Envía confirmed_total_eur como número, exactamente igual al total_eur que devolvió review_order y que el usuario ha aceptado.' }, null, 2)],
    [g.examplePay, `await mc.executeTool('confirm_payment', {\n  order_id: order.order_id,\n  review_token: review.review_token,\n  accept_terms: true,       // the user accepted the terms\n  user_confirmed: true,     // the user said yes to this total\n  confirmed_total_eur: review.total_eur,\n});`],
  ];
  const code = ([label, text], i) => `<figure class="code-card"><figcaption>${escapeHtml(label)}</figcaption><pre id="code-${i}"><code>${escapeHtml(text)}</code></pre>`
    + `<button type="button" class="secondary copy-code" data-copy="code-${i}" aria-label="${escapeHtml(fill(g.copyCodeLabel, { label }))}" data-copied="${escapeHtml(t.ai.copied)}">${escapeHtml(g.copyCode)}</button></figure>`;
  const flow = tools.filter(tool => tool.name !== 'get_policy').map(tool => `<code>${escapeHtml(tool.name)}</code>`);
  flow.splice(flow.length - 1, 0, `<em>${escapeHtml(g.flowUser)}</em>`);
  return `<h1>${escapeHtml(g.title)}</h1>
    <p>${escapeHtml(g.intro)}</p>
    <nav class="agents-index" aria-label="${escapeHtml(g.indexLabel)}"><a href="#personas">${escapeHtml(g.peopleTitle)}</a><a href="#desarrolladores">${escapeHtml(g.devTitle)}</a></nav>
    <section class="agents-part" id="personas" aria-labelledby="personas-title">
      <h2 id="personas-title">${escapeHtml(g.peopleTitle)}</h2>
      <h3>${escapeHtml(g.canTitle)}</h3>
      <ul class="agents-can">${g.can.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      <p class="agents-safety">${escapeHtml(g.safety)}</p>
      <h3>${escapeHtml(g.exampleTitle)}</h3>
      <ol class="agents-chat">${g.example.map(([who, text]) => `<li class="from-${who}"><strong>${escapeHtml(g[who])}:</strong> ${escapeHtml(text)}</li>`).join('')}</ol>
      <h3>${escapeHtml(g.promptTitle)}</h3>
      <figure class="prompt-card">
        <figcaption class="prompt-label">${escapeHtml(t.ai.promptLabel)}</figcaption>
        <blockquote class="prompt-text" id="example-prompt">${escapeHtml(t.ai.examplePrompt)}</blockquote>
        <button type="button" class="secondary copy-prompt" id="copy-prompt" aria-label="${escapeHtml(t.ai.copyLabel)}" data-copied="${escapeHtml(t.ai.copied)}">${escapeHtml(t.ai.copy)}</button>
        <span class="sr-only" role="status" id="copy-status"></span>
      </figure>
      <p class="ai-note">${escapeHtml(t.ai.compatNote)}</p>
      <h3>${escapeHtml(g.afterTitle)}</h3>
      <p>${escapeHtml(g.after)}</p>
    </section>
    <section class="agents-part" id="desarrolladores" aria-labelledby="desarrolladores-title">
      <h2 id="desarrolladores-title">${escapeHtml(g.devTitle)}</h2>
      <p class="agent-no-card"><strong>${escapeHtml(g.noCard)}</strong></p>
      <p class="agent-call-format"><strong>${escapeHtml(g.callFormat)}</strong></p>
      <p><strong>${escapeHtml(g.dni)}</strong> ${escapeHtml(g.dniHow)}</p>
      <p>${escapeHtml(g.testId)}</p>
      <p>${escapeHtml(g.residence)}</p>
      <h3>${escapeHtml(g.webmcpTitle)}</h3>
      <p>${escapeHtml(g.webmcpText)}</p>
      <p class="agent-wait"><strong>${escapeHtml(g.toolsWait)}</strong> ${escapeHtml(fill(g.reload, { quoteDays: pricing.limits.quoteValidDays }))}</p>
      <h3>${escapeHtml(fill(g.toolsTitle, { count: tools.length }))}</h3>
      <ol class="dev-tool-list">${tools.map(tool => `<li><code>${escapeHtml(tool.name)}</code> ${escapeHtml(tool.es)}${tool === pay ? ` <a href="#reglas-confirm-payment">${escapeHtml(g.rulesLink)}</a>` : ''}</li>`).join('')}</ol>
      <p>${escapeHtml(g.where)}</p>
      <h3>${escapeHtml(g.flowTitle)}</h3>
      <p class="dev-flow">${flow.join(' → ')} · <code>get_policy</code></p>
      <p>${escapeHtml(g.flowText)}</p>
      <h3 id="reglas-confirm-payment">${escapeHtml(g.rulesTitle)}</h3>
      <p>${escapeHtml(g.rulesIntro)}</p>
      <ul class="dev-rules">${rules.map(f => `<li><code>${escapeHtml(f)}</code>: ${escapeHtml(pay.rulesEs[f])}</li>`).join('')}</ul>
      <h3>${escapeHtml(g.compatTitle)}</h3>
      <p>${escapeHtml(g.compatText)}</p>
      <p><strong>${escapeHtml(g.providerTitle)}</strong> <span id="webmcp-provider" data-native="${escapeHtml(g.providerNative)}" data-polyfill="${escapeHtml(g.providerPolyfill)}">${escapeHtml(g.providerChecking)}</span></p>
      <h3>${escapeHtml(g.errorsTitle)}</h3>
      <p>${escapeHtml(g.errorsText)}</p>
      <ul class="dev-errors">${g.errors.map(([codeName, text]) => `<li><code>${escapeHtml(codeName)}</code> ${escapeHtml(text)}</li>`).join('')}</ul>
      <h3>${escapeHtml(g.examplesTitle)}</h3>
      ${examples.map(code).join('')}
      <span class="sr-only" role="status" id="copy-code-status"></span>
    </section>
    <p><a href="/">← ${escapeHtml(t.back)}</a></p>`;
}

// /condiciones: Wild vs Wild+ table first, an index with anchors, each plan's own exclusions, the common ones, "Calcular mi seguro".
export function termsPageBody({ brand, pricing }) {
  const t = brand.texts;
  const c = t.terms;
  const plans = Object.entries(pricing.plans);
  const anchor = id => `plan-${id.replace(/_/g, '-')}`;
  const cell = v => typeof v === 'string' ? v.charAt(0).toUpperCase() + v.slice(1) : v > 0 ? formatEur(v) : c.notIncluded;
  const rows = Object.entries(pricing.coverageLabels).map(([key, label]) =>
    `<tr><th scope="row">${escapeHtml(label)}</th>${plans.map(([, p]) => `<td data-plan="${escapeHtml(p.name)}">${escapeHtml(cell(p.coverage[key]))}</td>`).join('')}</tr>`).join('')
    + `<tr><th scope="row">${escapeHtml(c.excess)}</th>${plans.map(([, p]) => `<td data-plan="${escapeHtml(p.name)}">${escapeHtml(p.excess_per_medical_claim_eur > 0 ? formatEur(p.excess_per_medical_claim_eur) : c.noExcess)}</td>`).join('')}</tr>`;
  const sections = [
    ['comparativa', c.compareTitle],
    ['quien', c.whoTitle],
    ...plans.map(([id, p]) => [anchor(id), fill(c.planExclusionsTitle, { plan: p.name })]),
    ['exclusiones', t.exclusionsTitle],
  ];
  return `<h1>${escapeHtml(t.termsTitle)}</h1><p>${escapeHtml(t.termsIntro)}</p>
    <nav class="terms-index" aria-label="${escapeHtml(c.indexLabel)}"><p class="terms-index-label">${escapeHtml(c.indexLabel)}</p>
      <ol>${sections.map(([id, title]) => `<li><a href="#${id}">${escapeHtml(title)}</a></li>`).join('')}</ol></nav>
    <h2 id="comparativa">${escapeHtml(c.compareTitle)}</h2>
    <div class="table-scroll"><table class="terms-table">
      <thead><tr><th scope="col">${escapeHtml(c.coverageCol)}</th>${plans.map(([, p]) => `<th scope="col">${escapeHtml(p.name)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <h2 id="quien">${escapeHtml(c.whoTitle)}</h2><p>${escapeHtml(fill(c.whoText, pricing.limits))}</p>
    ${plans.map(([id, p]) => `<h2 id="${anchor(id)}">${escapeHtml(fill(c.planExclusionsTitle, { plan: p.name }))}</h2>
      <ul>${p.extraExclusions.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`).join('')}
    <h2 id="exclusiones">${escapeHtml(t.exclusionsTitle)}</h2><ul>${pricing.exclusions.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
    <div class="page-cta"><p>${escapeHtml(c.ctaText)}</p><a class="primary" href="/#quote-form">${escapeHtml(t.nav.cta)}</a></div>
    <p><a href="/">← ${escapeHtml(t.back)}</a></p>`;
}

// /si-me-pasa-algo: what to do and how a claim would be reported (demo, no phone numbers).
export function incidentPageBody({ brand }) {
  const i = brand.texts.incident;
  return `<h1>${escapeHtml(i.title)}</h1><p class="legal-notice" role="note"><strong>${escapeHtml(i.notice)}</strong></p>
    <p>${escapeHtml(i.intro)}</p>
    <ol class="incident-steps">${i.steps.map(s => `<li><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.text)}</p></li>`).join('')}</ol>
    <p class="incident-callout" role="note">${escapeHtml(i.callout)}</p>
    <p><a href="/">← ${escapeHtml(i.back)}</a></p>`;
}

// /terminos and /privacidad: demo documents (texts.legal). `[text](/path)` in a paragraph = an internal link.
export function legalPageBody({ brand, kind, contactEmail = '' }) {
  const t = brand.texts.legal;
  const doc = t[kind];
  const link = line => escapeHtml(line).replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  return `<h1>${escapeHtml(doc.title)}</h1><p class="legal-notice" role="note"><strong>${escapeHtml(doc.notice)}</strong></p>
    <nav class="terms-index" aria-label="${escapeHtml(t.indexLabel)}"><p class="terms-index-label">${escapeHtml(t.indexLabel)}</p>
      <ol>${doc.sections.map(sec => `<li><a href="#${sec.id}">${escapeHtml(sec.title)}</a></li>`).join('')}</ol></nav>
    ${doc.sections.map(sec => `<h2 id="${sec.id}">${escapeHtml(sec.title)}</h2>${(sec.paragraphs ?? []).map(x => `<p>${link(x)}</p>`).join('')}${sec.list ? `<ul>${sec.list.map(x => `<li>${link(x)}</li>`).join('')}</ul>` : ''}${sec.form && contactEmail ? contactFormHtml(brand) : ''}`).join('')}
    <p><a href="/">← ${escapeHtml(brand.texts.back)}</a></p>`;
}

// /caso: the case study (draft). Product numbers come from the configs; [COMPLETAR] / [DATO A VERIFICAR] are highlighted.
export function casePageBody({ brand, pricing, market, payments, business }) {
  const t = brand.texts;
  const k = t.caso;
  const values = { ...copyValues(pricing, market), scenes: SCENE_IDS.length, tools: realTools({ brand, pricing, payments }).length };
  // [text](https://…) → an external link (sources); leftover [COMPLETAR…] / [DATO A VERIFICAR…] stay highlighted.
  const text = line => escapeHtml(fill(line, values))
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\[(COMPLETAR|DATO A VERIFICAR)[^\]]*\]/g, m => `<mark class="todo">${m}</mark>`);
  const cards = list => `<div class="case-cards">${list.map(c => `<div class="case-card"><h3>${escapeHtml(c.title)}</h3><p>${text(c.text)}</p></div>`).join('')}</div>`;
  // "Cómo calibré el precio": the real quotes of config/market-quotes.js next to our engine's price for the same trip and plan.
  const calibration = () => {
    const c = k.calibracion;
    const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    const tables = market.trips.filter(trip => c.trips[trip.label]).map(trip => {
      const days = dayCount(trip.from, trip.to);
      const rows = Object.entries(pricing.plans).map(([planId, plan]) => {
        const ours = formatEur(business.pricePerTravelerCents(trip.zone, planId, days, trip.age) / 100);
        const cells = market.insurers.map(ins => {
          const name = market.comparable[planId][ins];
          const price = trip.quotes[ins]?.[name];
          return `<td>${price === undefined ? escapeHtml(c.noQuote) : `${escapeHtml(formatEur(price))} <span class="muted">(${escapeHtml(name)})</span>`}</td>`;
        }).join('');
        return `<tr><th scope="row">${escapeHtml(plan.name)}</th><td><strong>${escapeHtml(ours)}</strong></td>${cells}</tr>`;
      }).join('');
      return `<h3>${escapeHtml(c.trips[trip.label])}</h3><div class="table-scroll"><table class="metrics-table"><thead><tr><th scope="col">${escapeHtml(c.planCol)}</th><th scope="col">${escapeHtml(c.ours)}</th>${market.insurers.map(i => `<th scope="col">${escapeHtml(i)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<p>${text(c.intro)}</p>${tables}<p>${text(c.note)}</p>${c.explain.map(p => `<p>${text(p)}</p>`).join('')}`;
  };
  const section = (id, inner) => `<section class="case-section" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${escapeHtml(k.sections[id])}</h2>${inner}</section>`;
  const swatches = Object.entries(k.paletteNames).map(([key, name]) => `<li><svg class="swatch" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="${brand.colors[key]}" stroke="${brand.colors.border}"/></svg>${escapeHtml(name)} <code>${escapeHtml(brand.colors[key])}</code></li>`).join('');
  const roadmap = `<ol class="roadmap">${k.ruta.map(phase => `<li class="phase"><p class="phase-when">${escapeHtml(phase.when)}</p><h3>${escapeHtml(phase.title)}</h3><ul>${phase.items.map(i => `<li>${text(i)}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  return `<h1>${escapeHtml(k.pageTitle)}</h1><p class="case-lead">${escapeHtml(k.lead)}</p>
    <nav class="terms-index" aria-label="${escapeHtml(k.indexLabel)}"><p class="terms-index-label">${escapeHtml(k.indexLabel)}</p>
      <ol>${Object.entries(k.sections).map(([id, title]) => `<li><a href="#${id}">${escapeHtml(title)}</a></li>`).join('')}</ol></nav>
    ${section('reto', k.reto.map(p => `<p>${text(p)}</p>`).join(''))}
    ${section('quien', k.quien.map(p => `<p>${text(p)}</p>`).join(''))}
    ${section('propuesta', cards(k.propuesta))}
    ${section('calibracion', calibration())}
    ${section('marca', `${cards(k.marca)}<h3>${escapeHtml(k.paletteLabel)}</h3><ul class="swatches">${swatches}</ul>`)}
    ${section('agentes', `${cards(k.agentes)}<p><a href="/agentes">${escapeHtml(t.nav.agents)}</a> · <a href="/llms.txt">llms.txt</a></p>`)}
    ${section('medicion', `<p>${text(k.medicion)}</p><p><a class="secondary button-link" href="/metricas">${escapeHtml(k.metricsLink)}</a></p>
      <h3>${escapeHtml(k.eventsLabel)}</h3><ul class="case-events">${EVENT_NAMES.map(e => `<li><code>${e}</code> ${escapeHtml(k.events[e])}</li>`).join('')}</ul>`)}
    ${section('experimentos', `${k.experimentos.map(x => `<div class="case-card"><h3>${escapeHtml(x.title)}</h3><p>${text(x.text)}</p><p><strong>${text(x.decision)}</strong></p></div>`).join('')}<p>${text(k.experimentsNote)}</p>`)}
    ${section('ruta', roadmap)}
    ${section('distinto', `<ul>${k.distinto.map(i => `<li>${text(i)}</li>`).join('')}</ul>`)}
    ${section('siguientes', `<ul>${k.siguientes.map(i => `<li>${text(i)}</li>`).join('')}</ul>`)}
    <p><a href="/">← ${escapeHtml(t.back)}</a></p>`;
}

// 404: branded page with the way back to the quote form.
export function notFoundBody({ brand }) {
  const t = brand.texts;
  const n = t.notFound;
  return `<div class="not-found">${art.mountainRope}<h1>${escapeHtml(n.heading)}</h1><p>${escapeHtml(n.text)}</p>
    <div class="not-found-actions"><a class="primary" href="/#quote-form">${escapeHtml(t.nav.cta)}</a><a class="secondary" href="/">${escapeHtml(n.home)}</a></div></div>`;
}

// /llms.txt: plain text for AI agents (what Wildpass is, the 6 tools in order, where the instructions are).
export function llmsTxt({ brand, pricing, payments, baseUrl }) {
  const l = brand.texts.llms;
  const tools = realTools({ brand, pricing, payments });
  const pay = tools.find(tool => tool.name === 'confirm_payment');
  const rules = (pay.inputSchema.required ?? []).filter(f => pay.rulesEs[f]);
  return [
    `# ${brand.name}`, '', `> ${brand.siteBanner}`, '', l.intro, '',
    `## ${l.howTitle}`, '', `**${l.noCard}**`, '', `**${l.callFormat}**`, '', `**${l.toolsWait}**`, '', fill(l.reload, { quoteDays: pricing.limits.quoteValidDays }), '', fill(l.how, { url: `${baseUrl}/` }), '',
    ...tools.flatMap((tool, i) => [`${i + 1}. ${tool.name}: ${tool.es}`, ...(tool === pay ? rules.map(f => `   - ${f}: ${pay.rulesEs[f]}`) : [])]), '',
    l.confirm, '',
    `## ${l.whoTitle}`, '', l.residence, '', `**${l.dni}**`, '', l.dniHow, '', l.testId, '',
    `## ${l.moreTitle}`, '', `- [${l.agentsLink}](${baseUrl}/agentes)`, `- [${l.termsLink}](${baseUrl}/condiciones)`, `- [${l.contractingLink}](${baseUrl}/terminos)`, `- [${l.privacyLink}](${baseUrl}/privacidad)`, '',
  ].join('\n');
}

// Destination <select> (the source of truth; public/destination-picker.js turns it into a searchable box):
// "Destinos populares" first, then all the others A–Z. data-scene = hero illustration (src/scenes.js);
// data-blocked = official "do not travel" advice (pricing config): the quote is refused, the box says why.
export function countryOptionsHtml({ brand, pricing, countries }) {
  const f = brand.texts.form;
  const option = c => `<option value="${c.code}" data-scene="${sceneFor(c.code, pricing)}"${pricing.destinationsNotCovered.includes(c.code) ? ' data-blocked="true"' : ''}>${escapeHtml(c.name)}</option>`;
  const all = countries.filter(c => c.code !== 'ES');
  const popular = f.popularDestinations.map(code => {
    const c = all.find(x => x.code === code);
    if (!c) throw new Error(`Popular destination ${code} is not in the country list`);
    return c;
  });
  return `<optgroup label="${escapeHtml(f.popularLabel)}">${popular.map(option).join('')}</optgroup>`
    + `<optgroup label="${escapeHtml(f.allLabel)}">${all.filter(c => !f.popularDestinations.includes(c.code)).map(option).join('')}</optgroup>`;
}

// Horizontal carousel (scroll-snap): ‹ › buttons on computers, swipe on phones, a progress line shows there is more.
// public/landing-fx.js wires the buttons and the progress line for every [data-carousel].
export function carouselHtml({ id, label, prev, next, items }) {
  const arrow = (dir, text, d) => `<button type="button" class="carousel-arrow carousel-${dir}" aria-controls="${id}" aria-label="${escapeHtml(text)}" hidden><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  return `<div class="carousel" data-carousel>
    ${arrow('prev', prev, 'M15 5l-7 7 7 7')}
    <ul class="carousel-strip" id="${id}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${items}</ul>
    ${arrow('next', next, 'M9 5l7 7-7 7')}
    <div class="carousel-progress" aria-hidden="true"><span></span></div>
  </div>`;
}

// "¿Y si…?": one card per situation, in a carousel. Every limit comes from the pricing config (placeholders + `figure`).
export function whatIfHtml({ brand, pricing, values }) {
  const w = brand.texts.whatIf;
  const cats = Object.fromEntries(w.categories.map(c => [c.id, c.label]));
  // Category filter (toggle buttons), then one chip per situation (ARIA tabs) and ONE card with the chosen one.
  const filters = w.categories.map((c, i) => `<button type="button" class="whatif-filter" data-cat="${c.id}" aria-pressed="${i === 0}">${escapeHtml(c.label)}</button>`).join('');
  const tabs = w.scenarios.map((sc, i) => {
    if (!cats[sc.cat]) throw new Error(`What-if ${sc.id}: unknown category ${sc.cat}`);
    return `<button type="button" role="tab" class="whatif-tab" id="wi-tab-${sc.id}" data-cat="${sc.cat}" aria-controls="wi-panel-${sc.id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${escapeHtml(sc.tab)}</button>`;
  }).join('');
  const panels = w.scenarios.map((sc, i) => {
    let figure = '';
    if (sc.figure) {
      const amount = pricing.plans[sc.figure.plan].coverage[sc.figure.key];
      if (typeof amount !== 'number' || amount <= 0) throw new Error(`What-if ${sc.id}: no limit ${sc.figure.key} in ${sc.figure.plan}`);
      figure = `<p class="whatif-figure"><span class="count" data-to="${amount}">${escapeHtml(formatEur(amount))}</span> <span class="whatif-figure-label">${escapeHtml(sc.figureLabel)}</span></p>`;
    }
    const verdicts = Object.entries(sc.plans).map(([plan, v]) => `<li class="verdict ${v.ok ? 'is-ok' : 'is-no'}"><strong>${escapeHtml(pricing.plans[plan].name)}</strong> <span class="verdict-state">${escapeHtml(v.ok ? w.covered : w.notCovered)}</span><span class="verdict-text">${escapeHtml(fill(v.text, values))}</span></li>`).join('');
    return `<div class="whatif-panel" role="tabpanel" id="wi-panel-${sc.id}" aria-labelledby="wi-tab-${sc.id}" tabindex="0"${i ? ' hidden' : ''}>`
      + `<p class="whatif-cat">${escapeHtml(cats[sc.cat])}</p><h3>${escapeHtml(sc.title)}</h3>${figure}<p class="whatif-text">${escapeHtml(fill(sc.text, values))}</p><ul class="verdicts">${verdicts}</ul></div>`;
  }).join('');
  return `<div class="wrap whatif-filters" role="group" aria-label="${escapeHtml(w.filtersLabel)}">${filters}</div>
      <div class="whatif-tabs-box"><div class="whatif-tabs" role="tablist" aria-label="${escapeHtml(w.tabsLabel)}">${tabs}</div></div>
      <p class="wrap whatif-hint">${escapeHtml(w.hint)}</p>
      <div class="wrap"><div class="whatif-panels">${panels}</div></div>`;
}

// Trust strip under the hero: 4 facts, each an icon in a soft circle (values from the pricing config).
function trustHtml({ brand, values }) {
  const icons = { mail: art.iconMail, cancel: art.iconCancel, mountain: art.iconMountain, doc: art.iconDoc, shield: art.iconShield, check: art.iconCheck };
  // Main line + smaller second line (`sub`), the same at every width.
  return brand.texts.trust.map(item => `<li class="trust-item"><span class="trust-icon">${icons[item.icon]}</span>`
    + `<span class="trust-text"><span class="trust-main">${escapeHtml(fill(item.text, values))}</span><span class="trust-sub">${escapeHtml(fill(item.sub, values))}</span></span></li>`).join('');
}

// The contact form (shown in /terminos → Contacto when CONTACT_EMAIL is set): posted to /api/contact (src/contact.js) by public/contact.js. The owner's address stays on the
// server. "website" is a honeypot: hidden from people and screen readers, bots fill it in.
function contactFormHtml(brand) {
  const c = brand.texts.contact;
  const e = escapeHtml;
  const data = { 'missing-name': c.missingName, 'missing-email': c.missingEmail, 'missing-message': c.missingMessage, 'missing-consent': c.missingConsent, 'invalid-email': c.invalidEmail, success: c.successText, sending: c.sending, generic: c.generic };
  const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${e(v)}"`).join('');
  const form = `<p>${e(c.intro)}</p><form id="contact-form" class="contact-form"${attrs} novalidate>`
    + `<div class="field"><label for="contact-name">${e(c.name)}</label><input id="contact-name" name="name" autocomplete="name" maxlength="100" aria-required="true"></div>`
    + `<div class="field"><label for="contact-email">${e(c.email)}</label><p class="hint" id="contact-email-hint">${e(c.emailHelp)}</p><input id="contact-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" aria-required="true" aria-describedby="contact-email-hint"></div>`
    + `<div class="field"><label for="contact-message">${e(c.message)}</label><textarea id="contact-message" name="message" rows="5" maxlength="2000" aria-required="true"></textarea></div>`
    + `<div class="hp" aria-hidden="true"><label for="contact-website">${e(c.honeypot)}</label><input id="contact-website" name="website" tabindex="-1" autocomplete="off"></div>`
    + `<p class="muted privacy-link"><a href="/privacidad">${e(brand.texts.checkout.privacyLink)}</a></p>`
    + `<label class="check" for="contact-consent"><input type="checkbox" id="contact-consent" name="consent" aria-required="true"> <span>${e(c.consent)}</span></label>`
    + `<p class="error" role="alert" hidden></p>`
    + `<button type="submit" class="primary" id="contact-send">${e(c.send)}</button></form>`;
  // After a good send the form is hidden and this block takes its place in the same card (aria-live: read out once; focus goes to its title).
  const success = `<div class="contact-success" id="contact-success" aria-live="polite" hidden>`
    + `<span class="contact-success-icon">${art.iconCheck}</span>`
    + `<h3 id="contact-success-title" tabindex="-1">${e(c.successTitle)}</h3><p id="contact-success-text"></p>`
    + `<div class="contact-success-actions"><button type="button" class="primary" id="contact-again">${e(c.again)}</button><a class="secondary button-link" href="/">${e(c.backHome)}</a></div></div>`;
  return `<div class="contact-card" id="contact-card">${form}${success}</div>`;
}

function faqHtml({ brand, values, contactEmail }) {
  const t = brand.texts;
  return t.faq.map(f => {
    const answer = escapeHtml(fill(f.a, values))
      .replace(/\[([^\]]+)\]\((\/caso#calibracion)\)/g, '<a href="$2">$1</a>')
      .replace(/\[([^\]]+)\]\(#quote-form\)/g, '<a href="#quote-form" data-focus-form>$1</a>');
    return `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><p>${answer}</p></details>`;
  }).join('');
}

// "¿A dónde te escapas?": one card per scene destination, "7 días desde X €" = Wild, 1 adult, from the engine.
export function destinationsHtml({ brand, pricing, business, countries }) {
  const d = brand.texts.destinations;
  const adult = pricing.ageFactors.find(b => b.factor === 1).minAge;
  const items = d.countries.map(code => {
    const country = countries.find(c => c.code === code);
    if (!country) throw new Error(`Destinations: unknown country ${code}`);
    const priceOf = plan => formatEur(business.pricePerTravelerCents(zoneOf(code, pricing), plan, 7, adult) / 100);
    const price = priceOf('wild');
    const plusPrice = priceOf('wild_plus');
    const maxPrice = priceOf('wild_max');
    return `<li><button type="button" class="dest-card" data-country="${code}" aria-label="${escapeHtml(fill(d.cardLabel, { name: country.name, price, plusPrice, maxPrice }))}">`
      + `${miniScene(sceneFor(code, pricing))}<span class="dest-name">${escapeHtml(country.name)}</span><span class="dest-price">${escapeHtml(fill(d.price, { price }))}</span>`
      + `<span class="dest-price dest-price-plus">${escapeHtml(fill(d.pricePlus, { price: plusPrice }))}</span>`
      + `<span class="dest-price dest-price-plus">${escapeHtml(fill(d.priceMax, { price: maxPrice }))}</span></button></li>`;
  }).join('');
  return carouselHtml({ id: 'dest-strip', prev: d.prev, next: d.next, items });
}

export function createLanding({ brand, pricing, business, market, countries, templatePath, contactEmail = '' }) {
  const template = readFileSync(templatePath, 'utf8');
  const t = brand.texts;
  const values = copyValues(pricing, market);

  // baseUrl = this request's public address: link previews need absolute URLs (the public address comes from the request).
  function landingHtml({ baseUrl = '' } = {}) {
    const prices = fromPrices(business, pricing);
    const planPoints = id => `<ul class="plan-points">${t.plans.points[id].map(x => `<li>${escapeHtml(fill(x, values))}</li>`).join('')}</ul>`;
    const html = {
      iconLinks, fontPreloads,
      skipLink: skipLinkHtml(brand),
      siteHeader: headerHtml(brand, { home: true }),
      banner: bannerHtml(brand),
      countryOptions: countryOptionsHtml({ brand, pricing, countries }),
      showcase: showcaseHtml({ brand, pricing, business }),
      sceneSprite, heroScene, routeStrip,
      // Each sentence of the claim stays on one line ("Travel wild. / We've got you."): never a lonely "you.".
      heroTitle: brand.claim.match(/[^.!?]+[.!?]*/g).map(part => `<span class="claim-part">${escapeHtml(part.trim())}</span>`).join(' '),
      whatIf: whatIfHtml({ brand, pricing, values }),
      destinations: destinationsHtml({ brand, pricing, business, countries }),
      faq: faqHtml({ brand, values, contactEmail }),
      faqMore: contactEmail ? `<div class="faq-more"><p class="faq-more-title">${escapeHtml(t.faqMoreTitle)}</p><a class="secondary button-link" href="/terminos#contacto">${escapeHtml(t.faqMore)}</a></div>` : '',
      trust: trustHtml({ brand, values }),
      travelerRow: firstTravelerRow(t.form, pricing.limits),
      maxTravelersNote: escapeHtml(fill(t.form.maxTravelersNote, pricing.limits)),
      pointsWild: planPoints('wild'), pointsWildPlus: planPoints('wild_plus'), pointsWildMax: planPoints('wild_max'),
      iconPin: art.iconPin, iconCalendar: art.iconCalendar, iconPeople: art.iconPeople, iconRemove: art.iconRemove, iconCard: art.iconCard,
    };
    return render(template, {
      html,
      brand,
      t,
      price: Object.fromEntries(Object.keys(pricing.plans).map(id => [id, fill(t.plans.from, { price: formatEur(prices[id]) })])),
      planNames: Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name])),
      choose: Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, fill(t.plans.choose, { plan: p.name })])),
      maxDescription: fill(t.plans.wildMaxDescription, values),
      og: { url: `${baseUrl}/`, image: `${baseUrl}/og-image.png` },
    });
  }

  return { landingHtml };
}
