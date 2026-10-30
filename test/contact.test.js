// Contact form (FAQ): the owner's address never reaches the page, the message reaches Brevo with reply-to,
// bad input and the honeypot are handled, and each browser session has a limit. Brevo is faked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

const OWNER = 'owner-contact@example.com';
const sent = [];
let server, base, dataDir;

async function fakeFetch(url, init = {}) {
  if (String(url).endsWith('/smtp/email')) {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ messageId: '<m@example.com>' }), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-contact-'));
  const { app } = createApp({ dataDir, env: { BREVO_API_KEY: 'xkeysib-test', SENDER_EMAIL: 'polizas@example.com', CONTACT_EMAIL: OWNER }, fetchImpl: fakeFetch });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const post = async body => {
  const res = await fetch(`${base}/api/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};
const good = { name: 'Ana Prueba', email: 'ana@example.com', message: 'Hola, una pregunta.', consent: true, website: '', session_id: 'sessionAAAAAAAAAAAAAAAA' };

test('the contact form lives in /terminos → Contacto (not in the FAQ), and no page shows the owner address', async () => {
  const html = await (await fetch(`${base}/terminos`)).text();
  assert.ok(html.indexOf('<h2 id="contacto">') < html.indexOf('id="contact-form"'), 'the form is inside the Contacto section');
  assert.ok(html.includes('id="contact-website"'), 'honeypot field');
  assert.ok(html.includes('<script type="module" src="/contact.js"></script>'));
  const home = await (await fetch(`${base}/`)).text();
  assert.ok(!home.includes('id="contact-form"') && !home.includes('¿Cómo contacto con vosotros?'), 'no contact form or question in the FAQ');
  const privacy = await (await fetch(`${base}/privacidad`)).text();
  assert.ok(privacy.includes('href="/terminos#contacto"') && !privacy.includes('id="contact-form"'));
  for (const page of [html, home, privacy]) assert.ok(!page.includes(OWNER) && !page.includes('mailto:'), 'no owner address in the page');
});

test('a valid message goes to CONTACT_EMAIL with reply-to and the demo line', async () => {
  const { status, json } = await post(good);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  const mail = sent.at(-1);
  assert.deepEqual(mail.to, [{ email: OWNER }]);
  assert.equal(mail.replyTo.email, 'ana@example.com');
  assert.ok(mail.htmlContent.includes('Demo — no es un seguro real') && mail.textContent.includes('Hola, una pregunta.'));
  assert.ok(!JSON.stringify(json).includes(OWNER), 'the answer never shows the owner address');
});

test('bad input is refused field by field; consent is required', async () => {
  const { status, json } = await post({ ...good, email: 'nope', consent: false, message: '' });
  assert.equal(status, 400);
  assert.equal(json.error_code, 'CONTACT_INVALID');
  assert.deepEqual(json.fields, ['email', 'message', 'consent']);
});

test('the honeypot is answered ok but nothing is sent', async () => {
  const before = sent.length;
  const { json } = await post({ ...good, website: 'http://spam.example.com' });
  assert.equal(json.ok, true);
  assert.equal(sent.length, before);
});

test('each session can send 3 messages a day', async () => {
  const session_id = 'sessionBBBBBBBBBBBBBBBB';
  for (let i = 0; i < 3; i++) assert.equal((await post({ ...good, session_id })).json.ok, true);
  const { status, json } = await post({ ...good, session_id });
  assert.equal(status, 429);
  assert.equal(json.error_code, 'CONTACT_LIMIT_REACHED');
});
