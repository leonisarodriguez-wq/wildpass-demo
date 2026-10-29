// /metricas: the funnel, web vs agents, Wild vs Wild+, the experiments and every event, from src/events.js.
// Server-rendered (no chart library). Bars are inline SVG with width attributes (the CSP blocks style=""): each bar has
// its label and number as text next to it, so nothing depends on colour, and a <title> as the hover tooltip.
import { escapeHtml, fill } from './landing.js';
import { sampleSizePerVariant, twoProportionTest } from './events.js';

const pct = (x, digits = 1) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(x * 100)} %`;
const num = n => new Intl.NumberFormat('es-ES').format(n);
const dateEs = iso => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// One labelled bar row: label, number, bar (share of `max`), optional note.
function barRow({ label, value, max, note = '' }) {
  const share = max > 0 ? value / max : 0;
  const width = Math.max(share * 100, value > 0 ? 0.8 : 0);
  return `<li class="bar-row"><span class="bar-label">${escapeHtml(label)}</span><span class="bar-value">${escapeHtml(num(value))}</span>`
    + `<svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><title>${escapeHtml(`${label}: ${num(value)}`)}</title>`
    + `<rect class="bar-track" x="0" y="0" width="100" height="10" rx="2"/><rect class="bar-fill" x="0" y="0" width="${width.toFixed(2)}" height="10" rx="2"/></svg>`
    + (note ? `<span class="bar-note">${escapeHtml(note)}</span>` : '') + '</li>';
}

function funnelList(steps, m) {
  const max = steps[0].n || Math.max(...steps.map(s => s.n), 0);
  return `<ol class="bars funnel">${steps.map((s, i) => barRow({
    label: m.steps[s.step], value: s.n, max,
    note: i === 0 ? '' : steps[i - 1].n ? fill(m.stepOfPrevious, { pct: pct(s.n / steps[i - 1].n) }) : '—',
  })).join('')}</ol>`;
}

function experimentHtml(id, rows, m, exp) {
  const t = m.experiments[id];
  const [a, b] = rows;
  const rate = r => (r.sessions ? r.conversions / r.sessions : null);
  const observed = a.sessions >= exp.observedFrom && rate(a) > 0 && rate(a) < 1;
  const p1 = observed ? rate(a) : exp[id].baseline;
  const p2 = Math.min(p1 + exp[id].liftPoints, 0.99);
  const needed = sampleSizePerVariant(p1, p2);
  let verdict = fill(m.notEnough, { n: num(needed) });
  if (a.sessions >= needed && b.sessions >= needed) {
    const test = twoProportionTest(a.conversions, a.sessions, b.conversions, b.sessions);
    const p = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(test.p_value);
    verdict = test.p_value < 0.05
      ? fill(m.significant, { n: num(needed), p, winner: rate(b) > rate(a) ? 'B' : 'A' })
      : fill(m.notSignificant, { n: num(needed), p });
  }
  const diff = rate(a) !== null && rate(b) !== null ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format((rate(b) - rate(a)) * 100) : '—';
  return `<section class="metrics-card" aria-labelledby="exp-${id}">
    <h3 id="exp-${id}">${escapeHtml(t.title)}</h3>
    <p class="exp-metric">${escapeHtml(t.metric)}</p>
    <ul class="exp-variants"><li><strong>A</strong> ${escapeHtml(t.a)}</li><li><strong>B</strong> ${escapeHtml(t.b)}</li></ul>
    <div class="table-scroll"><table class="metrics-table">
      <thead><tr><th scope="col">${escapeHtml(m.variantCol)}</th><th scope="col">${escapeHtml(m.sessionsCol)}</th><th scope="col">${escapeHtml(m.rateCol)}</th></tr></thead>
      <tbody>${rows.map(r => `<tr><th scope="row">${escapeHtml(r.variant.toUpperCase())}</th><td>${num(r.sessions)}</td><td>${rate(r) === null ? '—' : escapeHtml(fill(m.rateCell, { x: num(r.conversions), n: num(r.sessions), pct: pct(rate(r)) }))}</td></tr>`).join('')}</tbody>
    </table></div>
    <p>${escapeHtml(fill(m.difference, { diff }))} · ${escapeHtml(fill(observed ? m.baselineObserved : m.baselineAssumed, { p: pct(p1, 0) }))}</p>
    <p class="exp-verdict"><strong>${escapeHtml(verdict)}</strong></p>
  </section>`;
}

// admin: { key } when ?admin= matched METRICS_ADMIN_KEY (shows the delete form), plus a flash message.
export function metricsPageBody({ brand, data, experiments, admin = null, flash = '' }) {
  const m = brand.texts.metrics;
  const f = data.funnel;
  const plansMax = Math.max(...Object.values(data.plans.selected), ...Object.values(data.plans.issued), 0);
  const planName = id => (id === 'wild' ? 'Wild' : 'Wild+');
  const channel = key => `<section class="metrics-card" aria-labelledby="ch-${key}"><h3 id="ch-${key}">${escapeHtml(m[key])}</h3>${funnelList(f[key], m)}</section>`;
  const formula = m.formula.map(line => `<p>${escapeHtml(fill(line, {
    lift: num(experiments.hero.liftPoints * 100), observedFrom: num(experiments.observedFrom),
    hero: pct(experiments.hero.baseline, 0), upsell: pct(experiments.upsell.baseline, 0),
  }))}</p>`).join('');
  const adminHtml = admin ? `<section class="metrics-admin" aria-labelledby="admin-title"><h2 id="admin-title">${escapeHtml(m.admin.title)}</h2><p>${escapeHtml(m.admin.text)}</p>
    <form method="post" action="/metricas/borrar"><input type="hidden" name="admin" value="${escapeHtml(admin.key)}">
      <label class="check" for="confirm-delete"><input type="checkbox" id="confirm-delete" name="confirm" value="si" required> <span>${escapeHtml(m.admin.confirm)}</span></label>
      <button type="submit" class="secondary">${escapeHtml(m.admin.button)}</button></form></section>` : '';

  return `<h1>${escapeHtml(m.title)}</h1>
    ${flash ? `<p class="metrics-flash" role="status">${escapeHtml(flash)}</p>` : ''}
    <p class="metrics-since"><strong>${escapeHtml(data.first_event_at ? fill(m.since, { date: dateEs(data.first_event_at) }) : m.empty)}</strong></p>
    <p>${escapeHtml(m.how)} ${escapeHtml(fill(m.totalEvents, { n: num(data.total_events) }))}</p>
    <h2>${escapeHtml(m.funnelTitle)}</h2>
    <p>${escapeHtml(m.funnelIntro)}</p>
    ${funnelList(f.all, m)}
    <h2>${escapeHtml(m.channelsTitle)}</h2>
    <p>${escapeHtml(m.channelsIntro)}</p>
    <div class="metrics-grid">${channel('web')}${channel('agent')}</div>
    <h2>${escapeHtml(m.plansTitle)}</h2>
    <div class="metrics-grid">
      <section class="metrics-card" aria-labelledby="plans-selected"><h3 id="plans-selected">${escapeHtml(m.plansSelected)}</h3><ul class="bars">${Object.entries(data.plans.selected).map(([id, n]) => barRow({ label: planName(id), value: n, max: plansMax })).join('')}</ul></section>
      <section class="metrics-card" aria-labelledby="plans-issued"><h3 id="plans-issued">${escapeHtml(m.plansIssued)}</h3><ul class="bars">${Object.entries(data.plans.issued).map(([id, n]) => barRow({ label: planName(id), value: n, max: plansMax })).join('')}</ul></section>
    </div>
    <h2>${escapeHtml(m.experimentsTitle)}</h2>
    <p>${escapeHtml(m.forceNote)}</p>
    <div class="metrics-grid">${experimentHtml('hero', data.experiments.hero, m, experiments)}${experimentHtml('upsell', data.experiments.upsell, m, experiments)}</div>
    <details class="review-more metrics-formula"><summary>${escapeHtml(m.formulaTitle)}</summary>${formula}</details>
    <h2>${escapeHtml(m.eventsTitle)}</h2>
    <div class="table-scroll"><table class="metrics-table"><thead><tr><th scope="col">${escapeHtml(m.eventCol)}</th><th scope="col">${escapeHtml(m.countCol)}</th></tr></thead>
      <tbody>${Object.entries(data.events).map(([name, n]) => `<tr><th scope="row"><code>${escapeHtml(name)}</code></th><td>${num(n)}</td></tr>`).join('')}</tbody></table></div>
    ${adminHtml}`;
}
