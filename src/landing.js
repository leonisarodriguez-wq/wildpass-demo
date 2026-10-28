// Server-side rendering of the public pages: landing (public/index.html template) and the shared page shell
// (terms page). Texts come from the brand config, numbers from the pricing config and the pricing
// engine, so the copy can never disagree with the product. Pages arrive complete: no text pops in later.
import { buildTools } from '../public/webmcp-tools.js';
import { readFileSync } from 'node:fs';
import { formatEur } from './business.js';
import { logoHtml } from './logo.js';
import * as art from './illustrations.js';
import { quoteCount } from '../config/market-quotes.js';

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
function copyValues(pricing, market) {
  const wild = pricing.plans.wild;
  const plus = pricing.plans.wild_plus;
  return {
    rescue: formatEur(plus.coverage.search_and_rescue_eur),
    wildMedEurope: formatEur(wild.coverage.medical_expenses_europe_eur),
    wildMedWorld: formatEur(wild.coverage.medical_expenses_rest_of_world_eur),
    wildBaggage: formatEur(wild.coverage.baggage_theft_damage_eur),
    wildExcess: formatEur(wild.excess_per_medical_claim_eur),
    plusMedEurope: formatEur(plus.coverage.medical_expenses_europe_eur),
    plusMedWorld: formatEur(plus.coverage.medical_expenses_rest_of_world_eur),
    plusBaggage: formatEur(plus.coverage.baggage_theft_damage_eur),
    plusCancellation: formatEur(plus.coverage.cancellation_per_traveler_eur),
    trekkingAltitude: plus.adventure_sports_limits.trekking_max_altitude_m.toLocaleString('es-ES'),
    divingDepth: plus.adventure_sports_limits.scuba_diving_max_depth_m,
    count: quoteCount(market),
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
    <p class="footer-links"><a href="/condiciones">${escapeHtml(t.footerTerms)}</a><span>${escapeHtml(t.footerWebmcp)}</span></p>
  </div></footer>`;
}

// Shared shell for simple pages (terms).
export function pageShell({ brand, title, body }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(brand.name)}</title>${iconLinks}${fontPreloads}<link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/style.css"></head>
<body><div class="banner">${escapeHtml(brand.siteBanner)}</div>
<header class="site-header"><div class="wrap">${logoHtml()}</div></header>
<main class="page"><div class="wrap"><div class="card-page">${body}</div></div></main>
${footerHtml(brand)}</body></html>`;
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

// "Para desarrolladores": built from the REAL WebMCP tool definitions (public/webmcp-tools.js), never typed in.
export function devToolsHtml({ brand, pricing, payments }) {
  const tools = buildTools({ limits: pricing.limits, plans: Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name])), brand, payments });
  const items = tools.map(tool => {
    const rules = tool.rulesEs ? (tool.inputSchema.required ?? []).filter(f => tool.rulesEs[f]) : [];
    return `<li><code>${escapeHtml(tool.name)}</code> ${escapeHtml(tool.es)}`
      + (rules.length ? `<ul class="dev-rules">${rules.map(f => `<li><code>${escapeHtml(f)}</code>: ${escapeHtml(tool.rulesEs[f])}</li>`).join('')}</ul>` : '')
      + '</li>';
  }).join('');
  return `<p>${escapeHtml(fill(brand.texts.ai.devIntro, { count: tools.length }))}</p><ul class="dev-tool-list">${items}</ul>`;
}

export function createLanding({ brand, pricing, business, market, countries, templatePath, payments = { provider: 'simulated' } }) {
  const template = readFileSync(templatePath, 'utf8');
  const t = brand.texts;
  const values = copyValues(pricing, market);

  function landingHtml() {
    const prices = fromPrices(business, pricing);
    const html = {
      iconLinks, fontPreloads,
      logo: logoHtml(),
      countryOptions: countries.filter(c => c.code !== 'ES').map(c => `<option value="${c.code}">${escapeHtml(c.name)}</option>`).join(''),
      aiSteps: t.ai.steps.map((label, i) => `<li class="ai-step">${[art.stepAsk, art.stepReview, art.stepConfirm][i]}<span class="ai-step-num">${i + 1}</span><span class="ai-step-label">${escapeHtml(label)}</span></li>`).join(''),
      benefits: t.editorial.benefits.map((b, i) => `<li class="benefit">${[art.globePin, art.mountainRope, art.chatRobotCheck][i]}<h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(fill(b.text, values))}</p></li>`).join(''),
      faq: t.faq.map(f => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(fill(f.a, values))}</p></details>`).join(''),
      heroArt: art.heroLandscape,
      travelerRow: firstTravelerRow(t.form, pricing.limits),
      iconPin: art.iconPin, iconCalendar: art.iconCalendar, iconPeople: art.iconPeople, iconRemove: art.iconRemove, iconShield: art.iconShield,
      devTools: devToolsHtml({ brand, pricing, payments }),
    };
    return render(template, {
      html,
      brand,
      t,
      price: { wild: fill(t.plans.from, { price: formatEur(prices.wild) }), wild_plus: fill(t.plans.from, { price: formatEur(prices.wild_plus) }) },
      planNames: { wild: pricing.plans.wild.name, wild_plus: pricing.plans.wild_plus.name },
    });
  }

  return { landingHtml };
}
