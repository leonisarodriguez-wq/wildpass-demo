// Original brand illustrations as inline SVG (no image files, no requests).
// Style: bold night-blue outline + turquoise fill + one small yellow accent. Colours from the brand config.
import brand from '../config/brand.config.js';

const { night: N, turquoise: T, yellow: Y, white: W } = brand.colors;
const svg = (body, size = 96) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// ---------- benefits ----------
export const globePin = svg(`
  <circle cx="42" cy="54" r="30" fill="${T}" stroke="${N}" stroke-width="3"/>
  <ellipse cx="42" cy="54" rx="13" ry="30" stroke="${N}" stroke-width="3"/>
  <path d="M12 54h60M17 39h50M17 69h50" stroke="${N}" stroke-width="3"/>
  <path d="M70 8c-9 0-16 7-16 16 0 12 16 26 16 26s16-14 16-26c0-9-7-16-16-16z" fill="${Y}" stroke="${N}" stroke-width="3"/>
  <circle cx="70" cy="24" r="5" fill="${W}" stroke="${N}" stroke-width="3"/>`);

export const mountainRope = svg(`
  <path d="M6 84 38 28l16 26 10-12 26 42z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M32 38.5 38 28l6 10-3.5-1.5L38 40l-2.5-3.5z" fill="${W}" stroke="${N}" stroke-width="2.5"/>
  <path d="M38 28V12" stroke="${N}" stroke-width="3"/>
  <path d="M38 12h13l-4 4.5 4 4.5H38" fill="${Y}" stroke="${N}" stroke-width="2.5"/>
  <path d="M22 78c4-9 12-8 14-17s7-12 9-19" stroke="${N}" stroke-width="8"/>
  <path d="M22 78c4-9 12-8 14-17s7-12 9-19" stroke="${Y}" stroke-width="3.5"/>
  <circle cx="18" cy="80" r="7" stroke="${N}" stroke-width="8"/>
  <circle cx="18" cy="80" r="7" stroke="${Y}" stroke-width="3.5"/>`);

export const chatRobotCheck = svg(`
  <path d="M14 14h58a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H40L26 78V66H14a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M43 30v-6" stroke="${N}" stroke-width="3"/>
  <circle cx="43" cy="21" r="3.5" fill="${Y}" stroke="${N}" stroke-width="2.5"/>
  <rect x="28" y="30" width="30" height="25" rx="7" fill="${W}" stroke="${N}" stroke-width="3"/>
  <circle cx="37" cy="42" r="3" fill="${N}"/><circle cx="49" cy="42" r="3" fill="${N}"/>
  <path d="M38 49h10" stroke="${N}" stroke-width="2.5"/>
  <circle cx="76" cy="72" r="14" fill="${Y}" stroke="${N}" stroke-width="3"/>
  <path d="m69 72 5 5 9-10" stroke="${N}" stroke-width="3.5"/>`);

// ---------- AI steps (drawn on a white disc, shown on the turquoise section) ----------
const disc = body => svg(`<circle cx="48" cy="48" r="46" fill="${W}"/>${body}`, 88);

export const stepAsk = disc(`
  <path d="M22 26h44a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H44l-12 10V62H22a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <circle cx="33" cy="44" r="3.5" fill="${W}"/><circle cx="44" cy="44" r="3.5" fill="${W}"/><circle cx="55" cy="44" r="3.5" fill="${W}"/>
  <path d="M74 16v10M69 21h10" stroke="${Y}" stroke-width="4"/>`);

export const stepReview = disc(`
  <path d="M26 16h30l12 12v48a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z" fill="${W}" stroke="${N}" stroke-width="3"/>
  <path d="M56 16v12h12" stroke="${N}" stroke-width="3"/>
  <path d="M30 36h22M30 45h26M30 54h16" stroke="${T}" stroke-width="4"/>
  <circle cx="60" cy="62" r="11" fill="${Y}" stroke="${N}" stroke-width="3"/>
  <path d="m68 70 9 9" stroke="${N}" stroke-width="4"/>`);

export const stepConfirm = disc(`
  <path d="M48 14 74 24v20c0 17-11 29-26 36-15-7-26-19-26-36V24z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="m36 46 8 8 16-17" stroke="${W}" stroke-width="5"/>
  <circle cx="74" cy="72" r="7" fill="${Y}" stroke="${N}" stroke-width="2.5"/>`);

// ---------- hero landscape (decorative, wide) ----------
export const heroLandscape = `<svg class="hero-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <circle cx="930" cy="70" r="38" fill="${Y}"/>
  <path d="M0 160 140 70l70 50 120-90 150 130h20L620 60l110 80 90-60 170 80 60-30 150 70z" fill="${T}" opacity=".35"/>
  <path d="M0 160 220 96l90 40 160-82 170 106 140-70 160 70 120-40 140 40z" fill="${T}"/>
</svg>`;

// ---------- small line icons (24 px, colour from CSS `currentColor`) ----------
const icon = body => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const iconPin = icon('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>');
export const iconCalendar = icon('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
export const iconPeople = icon('<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.1c2.3.3 4 2 4.5 4.9"/>');
export const iconRemove = icon('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>');
