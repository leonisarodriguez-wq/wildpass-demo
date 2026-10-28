// Email through Brevo's HTTP API: sending the policy, and reading what happened to it afterwards.
// Reads BREVO_API_KEY and SENDER_EMAIL from the environment (.env). Without them: "not_configured".
// The API key is only ever sent to api.brevo.com in a header; it never appears in results or logs.

const BREVO = 'https://api.brevo.com/v3';

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Email body with inline styles (email clients ignore stylesheets). Same colour rules as the website.
// Gmail and others block SVG, so the logo symbol is a PNG served by this site (same address as the PDF).
function emailHtml({ brand, name, policy_number, pdf_url }) {
  const c = brand.colors;
  const font = 'Inter, Arial, Helvetica, sans-serif';
  const heading = "'Space Grotesk', Arial, Helvetica, sans-serif";
  const logoUrl = new URL('/brand/logo-symbol-email.png', pdf_url).href;
  return `
  <div style="background:${c.sky};padding:0 0 24px;margin:0;font-family:${font};color:${c.night}">
    <div style="background:${c.red};color:${c.white};padding:10px;font-weight:bold;text-align:center">${escapeHtml(brand.demoBanner)}</div>
    <div style="max-width:600px;margin:0 auto">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:${c.white};width:100%;border-collapse:collapse"><tr>
        <td style="padding:14px 8px 14px 20px;width:48px"><img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="" style="display:block;border:0"></td>
        <td style="padding:14px 20px 14px 0">
          <div style="font-family:${heading};font-size:26px;font-weight:bold;color:${c.night};line-height:1">${escapeHtml(brand.logo.wordmark)}</div>
          <div style="font-size:12px;font-weight:600;color:${c.turquoiseText};margin-top:4px">${escapeHtml(brand.logo.tagline)}</div>
        </td>
      </tr></table>
      <div style="background:${c.turquoise};color:${c.white};padding:20px">
        <p style="font-family:${heading};font-size:22px;font-weight:bold;margin:0 0 6px;color:${c.white}">${escapeHtml(brand.claim)}</p>
        <p style="margin:0;color:${c.white}">${escapeHtml(brand.texts.heroSubtitle)}</p>
      </div>
      <div style="background:${c.white};padding:20px">
        <p style="margin-top:0">${escapeHtml(brand.texts.emailGreeting)} ${escapeHtml(name)}:</p>
        <p>Tu número de póliza de demostración es <strong>${escapeHtml(policy_number)}</strong>.</p>
        <p>Adjuntamos el certificado en PDF. También puedes descargarlo aquí:</p>
        <p style="margin:20px 0"><a href="${escapeHtml(pdf_url)}" style="display:inline-block;background:${c.yellow};color:${c.night};font-weight:bold;font-size:17px;padding:14px 28px;border-radius:12px;border:0;text-decoration:none">${escapeHtml(brand.texts.downloadPdf)}</a></p>
        <p style="color:${c.secondary};margin-bottom:0"><strong style="color:${c.night}">${escapeHtml(brand.demoBanner)}.</strong> No se ha cobrado nada.</p>
      </div>
    </div>
  </div>`;
}

// Turns Brevo's list of events for one message into one clear status.
// Brevo event names: https://developers.brevo.com/reference/get-email-event-report
// Order matters: a permanent failure beats everything; an open beats a delivery; etc.
const STATUS_RULES = [
  { status: 'bounced', events: ['hardBounces'] },              // address doesn't exist: permanent
  { status: 'blocked', events: ['blocked', 'invalid', 'error'] }, // Brevo refused to deliver
  { status: 'marked_as_spam', events: ['spam'] },              // recipient reported it as spam
  { status: 'opened', events: ['opened', 'clicks'] },
  { status: 'delivered', events: ['delivered', 'loadedByProxy', 'unsubscribed'] },
  { status: 'bounced', events: ['softBounces', 'bounces'] },   // temporary failure, no delivery yet
  { status: 'deferred', events: ['deferred'] },                // receiving server asked to retry later
  { status: 'accepted', events: ['requests'] },                // Brevo accepted it for sending
];

export function deliveryStatusFromEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  for (const rule of STATUS_RULES) {
    const matching = events.filter(e => rule.events.includes(e.event));
    if (matching.length === 0) continue;
    const latest = matching.reduce((a, b) => (Date.parse(b.date) > Date.parse(a.date) ? b : a));
    const at = Number.isNaN(Date.parse(latest.date)) ? null : new Date(latest.date).toISOString();
    return { status: rule.status, event: latest.event, at, reason: latest.reason ? String(latest.reason).slice(0, 200) : null };
  }
  return null;
}

export function createEmailService({ env, brand, fetchImpl = fetch }) {
  const configured = Boolean(env.BREVO_API_KEY && env.SENDER_EMAIL);
  const headers = { 'api-key': env.BREVO_API_KEY, accept: 'application/json' };

  function send({ to, policy_number, pdfBuffer, pdf_url }) {
    if (!configured) return { status: 'not_configured' };

    const body = {
      // The sender name comes from the brand config (not .env), so it always matches the brand.
      sender: { email: env.SENDER_EMAIL, name: brand.emailSenderName },
      to: [{ email: to.email, name: to.full_name }],
      subject: `${brand.texts.emailSubject} ${policy_number} — ${brand.demoBanner}`,
      htmlContent: emailHtml({ brand, name: to.full_name, policy_number, pdf_url }),
      attachment: [{ name: `${policy_number}.pdf`, content: pdfBuffer.toString('base64') }],
    };

    // Resolves to { messageId } once Brevo has accepted the email.
    const done = fetchImpl(`${BREVO}/smtp/email`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }).then(async res => {
      if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json().catch(() => ({}));
      return { messageId: json.messageId ?? json.messageIds?.[0] ?? null };
    });
    return { status: 'sending', done };
  }

  // Returns the summarised status for one message, null if Brevo has no events yet, or throws.
  async function getDeliveryStatus(messageId) {
    if (!configured || !messageId) return null;
    const url = `${BREVO}/smtp/statistics/events?messageId=${encodeURIComponent(messageId)}&days=90&limit=100&sort=desc`;
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Brevo events HTTP ${res.status}`);
    const json = await res.json();
    return deliveryStatusFromEvents(json.events ?? []);
  }

  return { send, getDeliveryStatus };
}
