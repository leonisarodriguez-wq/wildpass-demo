// Policy certificate PDF: Spanish dates, and the page budget (1 page for up to 3 travellers).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { buildPolicyPdf, dateEs, rangeEs } from '../src/pdf.js';
import brand from '../config/brand.config.js';

let server, base, dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-pdf-'));
  const { app } = createApp({ dataDir, env: {} });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const call = async (action, body) => (await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const pageCount = buf => (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

// The real summary that review_order freezes for an order with `count` adult travellers on Wild+
// (the plan with the longest coverage lines).
async function reviewedSummary(count) {
  const dep = addDays(today, 40);
  const q = await call('get_quote', { origin_country: 'ES', destination_country: 'TH', departure_date: dep, return_date: addDays(dep, 14), traveler_ages: Array(count).fill(40) });
  const o = await call('select_plan', { quote_id: q.quote_id, plan: 'wild_plus' });
  const birth = addDays(`${Number(dep.slice(0, 4)) - 40}${dep.slice(4)}`, -1);
  const d = await call('set_traveler_details', {
    order_id: o.order_id,
    policyholder: { full_name: 'Tomadora Que No Viaja', email: 'tomadora@example.com' }, // adds one extra table row
    travelers: Array.from({ length: count }, (_, i) => ({ full_name: `Viajero Número ${i + 1} De Prueba`, birth_date: birth })),
  });
  assert.equal(d.ok, true, d.message);
  return (await call('review_order', { order_id: o.order_id })).summary;
}

const build = summary => buildPolicyPdf({ policy_number: 'WILD-2026-TEST23', issued_at: new Date().toISOString(), summary, brand, terms_url: 'https://example.com/condiciones' });

test('dates are shown in Spanish format', () => {
  assert.equal(dateEs('2026-12-10'), '10/12/2026');
  assert.equal(rangeEs('2026-12-10', '2026-12-24'), '10–24 dic 2026');
  assert.equal(rangeEs('2026-11-28', '2026-12-05'), '28 nov – 5 dic 2026');
  assert.equal(rangeEs('2026-12-28', '2027-01-05'), '28 dic 2026 – 5 ene 2027');
});

test('certificate fits on one page for 1 to 3 travellers (even with a separate policyholder)', async () => {
  for (const count of [1, 2, 3]) {
    const pdf = await build(await reviewedSummary(count));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(pageCount(pdf), 1, `${count} travellers should fit on one page`);
  }
});

test('8 travellers flow onto a second page', async () => {
  assert.equal(pageCount(await build(await reviewedSummary(8))), 2);
});
