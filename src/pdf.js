// Builds the policy certificate PDF with PDFKit and the brand fonts. Returns a Buffer.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { formatEur } from './business.js';

const font = path => fileURLToPath(new URL(`../node_modules/@fontsource/${path}`, import.meta.url));
const FONTS = {
  heading: font('space-grotesk/files/space-grotesk-latin-700-normal.woff'),
  text: font('inter/files/inter-latin-400-normal.woff'),
  bold: font('inter/files/inter-latin-700-normal.woff'),
};

export function buildPolicyPdf({ policy_number, issued_at, summary, brand, pricing }) {
  return new Promise((resolve, reject) => {
    const c = brand.colors;
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 40, left: 50, right: 50 }, info: { Title: `${brand.texts.certificateTitle} ${policy_number}`, Author: brand.name } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);

    const text = () => doc.font('text').fontSize(10).fillColor(c.night);
    const disclaimerBox = () => {
      const y = doc.y;
      doc.rect(50, y, 495, 38).fill(c.red);
      doc.fillColor(c.white).font('heading').fontSize(20).text(brand.pdfDisclaimer, 50, y + 8, { width: 495, align: 'center' });
      text();
      doc.y = y + 48;
      doc.x = 50;
    };
    const heading = label => {
      doc.moveDown(0.45).font('heading').fontSize(13).fillColor(c.night).text(label);
      const y = doc.y + 1;
      doc.moveTo(50, y).lineTo(90, y).lineWidth(2).strokeColor(c.turquoise).stroke();
      text().moveDown(0.35);
    };
    const line = (label, value) => {
      doc.font('bold').text(`${label}: `, { continued: true }).font('text').text(String(value));
    };

    const { trip, plan, policyholder, travelers, total_eur, exclusions } = summary;

    // Logo: the symbol (same shapes as the website SVG), then "wildpass" and the tagline.
    const sym = brand.symbol;
    const size = 46;
    const k = size / 56; // the symbol is drawn on a 56 × 56 grid
    doc.save().translate(50, 46).scale(k);
    doc.circle(sym.sun.cx, sym.sun.cy, sym.sun.r).fill(c.yellow);
    doc.polygon(...sym.mountain.split(' ').map(pt => pt.split(',').map(Number))).fill(c.turquoise);
    doc.restore();
    doc.fillColor(c.night).font('heading').fontSize(26).text(brand.logo.wordmark, 102, 48, { lineBreak: false });
    doc.fillColor(c.turquoiseText).font('bold').fontSize(9).text(brand.logo.tagline, 103, 78, { lineBreak: false });

    // Turquoise band with the claim in white.
    doc.rect(50, 100, 495, 26).fill(c.turquoise);
    doc.fillColor(c.white).font('heading').fontSize(12).text(brand.claim, 62, 107, { width: 471, lineBreak: false });
    doc.x = 50;
    doc.y = 136;

    disclaimerBox();
    doc.font('heading').fontSize(18).fillColor(c.night).text(brand.texts.certificateTitle);
    text().moveDown(0.3);
    line('Número de póliza', policy_number);
    line('Emitida', issued_at.slice(0, 10));
    line('Plan', plan.plan_name);
    line('Total pagado (simulado)', formatEur(total_eur));

    heading('Viaje');
    line('Origen', trip.origin_name);
    line('Destino', `${trip.destination_name} (${trip.zone_name})`);
    line('Fechas', `del ${trip.departure_date} al ${trip.return_date} (${trip.days} días)`);

    heading('Tomador');
    line('Nombre', policyholder.full_name);
    line('Correo', policyholder.email);

    heading('Viajeros asegurados');
    travelers.forEach((t, i) => doc.text(`${i + 1}. ${t.full_name} — nacido/a el ${t.birth_date} (${t.age_at_departure} años al salir)`));

    heading('Coberturas y límites');
    plan.coverage_summary.forEach(s => doc.text(`• ${s}`));
    line('Franquicia por siniestro médico', formatEur(plan.excess_per_medical_claim_eur));

    heading('Exclusiones');
    exclusions.forEach(e => doc.text(`• ${e}`));

    // Closing banner + footnote need about 72pt; only start a new page if they really don't fit.
    doc.moveDown(0.6);
    if (doc.y + 72 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    disclaimerBox();
    doc.fontSize(8).fillColor(c.secondary).text(`Documento de demostración generado por ${brand.name}. No tiene validez como contrato de seguro y no ofrece ninguna cobertura. Moneda: ${pricing.currency}.`);
    doc.end();
  });
}
