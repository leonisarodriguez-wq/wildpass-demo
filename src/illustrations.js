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

// No excess with Wild+: a shield with a check, the sun peeking out behind its top-right corner (about a quarter shows).
export const shieldCheck = svg(`
  <circle cx="76" cy="20" r="14" fill="${Y}" stroke="${N}" stroke-width="3"/>
  <path d="M48 10 80 22v24c0 20-13 34-32 42C29 80 16 66 16 46V22z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M48 20 70 28v18c0 14-9 24-22 30-13-6-22-16-22-30V28z" fill="${W}" stroke="${N}" stroke-width="2.5"/>
  <path d="m37 47 8 8 15-17" stroke="${N}" stroke-width="4.5"/>`);

// ---------- small line icons (24 px, colour from CSS `currentColor`) ----------
const icon = body => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const iconPin = icon('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>');
export const iconCalendar = icon('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
export const iconPeople = icon('<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.1c2.3.3 4 2 4.5 4.9"/>');
export const iconRemove = icon('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>');
export const iconCard = icon('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>');
// Trust strip under the hero: policy by email, cancellation, adventure, clear terms.
export const iconMail = icon('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>');
export const iconCancel = icon('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M9.5 13l5 5M14.5 13l-5 5"/>');
export const iconMountain = icon('<path d="M2.5 20 9 9l4 6 2.5-3.5L21.5 20z"/><circle cx="17" cy="6" r="2"/>');
export const iconShield = icon('<path d="M12 3l7.5 2.8v5.7c0 4.5-3.1 8-7.5 9.5-4.4-1.5-7.5-5-7.5-9.5V5.8z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>');
export const iconCheck = icon('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>');
export const iconDoc = icon('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>');
