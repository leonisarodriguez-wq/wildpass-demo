// Server-side rendering of the public pages: landing (public/index.html template) and the shared page shell
// (terms page). Texts come from the brand config, numbers from the pricing config and the pricing
// engine, so the copy can never disagree with the product. Pages arrive complete: no text pops in later.
import { buildTools } from '../public/webmcp-tools.js';
import { readFileSync } from 'node:fs';
import { formatEur } from './business.js';
import { logoHtml } from './logo.js';
import * as art from './illustrations.js';
import { heroScene, miniScene, routeStrip, sceneFor, sceneSprite } from './scenes.js';
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
    wildBaggageDelay: formatEur(wild.coverage.baggage_delay_eur),
    plusBaggageDelay: formatEur(plus.coverage.baggage_delay_eur),
    wildExcess: formatEur(wild.excess_per_medical_claim_eur),
    plusMedEurope: formatEur(plus.coverage.medical_expenses_europe_eur),
    plusMedWorld: formatEur(plus.coverage.medical_expenses_rest_of_world_eur),
    plusBaggage: formatEur(plus.coverage.baggage_theft_damage_eur),
    plusCancellation: formatEur(plus.coverage.cancellation_per_traveler_eur),
    wildDental: formatEur(wild.coverage.urgent_dental_eur),
    plusDental: formatEur(plus.coverage.urgent_dental_eur),
    wildLiability: formatEur(wild.coverage.civil_liability_eur),
    plusLiability: formatEur(plus.coverage.civil_liability_eur),
    repatriation: plus.coverage.repatriation,
    ...pricing.limits, // maxTripDays, minTravelers, maxTravelers, minAge, maxAge
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
    <p class="footer-links"><a href="/condiciones">${escapeHtml(t.footerTerms)}</a><a href="/agentes">${escapeHtml(t.footerAgents)}</a><span>${escapeHtml(t.footerWebmcp)}</span></p>
  </div></footer>`;
}

// Demo banner: the full sentence, and a one-line short version for phones (CSS shows one of them).
export function bannerHtml(brand) {
  return `<div class="banner" id="demo-banner"><span class="banner-long">${escapeHtml(brand.siteBanner)}</span><span class="banner-short">${escapeHtml(brand.siteBannerShort)}</span></div>`;
}

// "Saltar al contenido": the first thing a keyboard user reaches on every page (visible only when focused).
export const skipLinkHtml = brand => `<a class="skip-link" href="#contenido">${escapeHtml(brand.texts.nav.skip)}</a>`;

// Site header on every page: logo, "Preguntas frecuentes", "Agentes", "Condiciones" and "Ver mi precio".
// Phones and tablets: the links fold into a simple "Menú" panel (public/site-nav.js). On the landing the links stay on the page.
export function headerHtml(brand, { home = false } = {}) {
  const n = brand.texts.nav;
  const root = home ? '' : '/';
  return `<header class="site-header"><div class="wrap header-bar">${logoHtml()}
  <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="site-nav" data-open="${escapeHtml(n.menu)}" data-close="${escapeHtml(n.close)}">${escapeHtml(n.menu)}</button>
  <nav class="site-nav" id="site-nav" aria-label="${escapeHtml(n.label)}">
    <ul><li><a href="${root}#preguntas" data-open-faq>${escapeHtml(n.faq)}</a></li><li><a href="/agentes">${escapeHtml(n.agents)}</a></li><li><a href="/condiciones">${escapeHtml(n.terms)}</a></li></ul>
    <a class="primary nav-cta" href="${root}#quote-form"${home ? ' data-focus-form' : ''}>${escapeHtml(n.cta)}</a>
  </nav>
</div></header>`;
}

// Shared shell for simple pages (terms, /agentes, 404).
export function pageShell({ brand, title, body, scripts = [] }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(brand.name)}</title>${iconLinks}${fontPreloads}<link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/style.css"></head>
<body>${skipLinkHtml(brand)}${bannerHtml(brand)}${headerHtml(brand)}
<main class="page" id="contenido" tabindex="-1"><div class="wrap"><div class="card-page">${body}</div></div></main>
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
export function agentsPageBody({ brand, pricing, payments }) {
  const t = brand.texts;
  const g = t.agents;
  const tools = realTools({ brand, pricing, payments });
  const pay = tools.find(tool => tool.name === 'confirm_payment');
  const rules = (pay.inputSchema.required ?? []).filter(f => pay.rulesEs[f]);
  return `<h1>${escapeHtml(g.title)}</h1>
    <p>${escapeHtml(g.intro)}</p>
    <h2>${escapeHtml(g.webmcpTitle)}</h2>
    <p>${escapeHtml(g.webmcpText)}</p>
    <h2>${escapeHtml(g.promptTitle)}</h2>
    <figure class="prompt-card">
      <figcaption class="prompt-label">${escapeHtml(t.ai.promptLabel)}</figcaption>
      <blockquote class="prompt-text" id="example-prompt">${escapeHtml(t.ai.examplePrompt)}</blockquote>
      <button type="button" class="secondary copy-prompt" id="copy-prompt" aria-label="${escapeHtml(t.ai.copyLabel)}" data-copied="${escapeHtml(t.ai.copied)}">${escapeHtml(t.ai.copy)}</button>
      <span class="sr-only" role="status" id="copy-status"></span>
    </figure>
    <p class="ai-note">${escapeHtml(t.ai.compatNote)}</p>
    <h2>${escapeHtml(fill(g.toolsTitle, { count: tools.length }))}</h2>
    <p>${escapeHtml(g.where)}</p>
    <h2>${escapeHtml(g.providerTitle)}</h2>
    <p id="webmcp-provider" data-native="${escapeHtml(g.providerNative)}" data-polyfill="${escapeHtml(g.providerPolyfill)}">${escapeHtml(g.providerChecking)}</p>
    <ol class="dev-tool-list">${tools.map(tool => `<li><code>${escapeHtml(tool.name)}</code> ${escapeHtml(tool.es)}</li>`).join('')}</ol>
    <h2>${escapeHtml(g.rulesTitle)}</h2>
    <p>${escapeHtml(g.rulesIntro)}</p>
    <ul class="dev-rules">${rules.map(f => `<li><code>${escapeHtml(f)}</code>: ${escapeHtml(pay.rulesEs[f])}</li>`).join('')}</ul>
    <p><a href="/">← ${escapeHtml(t.back)}</a></p>`;
}

// /llms.txt: plain text for AI agents (what Wildpass is, the 6 tools in order, where the instructions are).
export function llmsTxt({ brand, pricing, payments, baseUrl }) {
  const l = brand.texts.llms;
  const tools = realTools({ brand, pricing, payments });
  const pay = tools.find(tool => tool.name === 'confirm_payment');
  const rules = (pay.inputSchema.required ?? []).filter(f => pay.rulesEs[f]);
  return [
    `# ${brand.name}`, '', `> ${brand.siteBanner}`, '', l.intro, '',
    `## ${l.howTitle}`, '', fill(l.how, { url: `${baseUrl}/` }), '',
    ...tools.flatMap((tool, i) => [`${i + 1}. ${tool.name}: ${tool.es}`, ...(tool === pay ? rules.map(f => `   - ${f}: ${pay.rulesEs[f]}`) : [])]), '',
    l.confirm, '',
    `## ${l.moreTitle}`, '', `- [${l.agentsLink}](${baseUrl}/agentes)`, `- [${l.termsLink}](${baseUrl}/condiciones)`, '',
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
  const cards = w.scenarios.map(sc => {
    let figure = '';
    if (sc.figure) {
      const amount = pricing.plans[sc.figure.plan].coverage[sc.figure.key];
      if (typeof amount !== 'number' || amount <= 0) throw new Error(`What-if ${sc.id}: no limit ${sc.figure.key} in ${sc.figure.plan}`);
      figure = `<p class="whatif-figure"><span class="count" data-to="${amount}">${escapeHtml(formatEur(amount))}</span> <span class="whatif-figure-label">${escapeHtml(sc.figureLabel)}</span></p>`;
    }
    const verdicts = Object.entries(sc.plans).map(([plan, v]) => `<li class="verdict ${v.ok ? 'is-ok' : 'is-no'}"><strong>${escapeHtml(pricing.plans[plan].name)}</strong> <span class="verdict-state">${escapeHtml(v.ok ? w.covered : w.notCovered)}</span><span class="verdict-text">${escapeHtml(fill(v.text, values))}</span></li>`).join('');
    return `<li class="whatif-card" id="wi-${sc.id}"><h3>${escapeHtml(sc.title)}</h3>${figure}<ul class="verdicts">${verdicts}</ul><p class="whatif-text">${escapeHtml(fill(sc.text, values))}</p></li>`;
  }).join('');
  return carouselHtml({ id: 'whatif-strip', label: w.listLabel, prev: w.prev, next: w.next, items: cards })
    + `<p class="wrap carousel-hint">${escapeHtml(fill(w.hint, { count: w.scenarios.length }))}</p>`;
}

// FAQ answers: escaped text, then [text](#quote-form) → a link to the quote form, {contactLink} → a mailto link.
function faqHtml({ brand, values, contactEmail }) {
  const t = brand.texts;
  const contact = contactEmail ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : '';
  return t.faq.filter(f => !f.needsContact || contactEmail).map(f => {
    const answer = escapeHtml(fill(f.a, values))
      .replace(/\[([^\]]+)\]\(#quote-form\)/g, '<a href="#quote-form" data-focus-form>$1</a>')
      .replace('{contactLink}', contact);
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
    const price = formatEur(business.pricePerTravelerCents(zoneOf(code, pricing), 'wild', 7, adult) / 100);
    return `<li><button type="button" class="dest-card" data-country="${code}" aria-label="${escapeHtml(fill(d.cardLabel, { name: country.name, price }))}">`
      + `${miniScene(sceneFor(code, pricing))}<span class="dest-name">${escapeHtml(country.name)}</span><span class="dest-price">${escapeHtml(fill(d.price, { price }))}</span></button></li>`;
  }).join('');
  return carouselHtml({ id: 'dest-strip', prev: d.prev, next: d.next, items });
}

export function createLanding({ brand, pricing, business, market, countries, templatePath, contactEmail = '' }) {
  const template = readFileSync(templatePath, 'utf8');
  const t = brand.texts;
  const values = copyValues(pricing, market);

  function landingHtml() {
    const prices = fromPrices(business, pricing);
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
      benefits: t.editorial.benefits.map((b, i) => `<li class="benefit">${[art.globePin, art.mountainRope, art.shieldCheck][i]}<h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(fill(b.text, values))}</p></li>`).join(''),
      faq: faqHtml({ brand, values, contactEmail }),
      travelerRow: firstTravelerRow(t.form, pricing.limits),
      maxTravelersNote: escapeHtml(fill(t.form.maxTravelersNote, pricing.limits)),
      iconPin: art.iconPin, iconCalendar: art.iconCalendar, iconPeople: art.iconPeople, iconRemove: art.iconRemove, iconCard: art.iconCard,
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
