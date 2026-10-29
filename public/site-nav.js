// Site header on every page: sticky under the demo banner; on phones and tablets the links fold into a "Menú" panel.
// Esc or a click on a link closes it.
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

// The header sticks right under the banner, and anchors stop below both: CSS reads these two heights.
const banner = document.querySelector('.banner');
const header = document.querySelector('.site-header');
const root = document.documentElement;
function syncHeights() {
  const b = banner ? banner.offsetHeight : 0;
  root.style.setProperty('--banner-h', `${b}px`);
  root.style.setProperty('--sticky-h', `${b + header.offsetHeight}px`);
}
syncHeights();
new ResizeObserver(syncHeights).observe(header);
if (banner) new ResizeObserver(syncHeights).observe(banner);
