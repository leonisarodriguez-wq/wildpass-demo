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
  assert.ok(home.split('Consulta cómo tratamos tus datos').length - 1 >= 2, 'step 2 and the contact form both link to /privacidad');
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
