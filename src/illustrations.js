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

// ---------- "¿Y si…?" scenarios ----------
// Ankle sprain on a trek: boot with a bandage, trail peaks behind.
export const whatIfSprain = svg(`
  <path d="M8 58 28 30l12 16 10-12 18 24z" fill="${T}" opacity=".3"/>
  <path d="M30 40h18v20l18 6c8 2.5 12 7 12 13v5H30z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M30 84h48" stroke="${N}" stroke-width="5"/>
  <path d="M28 48 50 54M28 56l22 6" stroke="${W}" stroke-width="5"/><path d="M28 48 50 54M28 56l22 6" stroke="${N}" stroke-width="1.5" opacity=".6"/>
  <path d="M60 70l4-6M68 73l4-6" stroke="${N}" stroke-width="2.5"/>
  <path d="M74 20c4 4 4 10 0 14M82 16c7 7 7 17 0 24" stroke="${N}" stroke-width="3"/>`);
// The airline loses the suitcase: suitcase with a question-mark tag, a plane flying away.
export const whatIfSuitcase = svg(`
  <rect x="18" y="36" width="46" height="44" rx="7" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M32 36v-8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8M30 46v26M52 46v26" stroke="${N}" stroke-width="3"/>
  <path d="M64 48l12 4v18H64" fill="${W}" stroke="${N}" stroke-width="3"/>
  <path d="M68 58q0-4 3.5-4t3.5 3.5q0 2.5-3.5 4" stroke="${N}" stroke-width="2.5"/><circle cx="71" cy="66" r="1.6" fill="${N}"/>
  <path d="M58 16h22l6-4h3l-3 6h-6l-6 6h-4l3-6h-15z" fill="${W}" stroke="${N}" stroke-width="2.5"/>`);
// Cancelling because of illness: calendar with a cross, thermometer.
export const whatIfCancel = svg(`
  <rect x="12" y="20" width="54" height="56" rx="7" fill="${W}" stroke="${N}" stroke-width="3"/>
  <path d="M12 34h54" stroke="${N}" stroke-width="3"/><path d="M12 27a7 7 0 0 1 7-7h40a7 7 0 0 1 7 7v7H12z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M26 14v12M52 14v12" stroke="${N}" stroke-width="3"/>
  <path d="M30 46l18 18M48 46 30 64" stroke="${N}" stroke-width="4"/>
  <path d="M72 30a6 6 0 0 1 12 0v32a10 10 0 1 1-12 0z" fill="${W}" stroke="${N}" stroke-width="3"/>
  <circle cx="78" cy="70" r="5" fill="${T}"/><path d="M78 66V40" stroke="${T}" stroke-width="4"/>`);
// Lost in the mountains: peaks, a small hiker pin and a rescue search circle.
export const whatIfRescue = svg(`
  <path d="M4 82 32 36l14 20 14-26 32 52z" fill="${T}" stroke="${N}" stroke-width="3"/>
  <path d="M54 40l6-10 6 10-3-1-3 4-3-4z" fill="${W}" stroke="${N}" stroke-width="2"/>
  <circle cx="40" cy="64" r="14" stroke="${W}" stroke-width="3" stroke-dasharray="4 5"/>
  <path d="M40 70s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" fill="${W}" stroke="${N}" stroke-width="2.5"/>
  <path d="M60 14h26M73 14v6M64 20h18a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H66l-8-6z" fill="${W}" stroke="${N}" stroke-width="2.5"/>`);

// ---------- small line icons (24 px, colour from CSS `currentColor`) ----------
const icon = body => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const iconPin = icon('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>');
export const iconCalendar = icon('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
export const iconPeople = icon('<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.1c2.3.3 4 2 4.5 4.9"/>');
export const iconRemove = icon('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>');
