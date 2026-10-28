// Email through Brevo's HTTP API: sending the policy, and reading what happened to it afterwards.
// Reads BREVO_API_KEY and SENDER_EMAIL from the environment (.env). Without them: "not_configured".
// The API key is only ever sent to api.brevo.com in a header; it never appears in results or logs.

import { formatEur } from './business.js';
import { dateEs } from './format.js';

const BREVO = 'https://api.brevo.com/v3';

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- the policy email (built from the policy snapshot) ----------
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
const firstName = fullName => fullName.trim().split(/\s+/)[0];

// The key data shown in both versions of the email.
function emailData({ brand, policy_number, summary }) {
  const e = brand.texts.email;
  const { trip, plan, travelers, policyholder, total_eur } = summary;
  const values = { name: firstName(policyholder.full_name), destination: trip.destination_name, number: policy_number };
  return {
    e,
    values,
    rows: [
      [e.policyNumber, policy_number],
      [e.plan, plan.plan_name],
      [e.dates, `${dateEs(trip.departure_date)} – ${dateEs(trip.return_date)} (${trip.days} ${e.days})`],
      [e.travelers, travelers.map(t => t.full_name).join(', ')],
      [e.total, `${formatEur(total_eur)} (${summary.payment?.ref ? fill(e.totalNoteStripe, { ref: summary.payment.ref }) : e.totalNote})`],
    ],
  };
}

export function emailSubject({ brand, policy_number, summary }) {
  return fill(brand.texts.email.subject, { number: policy_number, destination: summary.trip.destination_name });
}

// HTML with inline styles (email clients ignore stylesheets) and table layout (works in Outlook too).
// Same colour rules as the website. The logo is hosted in our Brevo image gallery (see brand config).
export function emailHtml({ brand, policy_number, summary, pdf_url }) {
  const c = brand.colors;
  const { e, values, rows } = emailData({ brand, policy_number, summary });
  const font = 'Inter, Arial, Helvetica, sans-serif';
  const heading = "'Space Grotesk', Arial, Helvetica, sans-serif";
  const dataRows = rows.map(([label, value], i) => `
          <tr><td style="padding:9px 0;color:${c.secondary};font-size:14px;width:120px;vertical-align:top;${i ? `border-top:1px solid ${c.border};` : ''}">${escapeHtml(label)}</td>
          <td style="padding:9px 0;color:${c.night};font-size:14px;font-weight:bold;text-align:right;${i ? `border-top:1px solid ${c.border};` : ''}">${escapeHtml(value)}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(emailSubject({ brand, policy_number, summary }))}</title></head>
<body style="margin:0;padding:0;background:${c.sky}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.sky};font-family:${font};color:${c.night}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${c.white};border-radius:14px;overflow:hidden">
    <tr><td style="background:${c.red};color:${c.white};font-size:13px;font-weight:bold;text-align:center;padding:9px 16px">${escapeHtml(e.demoLine)}</td></tr>
    <tr><td style="padding:22px 28px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:10px;vertical-align:middle"><img src="${escapeHtml(brand.emailLogoUrl)}" width="44" height="44" alt="" style="display:block;border:0"></td>
        <td style="vertical-align:middle">
          <div style="font-family:${heading};font-size:26px;font-weight:bold;color:${c.night};line-height:1">${escapeHtml(brand.logo.wordmark)}</div>
          <div style="font-size:12px;font-weight:bold;color:${c.turquoiseText};margin-top:4px">${escapeHtml(brand.logo.tagline)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:16px 28px 0">
      <h1 style="font-family:${heading};font-size:24px;line-height:1.25;margin:0 0 10px;color:${c.night}">${escapeHtml(fill(e.headline, values))}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 8px;color:${c.night}">${escapeHtml(e.intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${dataRows}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 28px 6px">
      <a href="${escapeHtml(pdf_url)}" style="display:inline-block;background:${c.yellow};color:${c.night};font-family:${font};font-size:17px;font-weight:bold;text-decoration:none;padding:15px 34px;border-radius:12px;border:0">${escapeHtml(e.button)}</a>
      <p style="font-size:13px;color:${c.secondary};margin:10px 0 0">${escapeHtml(e.attachedNote)}</p>
    </td></tr>
    <tr><td style="padding:18px 28px 24px">
      <p style="background:${c.turquoise};color:${c.white};font-size:14px;line-height:1.5;margin:0;padding:14px 16px;border-radius:10px">${escapeHtml(e.emergency)}</p>
    </td></tr>
  </table>
  <p style="max-width:560px;font-size:12px;line-height:1.5;color:${c.secondary};margin:16px auto 0;text-align:center">${escapeHtml(e.footer)}<br>${escapeHtml(brand.claim)}</p>
</td></tr></table>
</body></html>`;
}

// Plain-text version (for email apps that don't show HTML, and better for spam filters).
export function emailText({ brand, policy_number, summary, pdf_url }) {
  const { e, values, rows } = emailData({ brand, policy_number, summary });
  return [
    `*** ${e.demoLine} ***`,
    '',
    fill(e.headline, values),
    '',
    e.intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `${e.button}: ${pdf_url}`,
    e.attachedNote,
    '',
    e.emergency,
    '',
    '--',
    `${brand.logo.wordmark} · ${brand.logo.tagline}`,
    e.footer,
    brand.claim,
  ].join('\n');
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

  function send({ to, policy_number, summary, pdfBuffer, pdf_url }) {
    if (!configured) return { status: 'not_configured' };

    const body = {
      // The sender name comes from the brand config (not .env), so it always matches the brand.
      sender: { email: env.SENDER_EMAIL, name: brand.emailSenderName },
      to: [{ email: to.email, name: to.full_name }],
      subject: emailSubject({ brand, policy_number, summary }),
      htmlContent: emailHtml({ brand, policy_number, summary, pdf_url }),
      textContent: emailText({ brand, policy_number, summary, pdf_url }),
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
