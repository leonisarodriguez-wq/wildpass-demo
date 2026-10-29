// "Completa tu DNI" page: the person types their own DNI/NIE. Checked here for convenience (format + mod-23 letter);
// the server checks again and decides. The token is the last part of the address (one-time link from the email).
const form = document.getElementById('complete-id-form');
const input = document.getElementById('holder-id');
const box = form.querySelector('.error');
const token = location.pathname.split('/').pop();
const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function check(raw) {
  const value = raw.toUpperCase().replace(/[\s.-]/g, '');
  if (!value) return form.dataset.empty;
  const m = /^(\d{8}|[XYZ]\d{7})([A-Z])$/.exec(value);
  if (!m) return form.dataset.format;
  return LETTERS[Number(m[1].replace(/^[XYZ]/, ch => String('XYZ'.indexOf(ch)))) % 23] === m[2] ? null : form.dataset.letter;
}

// Same error component as the checkout: one message right under the field, linked with aria-describedby.
function setError(message) {
  let err = document.getElementById('holder-id-error');
  if (!message) {
    err?.remove();
    input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', 'holder-id-hint');
    return;
  }
  if (!err) {
    err = Object.assign(document.createElement('p'), { className: 'field-error', id: 'holder-id-error' });
    input.after(err);
  }
  err.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', 'holder-id-error holder-id-hint');
}

input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true' && !check(input.value)) setError(null); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  box.hidden = true;
  const problem = check(input.value);
  setError(problem);
  if (problem) { input.focus(); return; }
  const button = document.getElementById('complete-id-send');
  button.disabled = true;
  let result;
  try {
    const res = await fetch('/api/complete_holder_id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, id_number: input.value }) });
    result = await res.json();
  } catch {
    result = { ok: false };
  }
  button.disabled = false;
  if (!result.ok) {
    if (result.error_code === 'INVALID_ID_NUMBER') { setError(result.reason === 'letter' ? form.dataset.letter : form.dataset.format); input.focus(); return; }
    box.textContent = result.message || form.dataset.generic;
    box.hidden = false;
    return;
  }
  form.hidden = true;
  const done = document.getElementById('complete-id-done');
  document.getElementById('complete-id-done-text').textContent = form.dataset.done.replace('{masked}', result.holder_id_number_masked).replace('{number}', result.policy_number);
  document.getElementById('complete-id-pdf').href = result.pdf_url;
  done.hidden = false;
  done.focus();
});
