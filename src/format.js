// Spanish date formats for the certificate and the email (never YYYY-MM-DD for customers).
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const parts = iso => iso.slice(0, 10).split('-').map(Number); // [year, month, day]
export const dateEs = iso => { const [y, m, d] = parts(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; };
// "10–24 dic 2026", "28 nov – 5 dic 2026" or "28 dic 2026 – 5 ene 2027"
export function rangeEs(fromIso, toIso) {
  const [y1, m1, d1] = parts(fromIso);
  const [y2, m2, d2] = parts(toIso);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
}
// The issue moment as a date in Spain.
export const issuedEs = isoInstant => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(isoInstant));
