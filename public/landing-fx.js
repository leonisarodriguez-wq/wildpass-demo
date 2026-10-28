// Landing effects only (no business rules): hero parallax, destination scenes + flight path, live price preview,
// and the animated AI example. Everything is already in the page in its final state; this file only animates it.
// With "reduce motion" there is no parallax, no typing and no flying: the final state is shown at once.
import { callApi, loadConfig } from './api.js';

const $ = sel => document.querySelector(sel);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
const eur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always', minimumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- hero parallax: far layers move slower than the page while the hero is on screen ----------
const scene = $('#hero-scene');
const layers = [['.layer-far', 0.28], ['.layer-mid', 0.14]].map(([sel, speed]) => [scene.querySelector(sel), speed]);
let ticking = false;
function parallax() {
  ticking = false;
  const y = Math.min(window.scrollY, scene.parentElement.offsetHeight);
  for (const [layer, speed] of layers) layer.style.transform = reduced.matches ? '' : `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(parallax); } }, { passive: true });

// ---------- destination → matching scene + flight path from Spain ----------
const destination = $('#destination');
const route = $('#route');
const fly = $('#route-fly');
function showDestination() {
  const option = destination.selectedOptions[0];
  const id = option?.dataset.scene ?? 'mountains';
  for (const g of scene.querySelectorAll('.scene')) g.classList.toggle('is-active', g.dataset.scene === id);
  const chosen = Boolean(destination.value);
  $('#route-to').textContent = chosen ? option.textContent : $('#route-to').dataset.empty;
  route.classList.toggle('has-dest', chosen);
  if (chosen && fly?.beginElement) {
    fly.setAttribute('dur', reduced.matches ? '0.001s' : '1.6s');
    fly.beginElement();
  }
}
$('#route-to').dataset.empty = $('#route-to').textContent;
destination.addEventListener('change', showDestination);
destination.addEventListener('wildpass:set', showDestination); // fired when other parts of the page pick a destination
if (destination.value) showDestination(); // e.g. the browser restored the form after "back"

// ---------- live price preview: "Desde X € · plan Wild" once destination, dates and ages are valid ----------
const preview = $('#price-preview');
let T = null;
let seq = 0;
let timer;
function odometer(text, old) {
  // Digits roll from their previous value; other characters are plain text. aria-hidden: the sr-only copy is read.
  const prev = [...(old ?? '')];
  return `<span class="sr-only">${esc(text)}</span><span aria-hidden="true">${[...text].map((ch, i) => {
    if (!/\d/.test(ch)) return `<span>${esc(ch)}</span>`;
    const from = /\d/.test(prev[i]) ? prev[i] : '0';
    return `<span class="odo"><span class="odo-strip" data-to="${ch}" data-from="${from}">${'0123456789'.split('').map(d => `<span>${d}</span>`).join('')}</span></span>`;
  }).join('')}</span>`;
}
function showPrice(text) {
  if (preview.dataset.text === text) return;
  preview.innerHTML = text ? odometer(text, preview.dataset.text) : '';
  preview.dataset.text = text;
  const strips = [...preview.querySelectorAll('.odo-strip')];
  for (const s of strips) s.style.transform = `translateY(${-s.dataset.from * 1.5}em)`;
  preview.offsetHeight; // apply the start position before rolling
  for (const s of strips) s.style.transform = `translateY(${-s.dataset.to * 1.5}em)`;
}
function formReady() {
  const dep = $('#departure').value;
  const ret = $('#return').value;
  return destination.value && dep && ret && ret > dep && dep >= $('#departure').min && document.querySelectorAll('#ages .age').length > 0;
}
async function updatePrice() {
  if (!formReady() || !T) return showPrice('');
  const n = ++seq;
  const result = await callApi('get_quote', {
    origin_country: 'ES',
    destination_country: destination.value,
    departure_date: $('#departure').value,
    return_date: $('#return').value,
    traveler_ages: [...document.querySelectorAll('#ages .age')].map(a => Number(a.value)),
  });
  if (n !== seq) return; // a newer change is already on its way
  if (!result.ok) return showPrice('');
  const cheapest = result.plans.reduce((a, b) => (b.total_price_eur < a.total_price_eur ? b : a));
  showPrice(fill(T.form.pricePreview, { price: eur(cheapest.total_price_eur), plan: cheapest.plan_name }));
}
const form = $('#quote-form');
const schedule = () => { clearTimeout(timer); timer = setTimeout(updatePrice, 500); };
form.addEventListener('change', schedule);
form.addEventListener('input', schedule);
form.addEventListener('click', e => { if (e.target.closest('.remove-age, #add-age')) schedule(); });

// ---------- AI example: self-typing chat + the real tools lighting up ----------
const show = $('#showcase');
const replay = $('#showcase-replay');
const bubbles = [...show.querySelectorAll('.bubble')];
const tools = [...show.querySelectorAll('.tool')];
const checks = [...show.querySelectorAll('.tool-checks li')];
for (const b of bubbles) {
  const text = b.querySelector('.bubble-text');
  b.dataset.text = text.textContent;
  text.setAttribute('aria-hidden', 'true'); // screen readers get one clean copy, not the typing
  const copy = document.createElement('span');
  copy.className = 'sr-only';
  copy.textContent = text.textContent;
  b.append(copy);
}
let run = 0;
let visible = false;
const on = (list, test) => list.filter(test).forEach(x => x.classList.add('is-on'));

function finalState() {
  show.classList.remove('is-playing');
  for (const b of bubbles) { b.classList.remove('is-typing', 'is-thinking'); b.querySelector('.bubble-text').textContent = b.dataset.text; }
}
async function play() {
  const me = ++run;
  const alive = () => me === run;
  show.classList.add('is-playing');
  for (const x of [...bubbles, ...tools, ...checks]) x.classList.remove('is-shown', 'is-on', 'is-typing', 'is-thinking');
  for (const b of bubbles) b.querySelector('.bubble-text').textContent = b.dataset.text;
  await wait(500);
  for (const b of bubbles) {
    if (!alive()) return;
    const text = b.querySelector('.bubble-text');
    b.classList.add('is-shown');
    if (b.classList.contains('bubble-user')) {
      b.classList.add('is-typing');
      text.innerHTML = '<span class="typed"></span><span class="rest"></span>';
      const [typed, rest] = text.children;
      const full = b.dataset.text;
      for (let i = 0; i <= full.length; i++) {
        if (!alive()) return;
        typed.textContent = full.slice(0, i);
        rest.textContent = full.slice(i);
        await wait(28);
      }
      b.classList.remove('is-typing');
      text.textContent = full;
    } else if (b.classList.contains('bubble-assistant')) {
      b.classList.add('is-thinking');
      await wait(900);
      b.classList.remove('is-thinking');
    }
    await wait(450);
    // The tools this message triggers light up one by one; confirm_payment ticks its 4 safety checks first.
    for (const name of (b.dataset.tools ?? '').split(' ').filter(Boolean)) {
      if (!alive()) return;
      on(tools, t => t.dataset.tool === name);
      await wait(550);
      if (name === 'confirm_payment') for (const c of checks) { if (!alive()) return; c.classList.add('is-on'); await wait(450); }
    }
    await wait(700);
  }
  if (!alive()) return;
  show.classList.remove('is-playing');
  await wait(6000); // slow loop: a long pause on the finished conversation, and only while it is on screen
  if (alive() && visible && !reduced.matches) play();
}

if (reduced.matches) finalState();
else {
  replay.hidden = false;
  replay.addEventListener('click', () => play());
  let started = false;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !started) { started = true; play(); }
  }, { threshold: 0.35 }).observe(show);
}
reduced.addEventListener?.('change', () => { if (reduced.matches) { run++; finalState(); replay.hidden = true; } parallax(); });

// ---------- count-up: big limits ("15.000 €") count from 0 once, the first time they are seen ----------
const counted = new WeakSet();
function countUp(node) {
  if (counted.has(node) || reduced.matches) return;
  counted.add(node);
  const to = Number(node.dataset.to);
  const final = node.textContent;
  node.style.minWidth = `${node.getBoundingClientRect().width}px`; // keep the width: nothing next to it moves
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / 1100);
    const value = Math.round(to * (1 - (1 - t) ** 3));
    node.textContent = t < 1 ? eur(value) : final;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const countObserver = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting && !e.target.closest('[hidden]')) { countUp(e.target); countObserver.unobserve(e.target); }
}, { threshold: 0.6 });
document.querySelectorAll('.count').forEach(n => countObserver.observe(n));

// ---------- "¿Y si…?" tabs (ARIA tabs: click, arrow keys, Home/End) ----------
const tabs = [...document.querySelectorAll('.whatif-tab')];
function selectTab(tab, focus) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    panel.hidden = !on;
    if (on) panel.querySelectorAll('.count').forEach(n => { countObserver.unobserve(n); countObserver.observe(n); });
  }
  if (focus) { tab.focus(); tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }); }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab, false));
  tab.addEventListener('keydown', e => {
    const i = tabs.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length], true);
  });
}

// ---------- destination cards: set the destination, switch the hero scene, go to the form ----------
for (const card of document.querySelectorAll('.dest-card')) {
  card.addEventListener('click', () => {
    destination.value = card.dataset.country;
    destination.dispatchEvent(new Event('change', { bubbles: true }));
    form.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' });
    const next = ['#departure', '#return'].map(s => $(s)).find(f => !f.value) ?? $('#quote-submit');
    next.focus({ preventScroll: true });
  });
}

// ---------- sections slide in once when they come into view ----------
if (!reduced.matches && 'IntersectionObserver' in window) {
  const sections = [...document.querySelectorAll('#landing > section:not(.hero)')];
  const revealObserver = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); revealObserver.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  for (const section of sections) {
    // Only sections still below the screen get the effect, so nothing already visible blinks.
    if (section.getBoundingClientRect().top > innerHeight) { section.classList.add('reveal'); revealObserver.observe(section); }
  }
}

// ---------- phones: sticky "Ver mi precio" bar once the hero is off screen (not while the form is visible) ----------
const sticky = $('#sticky-cta');
let heroVisible = true;
let formVisible = true;
const syncSticky = () => { sticky.hidden = heroVisible || formVisible; };
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; syncSticky(); }).observe($('.hero'));
new IntersectionObserver(([e]) => { formVisible = e.isIntersecting; syncSticky(); }).observe(form);
new IntersectionObserver(([e]) => { if (e.isIntersecting) sticky.hidden = true; else syncSticky(); }).observe($('.final-cta'));

loadConfig().then(config => { T = config.brand.texts; if (formReady()) updatePrice(); }).catch(() => {});
