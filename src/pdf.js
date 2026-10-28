// Builds the policy certificate PDF with PDFKit and the brand fonts. Returns a Buffer.
// Everything shown comes from the policy snapshot (what was sold), never from the current config.
// Layout: A4, one page for up to 3 travellers; longer content flows to more pages,
// each with the red demo strip at the top and the disclaimer footer at the bottom.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { formatEur } from './business.js';
import { dateEs, rangeEs, issuedEs } from './format.js';

const font = path => fileURLToPath(new URL(`../node_modules/@fontsource/${path}`, import.meta.url));
const FONTS = {
  heading: font('space-grotesk/files/space-grotesk-latin-700-normal.woff'),
  text: font('inter/files/inter-latin-400-normal.woff'),
  bold: font('inter/files/inter-latin-700-normal.woff'),
};

// "Gastos médicos (Europa): 500.000 €" → ["Gastos médicos (Europa)", "500.000 €"] (labels never contain ": ").
function coverageRows(plan) {
  return plan.coverage_summary.map(line => {
    const cut = line.indexOf(': ');
    const value = line.slice(cut + 2);
    return [line.slice(0, cut), value.charAt(0).toUpperCase() + value.slice(1)];
  });
}

// Policyholder + travellers. If the policyholder is also a traveller (same name), one row says both.
function peopleRows(policyholder, travelers, t) {
  const same = tr => tr.full_name.trim().toLowerCase() === policyholder.full_name.trim().toLowerCase();
  const holderTravels = travelers.some(same);
  const rows = travelers.map(tr => [tr.full_name, holderTravels && same(tr) ? t.roleBoth : t.roleInsured, dateEs(tr.birth_date)]);
  if (!holderTravels) rows.unshift([policyholder.full_name, t.rolePolicyholder, '—']);
  return rows;
}

export function buildPolicyPdf({ policy_number, issued_at, summary, brand, terms_url }) {
  return new Promise((resolve, reject) => {
    const c = brand.colors;
    const t = brand.texts.certificate;
    const PAGE_W = 595.28; // A4 in points
    const PAGE_H = 841.89;
    const M = 40; // side margins (40 pt ≈ 53 px)
    const MB = 32; // bottom margin (32 pt ≈ 43 px)
    const W = PAGE_W - 2 * M;
    const FOOTER_H = 50; // reserved at the bottom of every page

    // Bottom margin is small on purpose: we place everything ourselves and must be able to
    // draw the footer near the bottom without PDFKit starting a new page on its own.
    const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 10, left: M, right: M }, info: { Title: `${brand.texts.certificateTitle} ${policy_number}`, Author: brand.name } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);

    const { trip, plan, policyholder, travelers, total_eur, exclusions } = summary;
    const bottomLimit = PAGE_H - MB - FOOTER_H; // content must end above this

    // Writes text at an exact spot and returns its height.
    const put = (str, x, y, { f = 'text', size = 9.5, color = c.night, width, align = 'left' } = {}) => {
      doc.font(f).fontSize(size).fillColor(color).text(str, x, y, { width, align, lineGap: 1 });
      return doc.heightOfString(str, { width, lineGap: 1 });
    };
    const measure = (str, { f = 'text', size = 9.5, width }) => doc.font(f).fontSize(size).heightOfString(str, { width, lineGap: 1 });

    // ---------- on every page: red strip + footer ----------
    function pageFrame() {
      doc.rect(0, 0, PAGE_W, 26).fill(c.red);
      put(t.topStrip, M, 8.5, { f: 'bold', size: 9.5, color: c.white, width: W, align: 'center' });
      const fy = PAGE_H - MB - FOOTER_H + 12;
      doc.moveTo(M, fy - 8).lineTo(M + W, fy - 8).lineWidth(0.75).strokeColor(c.border).stroke();
      const leftW = W - 170;
      const h = put(t.footer, M, fy, { size: 9, color: c.secondary, width: leftW });
      put(`${t.termsLabel} ${terms_url}`, M, fy + h + 2, { size: 9, color: c.turquoiseText, width: leftW });
      put(brand.claim, M + leftW, fy, { f: 'heading', size: 10, color: c.turquoiseText, width: 170, align: 'right' });
    }
    let y;
    function newPage() {
      doc.addPage();
      pageFrame();
      y = 26 + 24;
    }
    const ensure = need => { if (y + need > bottomLimit) newPage(); };

    // ---------- page 1 ----------
    pageFrame();

    // Header band (sky): logo left, policy number right.
    doc.rect(0, 26, PAGE_W, 68).fill(c.sky);
    const sym = brand.symbol;
    doc.save().translate(M, 38).scale(44 / 56); // the symbol is drawn on a 56 × 56 grid
    doc.circle(sym.sun.cx, sym.sun.cy, sym.sun.r).fill(c.yellow);
    doc.polygon(...sym.mountain.split(' ').map(pt => pt.split(',').map(Number))).fill(c.turquoise);
    doc.restore();
    put(brand.logo.wordmark, M + 52, 38, { f: 'heading', size: 24 });
    put(brand.logo.tagline, M + 53, 68, { f: 'bold', size: 9, color: c.turquoiseText });
    put(t.policyNumberLabel, M, 35, { f: 'bold', size: 9, color: c.secondary, width: W, align: 'right' });
    put(policy_number, M, 47, { f: 'heading', size: 18, width: W, align: 'right' });
    put(`${t.issuedOn} ${issuedEs(issued_at)}`, M, 71, { size: 9.5, color: c.secondary, width: W, align: 'right' });

    // Title + plan pill.
    y = 108;
    put(brand.texts.certificateTitle, M, y, { f: 'heading', size: 18 });
    const pill = `${t.planPill} ${plan.plan_name}`;
    doc.font('bold').fontSize(10);
    const pillW = doc.widthOfString(pill) + 24;
    doc.roundedRect(M + W - pillW, y + 1, pillW, 22, 11).fill(c.turquoise);
    put(pill, M + W - pillW, y + 7, { f: 'bold', size: 10, color: c.white, width: pillW, align: 'center' });
    y += 34;

    // Four boxes in a row.
    const n = travelers.length;
    const boxes = [
      [t.destination, trip.destination_name, trip.zone_name],
      [t.dates, rangeEs(trip.departure_date, trip.return_date), `${trip.days} ${t.days}`],
      [t.origin, trip.origin_name, `${n} ${n === 1 ? t.travelerOne : t.travelerMany}`],
      [t.total, formatEur(total_eur), t.simulatedPayment],
    ];
    const gap = 10;
    const boxW = (W - gap * 3) / 4;
    const boxH = 56;
    boxes.forEach(([label, main, sub], i) => {
      const x = M + i * (boxW + gap);
      if (i === 3) doc.roundedRect(x, y, boxW, boxH, 6).fill(c.paleYellow);
      doc.roundedRect(x, y, boxW, boxH, 6).lineWidth(0.75).strokeColor(c.border).stroke();
      put(label.toUpperCase(), x + 10, y + 7, { f: 'bold', size: 9, color: c.secondary, width: boxW - 20 });
      // Shrink the main value (never below 9 pt) so it stays on one line.
      let size = 12;
      doc.font('bold');
      while (size > 9 && doc.fontSize(size).widthOfString(main) > boxW - 20) size -= 0.5;
      put(main, x + 10, y + 20, { f: 'bold', size, width: boxW - 20 });
      put(sub, x + 10, y + 38, { size: 9, color: c.secondary, width: boxW - 20 });
    });
    y += boxH + 14;

    // ---------- tables ----------
    const sectionTitle = label => {
      ensure(60);
      put(label, M, y, { f: 'heading', size: 12 });
      y += 18;
    };
    // cols: [{ title, width, align, bold }]
    function table(cols, rows, { highlightLast = false } = {}) {
      const header = () => {
        doc.rect(M, y, W, 18).fill(c.sky);
        let x = M;
        for (const col of cols) {
          put(col.title, x + 8, y + 4.5, { f: 'bold', size: 9, width: col.width - 16, align: col.align });
          x += col.width;
        }
        y += 18;
      };
      header();
      rows.forEach((row, r) => {
        const h = Math.max(...row.map((cell, i) => measure(cell, { f: cols[i].bold ? 'bold' : 'text', size: 9.5, width: cols[i].width - 16 }))) + 5;
        if (y + h > bottomLimit) { newPage(); header(); }
        if (highlightLast && r === rows.length - 1) doc.rect(M, y, W, h).fill(c.paleYellow);
        let x = M;
        row.forEach((cell, i) => {
          put(cell, x + 8, y + 2.5, { f: cols[i].bold ? 'bold' : 'text', size: 9.5, width: cols[i].width - 16, align: cols[i].align });
          x += cols[i].width;
        });
        y += h;
        doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.5).strokeColor(c.border).stroke();
      });
      y += 12;
    }

    sectionTitle(t.peopleTitle);
    table(
      [{ title: t.name, width: 250 }, { title: t.role, width: 145 }, { title: t.birthDate, width: W - 395 }],
      peopleRows(policyholder, travelers, t),
    );

    sectionTitle(t.coverageTitle);
    table(
      [{ title: t.coverage, width: 205 }, { title: t.limit, width: W - 205, align: 'right', bold: true }],
      [...coverageRows(plan), [t.excess, formatEur(plan.excess_per_medical_claim_eur)]],
      { highlightLast: true },
    );

    // ---------- bottom: exclusions (left) + emergency box (right) ----------
    const rightW = 190;
    const leftW = W - rightW - 20;
    const BULLET = 10; // hanging indent: wrapped lines line up with the text, not the bullet
    const exclH = 18 + exclusions.reduce((sum, e) => sum + measure(e, { size: 9, width: leftW - BULLET }) + 1, 0);
    const boxInner = rightW - 28;
    const emergency = [
      [t.emergencyTitle, 'heading', 12],
      [t.emergencyText, 'text', 9.5],
      [t.emergencyPhone, 'bold', 10],
      [t.emergencyKeepNumber, 'text', 9.5],
    ];
    const emerH = 22 + emergency.reduce((sum, [s, f, size]) => sum + measure(s, { f, size, width: boxInner }) + 5, 0);
    ensure(Math.max(exclH, emerH));

    put(t.exclusionsTitle, M, y, { f: 'heading', size: 12 });
    let ly = y + 18;
    for (const e of exclusions) {
      put('•', M, ly, { size: 9, color: c.secondary });
      ly += put(e, M + BULLET, ly, { size: 9, color: c.secondary, width: leftW - BULLET }) + 1;
    }

    const bx = M + W - rightW;
    doc.roundedRect(bx, y, rightW, emerH, 8).fill(c.turquoise);
    let ry = y + 12;
    for (const [s, f, size] of emergency) ry += put(s, bx + 14, ry, { f, size, color: c.white, width: boxInner }) + 5;

    doc.end();
  });
}
