// Contact form (FAQ "¿Cómo contacto con vosotros?"): validated here, sent with Brevo to CONTACT_EMAIL (.env).
// The owner's address never reaches the browser. Limits: per browser session and per IP, kept in memory.
// A filled honeypot field ("website", hidden from people) is answered ok and silently dropped.
import { fail, cleanName, cleanEmail } from './business.js';

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_MESSAGE = 2000;
const PER_SESSION = 3; // messages per browser session per day
const PER_IP = 10; // messages per IP per day
const DAY_MS = 86_400_000;

export function createContact({ brand, email, to, now = () => new Date(), log = console }) {
  const c = brand.texts.contact;
  const sent = new Map(); // key → timestamps (ms)

  function recent(key, at) {
    const list = (sent.get(key) ?? []).filter(t => at - t < DAY_MS);
    sent.set(key, list);
    return list;
  }

  async function send(input, { ip = '' } = {}) {
    const body = input && typeof input === 'object' ? input : {};
    if (typeof body.website === 'string' && body.website.trim()) return { ok: true }; // a bot filled the honeypot
    const fields = [];
    const name = cleanName(body.name);
    if (!name) fields.push('name');
    const from = cleanEmail(body.email);
    if (!from) fields.push('email');
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 2 || message.length > MAX_MESSAGE) fields.push('message');
    if (body.consent !== true) fields.push('consent');
    if (typeof body.session_id !== 'string' || !SESSION_RE.test(body.session_id)) fields.push('session_id');
    if (fields.length) {
      return fail('CONTACT_INVALID', 'Falta algún dato del formulario o no es correcto.', `Revisa: ${fields.join(', ')}. El mensaje puede tener hasta ${MAX_MESSAGE} caracteres.`, { fields });
    }
    if (!to || !email.configured) return fail('CONTACT_NOT_AVAILABLE', 'Ahora mismo no podemos recibir mensajes.', 'Inténtalo más tarde.');

    const at = now().getTime();
    const bySession = recent(`s:${body.session_id}`, at);
    const byIp = recent(`ip:${ip}`, at);
    if (bySession.length >= PER_SESSION || byIp.length >= PER_IP) {
      return fail('CONTACT_LIMIT_REACHED', 'Has enviado demasiados mensajes seguidos.', 'Espera un rato antes de enviar otro.');
    }

    const subject = c.subject.replace('{name}', name);
    const textContent = `${c.demoLine}\n\n${c.emailIntro}\n\n${name} <${from}>\n\n${message}\n`;
    const htmlContent = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#0B1F3A">`
      + `<p style="background:#D7263D;color:#fff;font-weight:bold;text-align:center;padding:8px">${escapeHtml(c.demoLine)}</p>`
      + `<p>${escapeHtml(c.emailIntro)}</p><p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(from)}&gt;</p>`
      + `<p style="white-space:pre-wrap">${escapeHtml(message)}</p></body></html>`;
    const result = email.sendEmail({ to: [{ email: to }], subject, htmlContent, textContent, replyTo: { email: from, name } });
    try {
      await result.done;
    } catch (err) {
      log.error(`Contact email failed: ${err.message}`);
      return fail('EMAIL_SEND_FAILED', 'No hemos podido enviar el mensaje.', 'Vuelve a intentarlo en unos minutos.');
    }
    bySession.push(at);
    byIp.push(at);
    return { ok: true };
  }

  return { send };
}
