// The Wildpass logo as SVG, built from config/brand.config.js (one source for website, terms page and favicon).
import brand from '../config/brand.config.js';

const c = brand.colors;
const s = brand.symbol;

// The symbol alone. onDark: white mountain (for turquoise or dark backgrounds).
export function symbolSvg({ size = 40, onDark = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${s.viewBox}" width="${size}" height="${size}" aria-hidden="true" focusable="false">` +
    `<circle cx="${s.sun.cx}" cy="${s.sun.cy}" r="${s.sun.r}" fill="${c.yellow}"/>` +
    `<polygon points="${s.mountain}" fill="${onDark ? c.white : c.turquoise}"/></svg>`;
}

// Favicon: the symbol (white mountain) inside a rounded turquoise square.
export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${s.viewBox}">` +
    `<rect width="56" height="56" rx="12" fill="${c.turquoise}"/>` +
    `<circle cx="${s.sun.cx}" cy="${s.sun.cy}" r="${s.sun.r}" fill="${c.yellow}"/>` +
    `<polygon points="${s.mountain}" fill="${c.white}"/></svg>`;
}

// Symbol + "wildpass" + "seguros de viaje", as a link to the home page (HTML for the site header).
export function logoHtml() {
  const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  return `<a class="logo" href="/" aria-label="${esc(brand.name)}">${symbolSvg({ size: 44 })}` +
    `<span class="logo-text"><span class="wordmark">${esc(brand.logo.wordmark)}</span><span class="tagline">${esc(brand.logo.tagline)}</span></span></a>`;
}
