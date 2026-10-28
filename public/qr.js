// Tiny QR code generator (byte mode, error correction level M, versions 1–10 = up to 213 bytes), drawn as SVG.
// Hand-written from the QR standard (ISO/IEC 18004) so no library and no external QR service is needed:
// the policy link never leaves the browser. Structure follows Project Nayuki's well-known reference implementation.

const EC_LEN = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // EC codewords per block, level M, versions 1–10
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const RAW = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346]; // total codewords
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// Galois field GF(256) multiply (polynomial 0x11D) and Reed–Solomon error correction codewords.
function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { result[j] = mul(result[j], root); if (j + 1 < degree) result[j] ^= result[j + 1]; }
    root = mul(root, 2);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((d, i) => { result[i] ^= mul(d, factor); });
  }
  return result;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const v = RAW.findIndex((raw, i) => raw - EC_LEN[i] * BLOCKS[i] >= bytes.length + (i >= 9 ? 3 : 2) + 1) + 1;
  if (v < 1) throw new Error('QR: text too long');
  const size = v * 4 + 17;
  const capacity = RAW[v - 1] - EC_LEN[v - 1] * BLOCKS[v - 1];

  // 1. Data bits: mode "byte", length, the bytes, terminator, padding.
  const bits = [];
  const put = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(4, 4);
  put(bytes.length, v >= 10 ? 16 : 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  // 2. Split into blocks, add error correction, interleave.
  const nBlocks = BLOCKS[v - 1];
  const ecLen = EC_LEN[v - 1];
  const nShort = nBlocks - (RAW[v - 1] % nBlocks);
  const shortLen = Math.floor(RAW[v - 1] / nBlocks);
  const divisor = rsDivisor(ecLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((block, j) => { if (i !== shortLen - ecLen || j >= nShort) codewords.push(block[i]); });

  // 3. Function patterns (finders, timing, alignment, format/version areas).
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v - 1];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al.at(-1)) || (ax === al.at(-1) && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const data5 = mask; // level M = 00
    let rem = data5;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data5 << 10) | rem) ^ 0x5412;
    const bit = i => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true); // the "dark module"
  };
  drawFormat(0); // reserve the area; redrawn with the chosen mask below
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((vb >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  // 4. Data modules in the zig-zag order.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }

  // 5. Try the 8 masks, keep the one with the lowest penalty (runs, 2×2 blocks, dark/light balance).
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let a = 0; a < size; a++) for (const get of [b => m[a][b], b => m[b][a]]) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && get(b) === get(b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    applyMask(k); drawFormat(k);
    const score = penalty();
    if (score < bestScore) { best = k; bestScore = score; }
    applyMask(k); // undo
  }
  applyMask(best);
  drawFormat(best);
  return m;
}

// SVG with a 4-module quiet zone; dark modules in `color`.
export function qrSvg(text, { color = '#0B1F3A', label = '' } = {}) {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label.replace(/[&<>"]/g, '')}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
}
