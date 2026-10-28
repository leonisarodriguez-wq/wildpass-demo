// Builds the policy certificate PDF with PDFKit. Returns a Buffer.
import PDFDocument from 'pdfkit';
import { formatEur } from './business.js';

export function buildPolicyPdf({ policy_number, issued_at, summary, brand, pricing }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${brand.texts.certificateTitle} ${policy_number}`, Author: brand.name } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const disclaimerBox = () => {
      const y = doc.y;
      doc.rect(50, y, 495, 46).fill(brand.colors.banner);
      doc.fillColor(brand.colors.bannerText).font('Helvetica-Bold').fontSize(22)
        .text(brand.pdfDisclaimer, 50, y + 13, { width: 495, align: 'center' });
      doc.fillColor('#000000').font('Helvetica').fontSize(10);
      doc.y = y + 60;
      doc.x = 50;
    };
    const heading = text => {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor(brand.colors.primary).text(text);
      doc.font('Helvetica').fontSize(10).fillColor('#000000').moveDown(0.2);
    };
    const line = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(String(value));
    };

    const { trip, plan, policyholder, travelers, total_eur, exclusions } = summary;

    disclaimerBox();
    doc.font('Helvetica-Bold').fontSize(18).fillColor(brand.colors.primary).text(`${brand.name} · ${brand.texts.certificateTitle}`);
    doc.font('Helvetica').fontSize(10).fillColor('#000000').moveDown(0.3);
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

    doc.moveDown(1);
    disclaimerBox();
    doc.fontSize(8).fillColor('#555555').text(`Documento de demostración generado por ${brand.name}. No tiene validez como contrato de seguro y no ofrece ninguna cobertura. Moneda: ${pricing.currency}.`);
    doc.end();
  });
}
