// Checks our prices against the market targets in docs/pricing-research.md (within ±5%).
// Trips use the same date lengths as the competitor quotes (our app counts both end days).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

let server, base, dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'travel-demo-pricing-'));
  const { app } = createApp({ dataDir, env: {} });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DEP = addDays(today, 45);

async function quote(destination, ourDays, ages) {
  const res = await fetch(`${base}/api/get_quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin_country: 'ES', destination_country: destination, departure_date: DEP, return_date: addDays(DEP, ourDays - 1), traveler_ages: ages }),
  });
  const q = await res.json();
  assert.equal(q.ok, true, q.message);
  assert.equal(q.trip.days, ourDays);
  return Object.fromEntries(q.plans.map(p => [p.plan, p.price_per_traveler.map(t => t.price_eur)]));
}

function within5(actual, target, label) {
  const diff = (actual / target - 1) * 100;
  assert.ok(Math.abs(diff) <= 5, `${label}: ${actual} € is ${diff.toFixed(1)}% from target ${target} €`);
}

// Target "7 days" = 10–17 Dec = 8 days for us; "10 days" = 10–20 Dec = 11; "14 days" = 10–24 Dec = 15.
const TARGETS = [
  { label: 'Europe "7 days" (Italy)', destination: 'IT', ourDays: 8, wild: 22, wild_plus: 29.5 },
  { label: 'Rest of world "10 days" (Mexico)', destination: 'MX', ourDays: 11, wild: 55, wild_plus: 78 },
  { label: 'Rest of world "14 days" (Thailand)', destination: 'TH', ourDays: 15, wild: 60, wild_plus: 85 },
  { label: 'USA/Canada/Japan "10 days" (USA)', destination: 'US', ourDays: 11, wild: 57, wild_plus: 80 },
];

for (const t of TARGETS) {
  test(`market target: ${t.label}`, async () => {
    const prices = await quote(t.destination, t.ourDays, [35]);
    within5(prices.wild[0], t.wild, `${t.label} Wild`);
    within5(prices.wild_plus[0], t.wild_plus, `${t.label} Wild+`);
  });
}

test('market target: two adults to the USA are priced per person', async () => {
  const prices = await quote('US', 11, [35, 38]);
  for (const p of prices.wild) within5(p, 57, 'USA Wild per person');
  for (const p of prices.wild_plus) within5(p, 80, 'USA Wild+ per person');
});

test('age 65-74 costs 1.65 × the adult price (Intermundial evidence)', async () => {
  const prices = await quote('MX', 11, [35, 68]);
  for (const plan of ['wild', 'wild_plus']) {
    const [adult, senior] = prices[plan];
    assert.ok(Math.abs(senior - adult * 1.65) <= 0.02, `${plan}: ${senior} is not 1.65 × ${adult}`);
  }
});

test('cost per day still falls for longer trips', async () => {
  const short = await quote('TH', 8, [35]);
  const long = await quote('TH', 30, [35]);
  assert.ok(long.wild[0] / 30 < short.wild[0] / 8);
});

// Long trips (assumption, no market data), counted like competitors: their "day 15" is our
// day 16, and their 10–14-day trips are our 11–15-day trips. From our day 16, each extra day
// costs the average price PER DAY of an 11–15-day trip.
test('from day 16 (competitors\' day 15), each extra day costs the average price per day of 11-15-day trips', async () => {
  for (const destination of ['IT', 'TH', 'US']) {
    for (const plan of ['wild', 'wild_plus']) {
      const price = {};
      for (const days of [11, 12, 13, 14, 15, 16, 17, 30, 60, 90]) price[days] = (await quote(destination, days, [35]))[plan][0];
      const averagePerDay = [11, 12, 13, 14, 15].reduce((sum, d) => sum + price[d] / d, 0) / 5;
      for (const [from, to] of [[15, 16], [16, 17]]) {
        const added = price[to] - price[from];
        assert.ok(Math.abs(added - averagePerDay) <= 0.02, `${destination} ${plan}: day ${to} adds ${added.toFixed(2)}, expected ${averagePerDay.toFixed(2)}`);
      }
      // A straight line from day 16: every 30 extra days add 30 × the same daily price.
      assert.ok(Math.abs(price[90] - price[60] - 30 * averagePerDay) <= 0.05, `${destination} ${plan}: 60→90 days is not linear`);
      assert.ok(Math.abs(price[60] - price[30] - 30 * averagePerDay) <= 0.05, `${destination} ${plan}: 30→60 days is not linear`);
    }
  }
});

test('90-day Rest of world Wild costs about 395 € (agreed long-trip rule)', async () => {
  const p = await quote('TH', 90, [35]);
  assert.ok(p.wild[0] > 380 && p.wild[0] < 410, `90-day Rest of world Wild is ${p.wild[0]} €`);
});
