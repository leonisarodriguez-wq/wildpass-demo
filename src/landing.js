// Server-side rendering of the public pages: landing (public/index.html template), /metodologia and the
// shared page shell. Texts come from the brand config, numbers from the pricing config and the pricing
// engine, so the copy can never disagree with the product. Pages arrive complete: no text pops in later.
import { readFileSync } from 'node:fs';
import { formatEur } from './business.js';
import { dateEs } from './format.js';
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
    <p class="footer-links"><a href="/condiciones">${escapeHtml(t.footerTerms)}</a><a href="/metodologia">${escapeHtml(t.footerMethodology)}</a><span>${escapeHtml(t.footerWebmcp)}</span></p>
  </div></footer>`;
}

// Shared shell for simple pages (terms, methodology).
export function pageShell({ brand, title, body }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(brand.name)}</title>${iconLinks}${fontPreloads}<link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/style.css"></head>
<body><div class="banner">${escapeHtml(brand.siteBanner)}</div>
<header class="site-header"><div class="wrap">${logoHtml()}</div></header>
<main class="page"><div class="wrap"><div class="card-page">${body}</div></div></main>
${footerHtml(brand)}</body></html>`;
}

export function createLanding({ brand, pricing, business, market, countries, templatePath }) {
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
    };
    return render(template, {
      html,
      brand,
      t,
      price: { wild: fill(t.plans.from, { price: formatEur(prices.wild) }), wild_plus: fill(t.plans.from, { price: formatEur(prices.wild_plus) }) },
      methodologyLine: fill(t.methodologyLine, values),
      firstAgeLabel: fill(t.form.ageLabel, { n: 1 }),
      planNames: { wild: pricing.plans.wild.name, wild_plus: pricing.plans.wild_plus.name },
    });
  }

  function methodologyHtml() {
    const m = t.methodology;
    const letters = market.insurers.map((_, i) => String.fromCharCode(65 + i));
    const median = xs => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1; // inclusive, like the product
    const byLabel = Object.fromEntries(market.trips.map(trip => [trip.label, trip]));
    const fmt = n => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let borrowed = false;

    const rows = market.trips.flatMap(trip => Object.keys(pricing.plans).map(plan => {
      const cells = market.insurers.map(insurer => {
        const own = trip.quotes[insurer]?.[market.comparable[plan][insurer]];
        if (own !== undefined) return { value: own, mark: '' };
        const other = byLabel[trip.borrowFrom]?.quotes[insurer]?.[market.comparable[plan][insurer]];
        if (other !== undefined) { borrowed = true; return { value: other, mark: '*' }; }
        return null;
      });
      const prices = cells.filter(Boolean).map(c => c.value);
      const ours = business.pricePerTravelerCents(trip.zone, plan, days(trip.from, trip.to), trip.age) / 100;
      const diff = (ours / median(prices) - 1) * 100;
      return `<tr><th scope="row">${escapeHtml(trip.label)}<span class="muted"> · ${escapeHtml(fill(m.days, { n: days(trip.from, trip.to) }))}</span></th><td>${escapeHtml(pricing.plans[plan].name)}</td>
        ${cells.map(c => `<td class="num">${c ? `${fmt(c.value)}${c.mark}` : '—'}</td>`).join('')}
        <td class="num">${fmt(median(prices))}</td><td class="num strong">${fmt(ours)} <span class="muted">(${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1).replace('.', ',')} %)</span></td></tr>`;
    })).join('');

    const values2 = { ...values, date: dateEs(market.collectedOn) };
    const body = `<h1>${escapeHtml(m.title)}</h1>
      <p>${escapeHtml(fill(m.intro, values2))}</p>
      <h2>${escapeHtml(m.methodTitle)}</h2><ul>${m.method.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      <h2>${escapeHtml(m.tableTitle)}</h2>
      <div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(m.tableTitle)}"><table class="data-table">
        <thead><tr><th scope="col">${escapeHtml(m.tableTrip)}</th><th scope="col">${escapeHtml(m.tablePlan)}</th>${letters.map(l => `<th scope="col" class="num">${escapeHtml(fill(m.tableInsurer, { letter: l }))}</th>`).join('')}<th scope="col" class="num">${escapeHtml(m.tableMedian)}</th><th scope="col" class="num">${escapeHtml(m.tableOurs)}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="muted">${escapeHtml([m.tableNote, borrowed && m.borrowedNote, m.perPersonNote].filter(Boolean).join(' '))}</p>
      <h2>${escapeHtml(m.assumptionsTitle)}</h2><ul>${m.assumptions.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      <p><a href="/">${escapeHtml(m.back)}</a></p>`;
    return pageShell({ brand, title: m.title, body });
  }

  return { landingHtml, methodologyHtml };
}
