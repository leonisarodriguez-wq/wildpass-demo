// Sends the policy email through Brevo's HTTP API.
// Reads BREVO_API_KEY and SENDER_EMAIL from the environment (.env). Without them it reports "not_configured".

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createEmailSender({ env, brand }) {
  return function sendPolicyEmail({ to, policy_number, pdfBuffer, pdf_url }) {
    if (!env.BREVO_API_KEY || !env.SENDER_EMAIL) return { status: 'not_configured' };

    const body = {
      sender: { email: env.SENDER_EMAIL, name: env.SENDER_NAME || brand.name },
      to: [{ email: to.email, name: to.full_name }],
      subject: `${brand.texts.emailSubject} ${policy_number} — ${brand.demoBanner}`,
      htmlContent: `
        <p style="background:${brand.colors.banner};color:${brand.colors.bannerText};padding:10px;font-weight:bold;text-align:center">${escapeHtml(brand.demoBanner)}</p>
        <p>Hola ${escapeHtml(to.full_name)}:</p>
        <p>Tu número de póliza de demostración es <strong>${escapeHtml(policy_number)}</strong>.</p>
        <p>Adjuntamos el certificado en PDF. También puedes descargarlo aquí: <a href="${escapeHtml(pdf_url)}">${escapeHtml(pdf_url)}</a></p>
        <p><strong>${escapeHtml(brand.demoBanner)}.</strong> No se ha cobrado nada.</p>`,
      attachment: [{ name: `${policy_number}.pdf`, content: pdfBuffer.toString('base64') }],
    };

    const done = fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }).then(async res => {
      if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    });
    return { status: 'sending', done };
  };
}
