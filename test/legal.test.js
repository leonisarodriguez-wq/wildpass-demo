// /terminos and /privacidad (demo documents): content, links where the owner asked for them, and accept_terms covering both documents.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

let server, base, dataDir;
const nbsp = s => s.replace(/ /g, ' ');
const get = async path => nbsp(await (await fetch(`${base}${path}`)).text());

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-legal-'));
  const { app } = createApp({ dataDir, env: { CONTACT_EMAIL: 'owner@example.com' } });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('/terminos: demo notice, banner and every section the owner asked for', async () => {
  const res = await fetch(`${base}/terminos`);
  assert.equal(res.status, 200);
  const html = nbsp(await res.text());
  assert.ok(html.includes('Demo — no es un seguro real'));
  assert.ok(html.includes('Términos y condiciones de uso y contratación (demo)'));
  assert.ok(html.includes('Documento de demostración: no es un contrato real.'));
  for (const id of ['quien', 'que-es', 'contratacion', 'pago', 'cancelacion', 'agentes', 'marca', 'contacto']) assert.ok(html.includes(`<h2 id="${id}">`), id);
  assert.ok(html.includes('sin empresa real') || html.includes('No hay ninguna empresa'));
  assert.ok(html.includes('En una demo no aplican') && html.includes('según la normativa aplicable'));
  assert.ok(html.includes('accept_terms incluye ambos documentos'));
  assert.ok(html.includes('nunca introduce los datos de tu tarjeta'));
  assert.ok(!/cumplimos (con )?(el RGPD|la ley)/i.test(html));
});

test('/privacidad: data asked, DNI masked, anonymous metrics, Stripe test, Brevo, no selling, test data deleted', async () => {
  const res = await fetch(`${base}/privacidad`);
  assert.equal(res.status, 200);
  const html = nbsp(await res.text());
  assert.ok(html.includes('Demo — no es un seguro real'));
  for (const text of ['nombre y fecha de nacimiento', 'DNI o NIE', 'solo en la base de datos de pólizas', 'enmascarado', 'sin cookies', 'Stripe en modo test', 'nuestra web nunca la ve',
    'Brevo', 'No vendemos ni cedemos tus datos', 'opcional para ellos', 'se borrarán al terminar la evaluación', 'formulario de contacto']) assert.ok(html.includes(text), text);
});

test('both documents are linked in the footer of every kind of page; step 3, step 2 and the contact form link as asked', async () => {
  for (const path of ['/', '/condiciones', '/agentes', '/terminos', '/privacidad']) {
    const html = await get(path);
    assert.ok(html.includes('<a href="/terminos">Términos de contratación</a>') && html.includes('<a href="/privacidad">Privacidad</a>'), `footer links on ${path}`);
  }
  const home = await get('/');
  assert.ok(home.includes('Acepto las <a href="/condiciones" target="_blank" rel="noopener">condiciones del seguro</a> y los <a href="/terminos" target="_blank" rel="noopener">términos de contratación</a>'));
  assert.ok(home.includes('<a href="/privacidad">Consulta cómo tratamos tus datos</a>'));
  assert.ok(home.split('Consulta cómo tratamos tus datos').length - 1 >= 1, 'step 2 links to /privacidad (the contact form moved to /terminos)');
  const llms = await get('/llms.txt');
  assert.ok(llms.includes('/terminos') && llms.includes('/privacidad'));
});

test('accept_terms covers both documents: tool description, /agentes and review_order', async () => {
  const agents = await get('/agentes');
  assert.ok(agents.includes('las condiciones del seguro y los términos de contratación'));
  const { buildTools } = await import('../public/webmcp-tools.js');
  const { default: brand } = await import('../config/brand.config.js');
  const { default: pricing } = await import('../config/pricing.config.js');
  const tools = buildTools({ limits: pricing.limits, plans: { wild: 'Wild', wild_plus: 'Wild+', wild_max: 'Wild Max' }, brand, payments: { provider: 'simulated' } });
  const pay = tools.find(t => t.name === 'confirm_payment');
  assert.ok(pay.description.includes('/terminos') && pay.description.includes('/condiciones'));
  assert.ok(pay.inputSchema.properties.accept_terms.description.includes('BOTH'));
});

test('/si-me-pasa-algo: demo page with the four steps, the demo notice, linked from the footer and from «¡Todo listo!»', async () => {
  const res = await fetch(`${base}/si-me-pasa-algo`);
  assert.equal(res.status, 200);
  const html = nbsp(await res.text());
  assert.ok(html.includes('Demo — no es un seguro real'));
  assert.ok(html.includes('Esto es una demo: no es un seguro real.'));
  for (const text of ['Ponte a salvo', 'Ten a mano tu número de póliza', 'Guarda los documentos', 'Cómo se declararía un siniestro', 'facturas', 'informes médicos', 'denuncia',
    'En un seguro real tendrías aquí un teléfono de asistencia 24 h. Esta demo no ofrece asistencia ni cobertura.']) assert.ok(html.toLowerCase().includes(text.toLowerCase()), text);
  assert.ok(!/\d{3} ?\d{2,3} ?\d{2,3} ?\d{2,3}/.test(html.replace(/<[^>]+>/g, ' ')), 'no phone numbers');
  for (const path of ['/', '/condiciones', '/terminos']) assert.ok((await get(path)).includes('<a href="/si-me-pasa-algo">Si me pasa algo</a>'), `footer on ${path}`);
  assert.ok((await get('/')).includes('href="/si-me-pasa-algo" target="_blank" rel="noopener">Qué hacer paso a paso →</a>'), 'link on the success step');
});

test('«Probar con un ejemplo»: secondary button in the quote form, example data from the texts, event example_used accepted', async () => {
  const html = await get('/');
  assert.ok(html.includes('<button type="button" class="link-button example-btn" id="example-fill">Probar con un ejemplo</button>'));
  assert.ok(html.includes('id="example-confirm"') && html.includes('Sí, usar el ejemplo') && html.includes('No, mantener mis datos'));
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.deepEqual(config.texts?.form?.example ?? config.brand?.texts?.form?.example, { destination: 'TH', month: 12, day: 10, tripDays: 15, ages: [35, 38] });
  const ev = await fetch(`${base}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'example_used', session_id: 'abcdefghijklmnop1234', channel: 'web', device: 'desktop' }) });
  assert.equal((await ev.json()).ok, true);
});

test('one example trip everywhere: Tailandia, 10–24 Dec, ages 35 + 38 (button, chat, /agentes, code), price = get_quote', async () => {
  const { default: brand } = await import('../config/brand.config.js');
  const ex = brand.texts.form.example;
  assert.deepEqual([ex.destination, ex.month, ex.day, ex.tripDays, ...ex.ages], ['TH', 12, 10, 15, 35, 38]);
  // Next 10 Dec strictly after today (Madrid): the same rule as app.js, so the example never expires.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const y = Number(today.slice(0, 4));
  const departure = `${y}-12-10` > today ? `${y}-12-10` : `${y + 1}-12-10`;
  const ret = `${departure.slice(0, 4)}-12-24`;
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.ok(js.includes('ex.month') && js.includes('addDays(departure, ex.tripDays - 1)'));
  assert.ok(!/2026-12-10/.test(js), 'no fixed example date in app.js');
  const agents = await get('/agentes');
  assert.ok(agents.includes(`departure_date: &#39;${departure}&#39;, return_date: &#39;${ret}&#39;`), 'code example dates');
  assert.ok(agents.includes('del 10 al 24 de diciembre'));
  const home = await get('/');
  assert.ok(home.includes('Necesito un seguro para Tailandia, del 10 al 24 de diciembre, 2 personas de 35 y 38 años.'));
  const res = await fetch(`${base}/api/get_quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ origin_country: 'ES', destination_country: 'TH', departure_date: departure, return_date: ret, traveler_ages: [35, 38] }) });
  const q = await res.json();
  assert.equal(q.ok, true);
  assert.equal(q.trip.days, 15);
  const plus = q.plans.find(p => p.plan === 'wild_plus').total_price_eur;
  const shown = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(plus).replace(/\s/g, ' ');
  assert.ok(home.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').includes(`Wild+: ${shown.replace(/\s/g, ' ')} para los dos`), `the chat shows Wild+ = ${shown}`);
  assert.equal(plus, 170.16);
});
