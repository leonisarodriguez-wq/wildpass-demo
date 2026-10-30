// Contact form (/terminos → Contacto). Sent to /api/contact; the server validates again, limits per session and never shows the
// owner's address. Messages come from the form's data-* attributes (texts in config/brand.config.js). Same error component as the checkout.
import { sessionId } from './track.js';

const form = document.getElementById('contact-form');
if (form) {
  const box = form.querySelector('.error');
  const f = id => document.getElementById(`contact-${id}`);
  const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const checks = () => [
    [f('name'), () => (f('name').value.trim().length >= 2 ? null : form.dataset.missingName)],
    [f('email'), () => (!f('email').value.trim() ? form.dataset.missingEmail : EMAIL_SHAPE.test(f('email').value.trim()) ? null : form.dataset.invalidEmail)],
    [f('message'), () => (f('message').value.trim().length >= 2 ? null : form.dataset.missingMessage)],
    [f('consent'), () => (f('consent').checked ? null : form.dataset.missingConsent)],
  ];
  // ONE .field-error right under the field, linked with aria-describedby; removed as soon as the field is valid again.
  function setError(field, message) {
    const id = `${field.id}-error`;
    let err = document.getElementById(id);
    const hint = field.id === 'contact-email' ? 'contact-email-hint' : '';
    if (!message) {
      err?.remove();
      field.removeAttribute('aria-invalid');
      if (hint) field.setAttribute('aria-describedby', hint); else field.removeAttribute('aria-describedby');
      return;
    }
    if (!err) {
      err = Object.assign(document.createElement('p'), { className: 'field-error', id });
      (field.closest('.check') ?? field).after(err);
    }
    err.textContent = message;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', `${id}${hint ? ` ${hint}` : ''}`);
  }
  function validateAll() {
    let first = null;
    for (const [field, check] of checks()) {
      const problem = check();
      setError(field, problem);
      if (problem && !first) first = field;
    }
    first?.focus();
    return !first;
  }
  for (const [field, check] of checks()) {
    const live = () => { if (field.getAttribute('aria-invalid') === 'true' && !check()) setError(field, null); };
    field.addEventListener(field.type === 'checkbox' ? 'change' : 'input', live);
  }
  const card = document.getElementById('contact-card');
  const success = document.getElementById('contact-success');
  const title = document.getElementById('contact-success-title');
  const button = document.getElementById('contact-send');
  const label = button.textContent;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    box.hidden = true;
    if (button.disabled) return; // already sending: no double sends
    if (!validateAll()) return;
    button.disabled = true;
    button.textContent = form.dataset.sending;
    let result;
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: f('name').value, email: f('email').value.trim(), message: f('message').value,
        consent: f('consent').checked, website: f('website').value, session_id: sessionId(),
      }) });
      result = await res.json();
    } catch {
      result = { ok: false };
    }
    button.disabled = false;
    button.textContent = label;
    if (!result.ok) {
      // The form stays as it was (nothing typed is lost) and the message sits right above the button.
      box.textContent = form.dataset.generic;
      box.hidden = false;
      return;
    }
    // Good send: the whole form (fields, checkbox, privacy link, button) gives way to the confirmation in the same card.
    document.getElementById('contact-success-text').textContent = form.dataset.success.replace('{email}', f('email').value.trim());
    form.hidden = true;
    form.previousElementSibling?.matches('p') && (form.previousElementSibling.hidden = true); // the intro line above the form
    success.hidden = false;
    title.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'start' }); // html's scroll-padding-top keeps it below the sticky header
  });
  document.getElementById('contact-again').addEventListener('click', () => {
    form.reset(); // empty fields and the consent box unticked
    for (const [field] of checks()) setError(field, null);
    box.hidden = true;
    success.hidden = true;
    form.hidden = false;
    form.previousElementSibling?.matches('p') && (form.previousElementSibling.hidden = false);
    f('name').focus();
  });
}
