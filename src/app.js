// Express app: one JSON endpoint per action. The website and the WebMCP tools both call these,
// sending the same input the tool receives. All rules live in business.js.
import express from 'express';
import { mkdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createBusiness, fail, formatEur } from './business.js';
import { buildPolicyPdf } from './pdf.js';
import { createEmailService } from './email.js';
import { createStripe } from './stripe.js';
import { faviconSvg } from './logo.js';
import { agentsPageBody, createLanding, llmsTxt, pageShell } from './landing.js';
import marketQuotes from '../config/market-quotes.js';
import { COUNTRY_CODES } from '../config/countries.js';
import brand from '../config/brand.config.js';
import pricing from '../config/pricing.config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const STATUS_BY_CODE = {
  QUOTE_NOT_FOUND: 404, ORDER_NOT_FOUND: 404, POLICY_NOT_FOUND: 404,
  ALREADY_PAID: 409, NOT_REVIEWED: 409, INVALID_REVIEW_TOKEN: 409, DETAILS_MISSING: 409,
  PAYMENT_DECLINED: 402, PAYMENT_NOT_COMPLETED: 409, PAYMENT_MISMATCH: 409, CARD_PAYMENT_OFF: 409,
  PAYMENT_ERROR: 502, PAYMENT_PROVIDER_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
};

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// fetchImpl / stripeFetch are only replaced in tests, to simulate Brevo and Stripe without real calls.
export function createApp({ dataDir = join(ROOT, 'data'), env = process.env, fetchImpl = fetch, stripeFetch = fetch, log = console, now } = {}) {
  const pdfDir = join(dataDir, 'policies');
  mkdirSync(pdfDir, { recursive: true });
  const db = openDb(join(dataDir, 'travel.db'));
  const stripe = createStripe({ env, fetchImpl: stripeFetch, log }); // test keys only, else simulated payments
  const business = createBusiness({ db, pricing, brand, pdfDir, buildPdf: buildPolicyPdf, email: createEmailService({ env, brand, fetchImpl }), stripe, ...(now && { now }) });

  const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });
  const countries = COUNTRY_CODES.map(code => ({ code, name: regionNames.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const landing = createLanding({ brand, pricing, business, market: marketQuotes, countries, templatePath: join(ROOT, 'public', 'index.html'), contactEmail: env.CONTACT_EMAIL ?? '' });
  const payments = { provider: stripe.enabled ? 'stripe_test' : 'simulated' };

  const app = express();
  app.set('trust proxy', 'loopback'); // cloudflared runs on this machine and sets X-Forwarded-Proto
  app.disable('x-powered-by');

  // With Stripe on, only what Stripe.js and its card frames need: its script, its frames and its API.
  const csp = [
    "default-src 'self'",
    ...(stripe.enabled ? [
      "script-src 'self' https://js.stripe.com https://*.js.stripe.com",
      'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com',
      // fonts.googleapis.com: Stripe.js fetches the Inter stylesheet (cssSrc) for its card frame from this page.
      "connect-src 'self' https://api.stripe.com https://fonts.googleapis.com",
    ] : []),
    "img-src 'self' data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', // keeps the secret PDF link out of Referer headers
      'Content-Security-Policy': csp,
    });
    next();
  });

  const baseUrl = req => env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

  // ---------- JSON API (one route per WebMCP tool) ----------
  const api = express.Router();
  api.use(express.json({ limit: '20kb' }));
  const route = (path, fn) => api.post(path, async (req, res) => {
    const result = await fn(req.body ?? {}, { baseUrl: baseUrl(req) });
    res.status(result.ok ? 200 : (STATUS_BY_CODE[result.error_code] ?? 400)).json(result);
  });
  route('/get_quote', business.getQuote);
  route('/select_plan', business.selectPlan);
  route('/set_traveler_details', business.setTravelerDetails);
  route('/review_order', business.reviewOrder);
  route('/confirm_payment', business.confirmPayment);
  // Website only (not WebMCP tools): the card payment with the Stripe Payment Element.
  route('/start_card_payment', business.startCardPayment);
  route('/finish_card_payment', business.finishCardPayment);
  route('/get_policy', business.getPolicy);

  // Public settings for the website and the WebMCP tool schemas (no secrets here).
  api.get('/config', (req, res) => {
    res.json({
      ok: true,
      brand: { name: brand.name, logo: brand.logo, claim: brand.claim, claimEs: brand.claimEs, demoBanner: brand.demoBanner, texts: brand.texts },
      limits: pricing.limits,
      plans: Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name])),
      countries,
      // The publishable key is meant to be public (it can't charge anything); the secret key never leaves the server.
      payments: stripe.enabled ? { provider: 'stripe_test', publishable_key: stripe.publishableKey } : { provider: 'simulated' },
    });
  });

  api.use((req, res) => res.status(404).json(fail('UNKNOWN_ENDPOINT', 'Esta dirección de la API no existe.', 'Revisa la dirección; las acciones disponibles son get_quote, select_plan, set_traveler_details, review_order, confirm_payment y get_policy.')));
  app.use('/api', api);

  // ---------- pages and files ----------
  // Brand colours and self-hosted fonts, generated from config/brand.config.js.
  app.get('/brand.css', (req, res) => {
    const c = brand.colors;
    const face = (family, file, weight) => `@font-face{font-family:"${family}";src:url(/fonts/${file}.woff2) format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;
    res.type('text/css').send([
      face(brand.fonts.headings, 'space-grotesk-latin-500-normal', 500),
      face(brand.fonts.headings, 'space-grotesk-latin-700-normal', 700),
      face(brand.fonts.text, 'inter-latin-400-normal', 400),
      face(brand.fonts.text, 'inter-latin-600-normal', 600),
      face(brand.fonts.text, 'inter-latin-700-normal', 700),
      `:root{${Object.entries(c).map(([name, hex]) => `--${name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${hex}`).join(';')};` +
      `--font-headings:"${brand.fonts.headings}",system-ui,sans-serif;--font-text:"${brand.fonts.text}",system-ui,sans-serif}`,
    ].join('\n'));
  });

  // Only these font files are served (from the @fontsource packages).
  const FONT_FILES = {
    'space-grotesk-latin-500-normal.woff2': '@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2',
    'space-grotesk-latin-700-normal.woff2': '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2',
    'inter-latin-400-normal.woff2': '@fontsource/inter/files/inter-latin-400-normal.woff2',
    'inter-latin-600-normal.woff2': '@fontsource/inter/files/inter-latin-600-normal.woff2',
    'inter-latin-700-normal.woff2': '@fontsource/inter/files/inter-latin-700-normal.woff2',
  };
  app.get('/fonts/:file', (req, res) => {
    const path = Object.hasOwn(FONT_FILES, req.params.file) && FONT_FILES[req.params.file];
    if (!path) return res.status(404).type('text').send('No encontrado');
    res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(join(ROOT, 'node_modules', path));
  });

  // Landing (public/index.html filled in on the server).
  app.get(['/', '/index.html'], (req, res) => res.type('html').send(landing.landingHtml()));
  app.get('/favicon.svg', (req, res) => res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(faviconSvg()));

  // Developer & AI-agent page, linked only from the footer.
  app.get('/agentes', (req, res) => {
    res.type('html').send(pageShell({ brand, title: brand.texts.agents.title, body: agentsPageBody({ brand, pricing, payments }), scripts: ['/agentes.js'] }));
  });

  // Every visitor and every agent is welcome: no user-agent is ever blocked (the safety rules live in business.js).
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'));
  app.get('/llms.txt', (req, res) => {
    res.type('text/plain').send(llmsTxt({ brand, pricing, payments, baseUrl: baseUrl(req) }));
  });

  app.get('/condiciones', (req, res) => {
    const plans = Object.values(pricing.plans).map(p => `
      <h2>${escapeHtml(p.name)}</h2>
      <ul>${Object.entries(p.coverage).map(([k, v]) => `<li>${escapeHtml(pricing.coverageLabels[k] ?? k)}: ${escapeHtml(typeof v === 'string' ? v : v > 0 ? formatEur(v) : 'no incluida')}</li>`).join('')}
      <li>Franquicia por siniestro médico: ${escapeHtml(formatEur(p.excess_per_medical_claim_eur))}</li></ul>
      <h3>${escapeHtml(brand.texts.planExclusionsTitle)} (solo ${escapeHtml(p.name)})</h3>
      <ul>${p.extraExclusions.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`).join('');
    res.type('html').send(pageShell({ brand, title: brand.texts.termsTitle, body: `
      <h1>${escapeHtml(brand.texts.termsTitle)}</h1><p>${escapeHtml(brand.texts.termsIntro)}</p>
      <p>Solo viajes que salen de España, de hasta ${pricing.limits.maxTripDays} días, de ${pricing.limits.minTravelers} a ${pricing.limits.maxTravelers} viajeros de ${pricing.limits.minAge} a ${pricing.limits.maxAge} años.</p>
      ${plans}<h2>${escapeHtml(brand.texts.exclusionsTitle)}</h2><ul>${pricing.exclusions.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      <p><a href="/">← ${escapeHtml(brand.texts.back)}</a></p>` }));
  });

  app.get('/poliza/:file', (req, res) => {
    const match = /^([A-Za-z0-9_-]+)\.pdf$/.exec(req.params.file);
    const found = match && business.pdfPathForToken(match[1]);
    if (!found) return res.status(404).type('text').send('No encontrado');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${found.policy_number}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    });
    createReadStream(found.path).on('error', () => res.destroy()).pipe(res);
  });

  // Only the browser polyfill file, not the whole node_modules folder.
  app.get('/vendor/webmcp-polyfill.js', (req, res) => {
    res.sendFile(join(ROOT, 'node_modules/@mcp-b/global/dist/index.iife.js'));
  });

  app.use(express.static(join(ROOT, 'public')));

  // Last-resort error handler: still a structured answer, never a bare crash.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json(fail('INVALID_JSON', 'El cuerpo de la petición no es JSON válido.', 'Envía un objeto JSON correcto.'));
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json(fail('INPUT_TOO_LARGE', 'Los datos enviados son demasiado grandes.', 'Envía solo los campos necesarios.'));
    }
    console.error('Unexpected error:', err);
    res.status(500).json(fail('INTERNAL_ERROR', 'Error interno del servidor.', 'Inténtalo de nuevo en unos segundos. Si se repite, avisa al soporte.'));
  });

  return { app, db, business, stripe: { enabled: stripe.enabled, reason: stripe.reason } };
}
