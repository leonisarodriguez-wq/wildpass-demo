// Site header on every page: on phones and tablets the links fold into a "Menú" panel. Esc or a click on a link closes it.
const toggle = document.querySelector('#menu-toggle');
const nav = document.querySelector('#site-nav');

function setOpen(open) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? toggle.dataset.close : toggle.dataset.open;
  nav.classList.toggle('is-open', open);
}
toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
});
