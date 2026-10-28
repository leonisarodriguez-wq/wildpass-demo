// Express app: one JSON endpoint per action. The website and the WebMCP tools both call these,
// sending the same input the tool receives. All rules live in business.js.
import express from 'express';
import { mkdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createBusiness, fail, formatEur } from './business.js';
import { buildPolicyPdf } from './pdf.js';
import { createEmailSender } from './email.js';
import { COUNTRY_CODES } from '../config/countries.js';
import brand from '../config/brand.config.js';
import pricing from '../config/pricing.config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const STATUS_BY_CODE = {
  QUOTE_NOT_FOUND: 404, ORDER_NOT_FOUND: 404, POLICY_NOT_FOUND: 404,
  ALREADY_PAID: 409, NOT_REVIEWED: 409, INVALID_REVIEW_TOKEN: 409, DETAILS_MISSING: 409,
  INTERNAL_ERROR: 500,
};

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createApp({ dataDir = join(ROOT, 'data'), env = process.env } = {}) {
  const pdfDir = join(dataDir, 'policies');
  mkdirSync(pdfDir, { recursive: true });
  const db = openDb(join(dataDir, 'travel.db'));
  const business = createBusiness({ db, pricing, brand, pdfDir, buildPdf: buildPolicyPdf, sendEmail: createEmailSender({ env, brand }) });

  const app = express();
  app.set('trust proxy', 'loopback'); // cloudflared runs on this machine and sets X-Forwarded-Proto
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', // keeps the secret PDF link out of Referer headers
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
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
  route('/get_policy', business.getPolicy);

  // Public settings for the website and the WebMCP tool schemas (no secrets here).
  api.get('/config', (req, res) => {
    const names = new Intl.DisplayNames(['es'], { type: 'region' });
    res.json({
      ok: true,
      brand: { name: brand.name, demoBanner: brand.demoBanner, texts: brand.texts },
      limits: pricing.limits,
      plans: Object.fromEntries(Object.entries(pricing.plans).map(([id, p]) => [id, p.name])),
      countries: COUNTRY_CODES.map(code => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    });
  });

  api.use((req, res) => res.status(404).json(fail('UNKNOWN_ENDPOINT', 'Esta dirección de la API no existe.', 'Revisa la dirección; las acciones disponibles son get_quote, select_plan, set_traveler_details, review_order, confirm_payment y get_policy.')));
  app.use('/api', api);

  // ---------- pages and files ----------
  app.get('/brand.css', (req, res) => {
    res.type('text/css').send(`:root{--primary:${brand.colors.primary};--banner:${brand.colors.banner};--banner-text:${brand.colors.bannerText}}`);
  });

  app.get('/condiciones', (req, res) => {
    const plans = Object.values(pricing.plans).map(p => `
      <h2>${escapeHtml(p.name)}</h2>
      <ul>${Object.entries(p.coverage).map(([k, v]) => `<li>${escapeHtml(pricing.coverageLabels[k] ?? k)}: ${escapeHtml(typeof v === 'string' ? v : v > 0 ? formatEur(v) : 'no incluida')}</li>`).join('')}
      <li>Franquicia por siniestro médico: ${escapeHtml(formatEur(p.excess_per_medical_claim_eur))}</li></ul>`).join('');
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(brand.texts.termsTitle)}</title><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/style.css"></head>
      <body><div class="banner">${escapeHtml(brand.demoBanner)}</div><main>
      <h1>${escapeHtml(brand.texts.termsTitle)}</h1><p>${escapeHtml(brand.texts.termsIntro)}</p>
      <p>Solo viajes que salen de España, de hasta ${pricing.limits.maxTripDays} días, de ${pricing.limits.minTravelers} a ${pricing.limits.maxTravelers} viajeros de ${pricing.limits.minAge} a ${pricing.limits.maxAge} años.</p>
      ${plans}<h2>Exclusiones (ambos planes)</h2><ul>${pricing.exclusions.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      <p><a href="/">← ${escapeHtml(brand.texts.back)}</a></p></main></body></html>`);
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

  return { app, db, business };
}
