// Express app: one JSON endpoint per action. The website and the WebMCP tools both call these,
// sending the same input the tool receives. All rules live in business.js.
import express from 'express';
import { mkdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createBusiness, fail } from './business.js';
import { buildPolicyPdf } from './pdf.js';
import { createEmailService } from './email.js';
import { createStripe } from './stripe.js';
import { createEvents } from './events.js';
import { createContact } from './contact.js';
import { metricsPageBody } from './metrics-page.js';
import experiments from '../config/experiments.config.js';
import { timingSafeEqual, createHash } from 'node:crypto';
import { faviconSvg } from './logo.js';
import { agentsPageBody, casePageBody, completeIdPageBody, createLanding, incidentPageBody, legalPageBody, llmsTxt, notFoundBody, pageShell, termsPageBody } from './landing.js';
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
  SEND_LIMIT_REACHED: 429, EMAIL_NOT_CONFIGURED: 409, EMAIL_SEND_FAILED: 502, ID_LINK_INVALID: 404,
};

// fetchImpl / stripeFetch are only replaced in tests, to simulate Brevo and Stripe without real calls.
export function createApp({ dataDir = join(ROOT, 'data'), env = process.env, fetchImpl = fetch, stripeFetch = fetch, log = console, now } = {}) {
  const pdfDir = join(dataDir, 'policies');
  mkdirSync(pdfDir, { recursive: true });
  const db = openDb(join(dataDir, 'travel.db'));
  const stripe = createStripe({ env, fetchImpl: stripeFetch, log }); // test keys only, else simulated payments
  const events = createEvents({ db, ...(now && { now }) });
  const email = createEmailService({ env, brand, fetchImpl });
  const business = createBusiness({ db, pricing, brand, pdfDir, buildPdf: buildPolicyPdf, email, stripe, ...(now && { now }) });
  const contact = createContact({ brand, email, to: env.CONTACT_EMAIL ?? '', log, ...(now && { now }) });

  const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });
  const countries = COUNTRY_CODES.map(code => ({ code, name: regionNames.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const landing = createLanding({ brand, pricing, business, market: marketQuotes, countries, templatePath: join(ROOT, 'public', 'index.html'), contactEmail: env.CONTACT_EMAIL ?? '' });
  const payments = { provider: stripe.enabled ? 'stripe_test' : 'simulated' };

  const app = express();
  app.set('trust proxy', 'loopback'); // tailscaled (Funnel) runs on this machine and sets X-Forwarded-Proto
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
  // Website only (success step): resend the policy email, or forward it to a travel companion; their delivery status.
  route('/send_policy_copy', business.sendPolicyCopy);
  route('/policy_sends', business.policySends);
  // Website only: "Completa tu DNI" page (one-time link from the policy email). The DNI/NIE is never logged.
  route('/complete_holder_id', business.completeHolderId);

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
  // Funnel events (src/events.js): small, validated, rate-limited. Its own tiny body limit.
  app.post('/api/events', express.json({ limit: '2kb' }), (req, res) => {
    const result = events.record(req.body ?? null, { ip: req.ip });
    res.status(result.ok ? 200 : { TOO_MANY_EVENTS: 429, EVENTS_FULL: 507 }[result.error_code] ?? 400).json(result);
  });
  // Contact form (FAQ): its own small body limit; the owner's address stays on the server.
  app.post('/api/contact', express.json({ limit: '8kb' }), async (req, res) => {
    const result = await contact.send(req.body ?? null, { ip: req.ip });
    res.status(result.ok ? 200 : { CONTACT_LIMIT_REACHED: 429, CONTACT_NOT_AVAILABLE: 503, EMAIL_SEND_FAILED: 502 }[result.error_code] ?? 400).json(result);
  });
  app.use('/api', api);

  // ---------- pages and files ----------
  // Brand colours and self-hosted fonts, generated from config/brand.config.js.
  app.get('/brand.css', (req, res) => {
    const c = brand.colors;
    const face = (family, file, weight) => `@font-face{font-family:"${family}";src:url(/fonts/${file}.woff2) format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;
    res.type('text/css').send([
      face(brand.fonts.headings, 'space-grotesk-latin-500-normal', 500),
      face(brand.fonts.headings, 'space-grotesk-latin-600-normal', 600),
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
    'space-grotesk-latin-600-normal.woff2': '@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2',
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
  app.get(['/', '/index.html'], (req, res) => res.type('html').send(landing.landingHtml({ baseUrl: baseUrl(req) })));
  app.get('/favicon.svg', (req, res) => res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(faviconSvg()));

  // Developer & AI-agent page, linked only from the footer.
  app.get('/agentes', (req, res) => {
    res.type('html').send(pageShell({ brand, title: brand.texts.agents.title, body: agentsPageBody({ brand, pricing, payments }), pageClass: 'readable', scripts: ['/agentes.js', '/page-view.js'] }));
  });

  // Every visitor and every agent is welcome: no user-agent is ever blocked (the safety rules live in business.js).
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'));
  app.get('/llms.txt', (req, res) => {
    res.type('text/plain').send(llmsTxt({ brand, pricing, payments, baseUrl: baseUrl(req) }));
  });

  app.get('/si-me-pasa-algo', (req, res) => {
    res.type('html').send(pageShell({ brand, title: brand.texts.incident.pageTitle, body: incidentPageBody({ brand }), scripts: ['/page-view.js'] }));
  });

  for (const [path, kind] of [['/terminos', 'terminos'], ['/privacidad', 'privacidad']]) {
    app.get(path, (req, res) => {
      res.type('html').send(pageShell({ brand, title: brand.texts.legal[kind].pageTitle, body: legalPageBody({ brand, kind, contactEmail: env.CONTACT_EMAIL ?? '' }), pageClass: 'readable', scripts: [...(kind === 'terminos' ? ['/contact.js'] : []), '/page-view.js'] }));
    });
  }

  app.get('/condiciones', (req, res) => {
    res.type('html').send(pageShell({ brand, title: brand.texts.termsTitle, body: termsPageBody({ brand, pricing }), scripts: ['/page-view.js'] }));
  });

  // Hidden page: noindex, not in the menu; linked only from the footer's «Sobre esta demo».
  app.get('/caso', (req, res) => {
    res.set('X-Robots-Tag', 'noindex').type('html').send(pageShell({ brand, title: brand.texts.caso.title, body: casePageBody({ brand, pricing, market: marketQuotes, payments, business }), scripts: ['/page-view.js'], head: '<meta name="robots" content="noindex">' }));
  });

  // /metricas: real data of this demo. noindex (meta + header), not in the sitemap, never cached.
  // ?admin=<METRICS_ADMIN_KEY> shows the "delete test data" form; the key comes only from .env.
  const adminKey = String(env.METRICS_ADMIN_KEY ?? '');
  const hash = v => createHash('sha256').update(String(v)).digest();
  const isAdmin = given => adminKey.length >= 16 && typeof given === 'string' && timingSafeEqual(hash(given), hash(adminKey));
  const metricsPage = (req, res, flash = '') => {
    const admin = isAdmin(req.query.admin) ? { key: req.query.admin } : null;
    if (admin && req.query.borrado === '1') flash = brand.texts.metrics.admin.done;
    if (admin && req.query.confirmar === '1') flash = brand.texts.metrics.admin.needConfirm;
    res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }).type('html')
      .send(pageShell({ brand, title: brand.texts.metrics.title, head: '<meta name="robots" content="noindex, nofollow">', body: metricsPageBody({ brand, data: events.summary(), experiments, admin, flash }) }));
  };
  app.get('/metricas', (req, res) => metricsPage(req, res));
  app.post('/metricas/borrar', express.urlencoded({ extended: false, limit: '1kb' }), (req, res) => {
    const key = req.body?.admin;
    if (!isAdmin(key)) return res.status(403).set('X-Robots-Tag', 'noindex').type('text').send('No autorizado');
    if (req.body.confirm !== 'si') return res.redirect(303, `/metricas?admin=${encodeURIComponent(key)}&confirmar=1`);
    events.reset();
    res.redirect(303, `/metricas?admin=${encodeURIComponent(key)}&borrado=1`);
  });

  // "Completa tu DNI": one-time link (token) tied to one policy with status «DNI pendiente».
  app.get('/poliza/completar/:token', (req, res) => {
    const status = business.idLinkStatus(req.params.token);
    res.status(status.ok ? 200 : 404).set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'private, no-store' }).type('html')
      .send(pageShell({ brand, title: brand.texts.completeId.title, body: completeIdPageBody({ brand, policy_number: status.ok ? status.policy_number : null }), scripts: status.ok ? ['/complete-id.js'] : [] }));
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

  // Any other address: a branded 404 page with the way back to the quote form.
  app.use((req, res) => {
    res.status(404).type('html').send(pageShell({ brand, title: brand.texts.notFound.title, body: notFoundBody({ brand }) }));
  });

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

  return { app, db, business, events, stripe: { enabled: stripe.enabled, reason: stripe.reason } };
}
