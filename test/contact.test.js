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

test('FAQ: «¿No encuentras tu respuesta?» + secondary «Escríbenos» button outside the folded list, going to /terminos#contacto', async () => {
  const home = await (await fetch(`${base}/`)).text();
  const faq = home.slice(home.indexOf('id="preguntas"'), home.indexOf('class="final-cta"'));
  const list = faq.slice(faq.indexOf('id="faq-list"'), faq.indexOf('class="faq-more"'));
  assert.ok(faq.includes('<p class="faq-more-title">¿No encuentras tu respuesta?</p><a class="secondary button-link" href="/terminos#contacto">Escríbenos</a>'));
  assert.ok(!home.includes('¿Tienes otra pregunta?'));
  assert.ok(faq.indexOf('class="faq-more"') > faq.indexOf('id="faq-list"') && !list.includes('faq-more'), 'after the list, not inside it');
  assert.match(await (await fetch(`${base}/terminos`)).text(), /<h2 id="contacto">Contacto<\/h2>/);
});

test('contact form: yellow primary button, success block in the same card, and the texts the owner asked for', async () => {
  const html = await (await fetch(`${base}/terminos`)).text();
  const card = html.slice(html.indexOf('id="contact-card"'));
  assert.match(card, /<button type="submit" class="primary" id="contact-send">Enviar mensaje<\/button>/);
  assert.ok(card.includes('id="contact-success"') && card.includes('aria-live="polite"') && card.includes('hidden'));
  assert.ok(card.includes('¡Mensaje enviado!') && card.includes('Enviar otra consulta') && card.includes('Volver a Wildpass'));
  assert.match(card, /id="contact-again">Enviar otra consulta<\/button>/);
  assert.ok(card.includes('data-success="Te contestaremos a {email} lo antes posible. Recuerda que esto es una demo."'));
  assert.ok(card.includes('data-generic="No se ha podido enviar el mensaje. Inténtalo de nuevo en unos minutos."'));
  assert.ok(card.includes('data-sending="Enviando…"'));
});

test('no page, email or llms.txt tells the reader to call a phone number', async () => {
  for (const path of ['/', '/terminos', '/privacidad', '/condiciones', '/si-me-pasa-algo', '/agentes', '/llms.txt']) {
    const text = (await (await fetch(`${base}${path}`)).text()).replace(/<[^>]*>/g, ' ');
    assert.ok(!/Llama antes de acudir|llama a los servicios|Llama a un teléfono/i.test(text), path);
    assert.ok(!/\[Teléfono/i.test(text), path);
  }
});

test('«Contacto» in the menu (after «Condiciones») and in the footer of every page, going to /terminos#contacto', async () => {
  for (const path of ['/', '/condiciones', '/terminos', '/privacidad', '/agentes', '/si-me-pasa-algo', '/no-existe']) {
    const html = await (await fetch(`${base}${path}`)).text();
    assert.ok(html.includes('<a href="/condiciones">Condiciones</a></li><li class="nav-contact"><a href="/terminos#contacto">Contacto</a></li>'), `menu on ${path}`);
    assert.ok(html.includes('<a href="/privacidad">Privacidad</a><a href="/terminos#contacto">Contacto</a>'), `footer on ${path}`);
  }
});

test('/terminos «Contacto»: one intro text and one privacy link, no repeated sentence', async () => {
  const html = await (await fetch(`${base}/terminos`)).text();
  const section = html.slice(html.indexOf('<h2 id="contacto">'), html.indexOf('<p><a href="/">←'));
  assert.equal(section.split('Escríbenos con este formulario').length - 1, 1);
  assert.ok(!section.includes('Para saber cómo tratamos tus datos'));
  assert.equal(section.split('href="/privacidad"').length - 1, 1);
  assert.ok(section.includes('Consulta cómo tratamos tus datos'));
});

test('agents wording: wait sentence in bold before the tool list, one DNI sentence, reload truth, assistants note and llms link in the head', async () => {
  const wait = 'Las herramientas se registran 1–2 segundos después de cargar la página: espera a que navigator.modelContext las liste antes de concluir que no existen.';
  const dni = 'El DNI/NIE es opcional. No lo inventes. Usa el DNI de prueba 12345678Z solo si la persona te lo indica.';
  const agentes = await (await fetch(`${base}/agentes`)).text();
  assert.ok(agentes.includes(`<strong>${wait}</strong>`) && agentes.indexOf(wait) < agentes.indexOf('class="dev-tool-list"'));
  assert.ok(agentes.includes(dni) && !agentes.includes('dato de prueba, no es de nadie'));
  assert.ok(agentes.includes('Recargar la página no borra nada en el servidor: quote_id (válido 7 días)'));
  const llms = await (await fetch(`${base}/llms.txt`)).text();
  assert.ok(llms.includes(`**${wait}**`) && llms.indexOf(wait) < llms.indexOf('1. get_quote'));
  assert.ok(llms.includes(dni) && llms.includes('Recargar la página no borra nada en el servidor'));
  const home = await (await fetch(`${base}/`)).text();
  assert.ok(home.includes('<link rel="alternate" type="text/plain" href="/llms.txt" title="Instrucciones para agentes de IA">'));
  assert.ok(home.includes('Instrucciones para asistentes: <a href="/agentes">/agentes</a> · <a href="/llms.txt">/llms.txt</a>'));
  const caso = await (await fetch(`${base}/caso`)).text();
  for (const s of ['Un servidor MCP remoto o endpoint HTTP con el mismo motor, para asistentes sin navegador.', 'Estado del pedido recuperable con el order_id.', 'Resumen en texto plano en review_order, listo para mostrar a la persona.']) assert.ok(caso.includes(s), s);
});
