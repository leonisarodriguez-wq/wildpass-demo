// Original illustrated scenes for the landing hero (3 parallax layers each) and the destination cards.
// Brand style: night outline, turquoise fills (solid or translucent), white snow/walls, yellow ONLY for the sun.
// Every scene is drawn ONCE as SVG <symbol>s (far / mid / near, viewBox 0 0 1200 400) and reused with <use>,
// so the hero and the cards never duplicate drawings. Key shapes sit between x≈280 and x≈920: on a phone the
// hero shows only the middle of the 1200-wide scene (preserveAspectRatio "xMidYMax slice").
import brand from '../config/brand.config.js';

const { night: N, turquoise: T, white: W, yellow: Y, mint: M } = brand.colors;
const line = (w = 3) => `stroke="${N}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
// Turquoise mixed with the sky colour, as a SOLID colour: hills look see-through but really hide the sun behind them.
const tint = o => '#' + [1, 3, 5].map(i => Math.round(parseInt(T.slice(i, i + 2), 16) * o + parseInt(brand.colors.sky.slice(i, i + 2), 16) * (1 - o)).toString(16).padStart(2, '0')).join('');
const far = (d, o = 0.22) => `<path d="${d}" fill="${tint(o)}"/>`;
const ground = d => `<path d="${d}" fill="${T}"/>`;

// Shared pieces.
const softHills = far('M0 400V285c130-45 250-50 380-18s220 12 330-24 250-34 370 6 120 22 120 22V400z');
const pine = (x, y, s = 1) => `<path d="M${x} ${y - 46 * s}l${-20 * s} ${34 * s}h${9 * s}l${-14 * s} ${22 * s}h${50 * s}l${-14 * s} ${-22 * s}h${9 * s}z" fill="${M}" ${line(2.5)}/>`;
const palm = (x, lean = 1) => {
  const tx = x + 22 * lean;
  // Almond-shaped leaf from the top of the trunk to (dx, dy), bulging 13 units each side.
  const leaf = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * 13;
    const ny = (dx / len) * 13;
    const mx = tx + dx / 2;
    const my = 228 + dy / 2;
    return `<path d="M${tx} 228Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${tx + dx} ${228 + dy}Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${tx} 228z" fill="${T}" ${line(2.5)}/>`;
  };
  return `<path d="M${x} 400q${-4 * lean} -96 ${22 * lean} -172" fill="none" ${line(7)}/>`
    + leaf(-78, 26) + leaf(78, 26) + leaf(-56, -30) + leaf(58, -28) + leaf(6, -52);
};
const cactus = (x, h = 120) => `<path d="M${x - 14} 400V${400 - h}a14 14 0 0 1 28 0V400z M${x - 14} ${400 - h * 0.45}h-16a10 10 0 0 1 -10 -10v-${h * 0.25}a9 9 0 0 1 18 0v${h * 0.16}h8z M${x + 14} ${400 - h * 0.6}h16a10 10 0 0 0 10 -10v-${h * 0.2}a9 9 0 0 0 -18 0v${h * 0.12}h-8z" fill="${T}" ${line(3)}/>`;

// Each scene: { far, mid, near } SVG bodies in a 1200×400 box (ground at the bottom).
export const SCENES = {
  mountains: {
    far: far('M0 400V250l120-70 90 50 140-120 160 140 110-80 150 110 120-90 140 100 170-60V400z'),
    mid: `${far('M0 400V300l180-120 120 90 170-150 190 170 120-70 160 100 260-90V400z', 0.5)}
      <path d="M470 130l-34 30 16-4 18 13 16-13 20 6z M650 210l-22 22 12-3 10 8 12-8 12 3z" fill="${W}"/>`,
    near: `${ground('M0 400V340c160-40 320-50 480-20s340 30 480-10 240-10 240-10V400z')}${pine(330, 352)}${pine(372, 348, 0.8)}${pine(820, 344)}${pine(866, 350, 0.75)}`,
  },
  thailand: {
    far: softHills,
    mid: `<g fill="${tint(0.8)}" ${line(3)}>
        <path d="M600 108v62"/>
        <path d="M548 222l20-44h64l20 44z"/>
        <path d="M498 266q-14-4-18-22l42 6 20-30h116l20 30 42-6q-4 18-18 22z"/>
        <path d="M446 308q-16-4-20-24l46 6 26-24h204l26 24 46-6q-4 20-20 24z"/>
        <path d="M470 308h260v52H470z"/>
        <path d="M330 360v-46q22-34 44 0v46z M352 278v-28 M846 360v-46q22-34 44 0v46z M868 278v-28"/>
      </g>
      <path d="M576 360v-32a24 24 0 0 1 48 0v32z" fill="${W}" ${line(3)}/>`,
    near: `${ground('M0 400V362c180-14 380-18 600-10s420 8 600-4V400z')}${palm(300, -1)}${palm(900, 1)}`,
  },
  japan: {
    far: `<path d="M290 400L520 168q80-20 160 0l230 232z" fill="${tint(0.35)}"/>
      <path d="M520 168q80-20 160 0l-38 46-24-14-26 22-24-20-26 14z" fill="${W}"/>`,
    mid: far('M0 400V320c140-30 260-30 400 0s300 20 420-10 260-30 380 0V400z', 0.55),
    near: `${ground('M0 400V366c220-16 420-20 640-12s380 8 560-2V400z')}
      <path d="M0 110c90 10 170 40 250 92 40 26 90 40 150 44 M190 156c20 30 24 60 12 92 M320 212c30 10 48 30 54 58" fill="none" ${line(6)}/>
      <g fill="${W}" ${line(2)}>${[[240, 140], [300, 186], [370, 234], [200, 230], [330, 256], [140, 118], [404, 242], [380, 280]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11"/>`).join('')}</g>
      <g fill="${M}">${[[260, 124], [350, 208], [170, 204], [214, 262]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8"/>`).join('')}</g>`,
  },
  peru: {
    far: `${far('M0 400V232l92-62 58 40 112-112 80 70 92-92 120 122 70-50 132 92 110-100 110 82 92-42 132 62V400z', 0.3)}
      <path d="M262 98l-30 30 14-4 16 12 14-12 16 6z M554 98l-26 26 12-4 14 10 12-10 14 4z" fill="${W}"/>`,
    mid: `<path d="M240 400C370 250 560 196 760 226c120 18 200 70 280 174z" fill="${tint(0.6)}"/>
      <g fill="none" ${line(3)}>
        <path d="M318 352c150-34 400-46 660-8"/><path d="M372 312c130-30 330-40 540-10"/>
        <path d="M430 276c110-24 270-32 420-8"/><path d="M500 246c90-18 200-22 300-6"/>
      </g>`,
    near: ground('M0 400V360c200-20 400-24 600-14s400 10 600-6V400z'),
  },
  iceland: {
    far: `<g fill="none" stroke-linecap="round">
        <path d="M120 140c180-70 300 30 520-16s320-80 480-6" stroke="${M}" stroke-width="30" opacity=".75"/>
        <path d="M200 190c160-50 280 20 460-10s300-60 420 0" stroke="${T}" stroke-width="16" opacity=".45"/>
      </g>${far('M0 400V292c150-36 260-40 420-12s260 6 380-26 260-20 400 14V400z', 0.3)}`,
    mid: far('M0 400V330c120-24 240-30 380-6s300 16 440-14 260-22 380 4V400z', 0.55),
    near: `${ground('M0 400V368c200-14 420-18 640-10s380 6 560-4V400z')}
      <path d="M420 368q14-26 40-24t34 24z M760 366q10-18 30-16t26 18z" fill="${M}" ${line(2.5)}/>`,
  },
  mexico: {
    far: softHills,
    mid: `<g fill="${tint(0.75)}" ${line(3)}>
        <path d="M390 360h420l-30-44H420z"/><path d="M420 316h360l-30-42H450z"/>
        <path d="M450 274h300l-30-40H480z"/><path d="M480 234h240l-28-38H508z"/>
        <path d="M546 196v-34h108v34z"/>
      </g>
      <path d="M576 360V196h48v164z" fill="${W}" ${line(3)}/>
      <path d="M576 230h48M576 270h48M576 310h48" ${line(2)}/>`,
    near: `${ground('M0 400V364c210-14 400-18 600-12s420 8 600-2V400z')}${cactus(320, 130)}${cactus(880, 110)}`,
  },
  usa: {
    far: far('M0 400V262h110l26-40h150l26 40h60V214h150l36 56h120l30-46h140l24 46h110V230h120l40 40h60V400z', 0.3),
    mid: `<path d="M0 400V250h150l40 60 70 18v72z M1200 400V240h-140l-50 70-80 20v70z" fill="${tint(0.7)}" ${line(3)}/>
      <path d="M40 286h120M1090 290h-110" ${line(2)}/>`,
    near: `${ground('M0 400V330h1200V400z')}
      <path d="M430 400L586 330h28L770 400z" fill="${N}" opacity=".85"/>
      <path d="M600 338v10M600 360v14M600 386v14" stroke="${W}" stroke-width="4" stroke-linecap="round"/>`,
  },
  europe: {
    far: softHills,
    mid: `<g ${line(3)}>
        <path d="M330 360v-70h80v70z M440 360v-96h90v96z M560 360V226h50v134z M640 360v-80h100v80z M770 360v-60h90v60z" fill="${W}"/>
        <path d="M322 290l48-40 48 40z M432 264l53-46 53 46z M640 280l50-44 50 44z M762 300l53-40 53 40z" fill="${T}"/>
        <path d="M554 226q31-56 62 0z" fill="${T}"/><path d="M585 170v-18" fill="none"/>
      </g>
      <g fill="${N}">${[[354, 312], [462, 290], [500, 290], [578, 250], [578, 290], [664, 300], [712, 300], [796, 318]].map(([x, y]) => `<rect x="${x}" y="${y}" width="12" height="16" rx="2"/>`).join('')}</g>`,
    near: `${ground('M0 400V360c220-16 420-18 600-12s400 10 600-4V400z')}
      <path d="M200 384h120M380 388h140M680 386h130M880 384h120" stroke="${M}" stroke-width="4" stroke-linecap="round"/>`,
  },
};
export const SCENE_IDS = Object.keys(SCENES);

// Which scene a destination shows. Explicit countries first, then any European country → old town rooftops.
const SCENE_BY_COUNTRY = { TH: 'thailand', JP: 'japan', PE: 'peru', IS: 'iceland', MX: 'mexico', US: 'usa' };
export function sceneFor(code, pricing) {
  if (SCENE_BY_COUNTRY[code]) return SCENE_BY_COUNTRY[code];
  return pricing.zones.europe?.includes(code) ? 'europe' : 'mountains';
}

// Hidden sprite with every layer of every scene (in the page once).
export const sceneSprite = `<svg class="sprite" aria-hidden="true" focusable="false" width="0" height="0"><defs>${
  SCENE_IDS.flatMap(id => ['far', 'mid', 'near'].map(layer => `<symbol id="sc-${id}-${layer}" viewBox="0 0 1200 400">${SCENES[id][layer]}</symbol>`)).join('')
}</defs></svg>`;

const layerSvg = (layer, extra = '') => `<svg class="layer layer-${layer}" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${extra}${
  SCENE_IDS.map(id => `<g class="scene${id === 'mountains' ? ' is-active' : ''}" data-scene="${id}"><use href="#sc-${id}-${layer}" width="1200" height="400"/></g>`).join('')
}</svg>`;

// The hero: three layers (the sun rises once in the far layer, behind the hills).
export const heroScene = `<div class="hero-scene" id="hero-scene" aria-hidden="true">${
  layerSvg('far', `<circle class="sun" cx="250" cy="130" r="46" fill="${Y}"/>`)}${layerSvg('mid')}${layerSvg('near')}</div>`;

// A small static scene (destination cards): all three layers of one scene.
export const miniScene = id => `<svg class="mini-scene" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">`
  + `<rect width="1200" height="400" fill="${brand.colors.sky}"/><circle cx="250" cy="130" r="46" fill="${Y}"/>`
  + ['far', 'mid', 'near'].map(l => `<use href="#sc-${id}-${l}" width="1200" height="400"/>`).join('') + '</svg>';

// Route strip: Spain → destination, a dotted flight path and a small plane (hidden until a destination is chosen).
const ROUTE = 'M34 50Q160 -4 286 28';
export const routeStrip = `<svg class="route-map" viewBox="0 0 320 64" aria-hidden="true" focusable="false">
  <defs>
    <mask id="route-reveal" maskUnits="userSpaceOnUse"><path id="route-mask" d="${ROUTE}" fill="none" stroke="#fff" stroke-width="8" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></mask>
  </defs>
  <path id="route-path" d="${ROUTE}" fill="none" stroke="${N}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1 7" mask="url(#route-reveal)"/>
  <circle cx="34" cy="50" r="6" fill="${T}" stroke="${N}" stroke-width="2.5"/>
  <g class="route-end"><path d="M286 30s-9-8.6-9-15.5a9 9 0 0 1 18 0C295 21.4 286 30 286 30z" fill="${W}" stroke="${N}" stroke-width="2.5"/><circle cx="286" cy="14.5" r="3" fill="${T}"/></g>
  <g class="route-plane"><path d="M-9 -1.5 7 -1.5 11 0 7 1.5 -9 1.5z M-2 -1.5 3 -8 6 -8 3 -1.5z M-2 1.5 3 8 6 8 3 1.5z M-9 -1.5 -11 -5 -8 -5 -6 -1.5z M-9 1.5 -11 5 -8 5 -6 1.5z" fill="${N}"/>
    <animateMotion id="route-fly" dur="1.6s" begin="indefinite" fill="freeze" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".4 0 .2 1"><mpath href="#route-path"/></animateMotion></g>
</svg>`;
