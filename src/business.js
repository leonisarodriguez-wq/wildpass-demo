// ALL business logic: validation, pricing, order state and payment rules.
// The website and the WebMCP tools both reach these functions through the same JSON API.
// Every function returns { ok: true, ... } or { ok: false, error_code, message, how_to_fix }.
import { randomUUID, randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTRY_SET } from '../config/countries.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const POLICY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to avoid confusion
const DAY_MS = 86_400_000;

// ---------- small helpers ----------

export function fail(error_code, message, how_to_fix, extra = {}) {
  return { ok: false, error_code, message, how_to_fix, ...extra };
}

const toEur = cents => Math.round(cents) / 100;
const sha256 = text => createHash('sha256').update(text).digest('hex');
const countryName = code => new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code;

export function formatEur(amount) {
  // useGrouping 'always' so 2500 shows as "2.500 €" (Spanish default would print "2500 €").
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always', maximumFractionDigits: 2, minimumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}

function todayMadrid(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Returns a UTC timestamp for a strict YYYY-MM-DD string, or null if it is not a real date.
function parseDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return t;
}

function ageOn(birthDate, onDate) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Rejects missing objects and unknown fields, so typos are caught instead of silently ignored.
function checkShape(input, allowed, what = 'input') {
  if (!isPlainObject(input)) {
    return fail('INVALID_INPUT', `Los datos de ${what} deben ser un objeto JSON.`, `Envía un objeto con los campos: ${allowed.join(', ')}.`);
  }
  const unknown = Object.keys(input).filter(k => !allowed.includes(k));
  if (unknown.length) {
    return fail('UNKNOWN_FIELD', `Campo(s) no reconocido(s) en ${what}: ${unknown.join(', ')}.`, `Usa solo estos campos: ${allowed.join(', ')}.`);
  }
  return null;
}

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f<>]/.test(name)) return null;
  return name;
}

function cleanEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

// ---------- main factory ----------

const DELIVERY_RECHECK_MS = 60_000; // ask Brevo at most once a minute per policy

export function createBusiness({ db, pricing, brand, pdfDir, buildPdf, email, now = () => new Date() }) {
  const L = pricing.limits;
  const PLAN_IDS = Object.keys(pricing.plans);
  const planIdList = PLAN_IDS.map(id => `"${id}"`).join(' or ');

  const zoneOf = code => {
    for (const [zone, codes] of Object.entries(pricing.zones)) if (codes.includes(code)) return zone;
    return 'rest_of_world';
  };

  const ageFactor = age => pricing.ageFactors.find(b => age >= b.minAge && age <= b.maxAge)?.factor ?? null;

  // Trip-length multiplier: a falling per-day cost up to longTrip.fromDay - 1, then each
  // extra day costs the average price PER DAY of the trip lengths in averagePerDayOfTrips.
  const curve = days => Math.pow(days / pricing.baseDays, pricing.lengthExponent);
  function lengthMultiplier(days) {
    const { fromDay, averagePerDayOfTrips: [first, last] } = pricing.longTrip;
    const lastCurveDay = fromDay - 1;
    if (days <= lastCurveDay) return curve(days);
    let sumPerDay = 0;
    for (let d = first; d <= last; d++) sumPerDay += curve(d) / d;
    const perExtraDay = sumPerDay / (last - first + 1);
    return curve(lastCurveDay) + (days - lastCurveDay) * perExtraDay;
  }

  function pricePerTravelerCents(zone, plan, days, age) {
    const base = pricing.basePrice7Days[zone][plan];
    const scaled = base * lengthMultiplier(days) * ageFactor(age);
    return Math.round((scaled + Number.EPSILON) * 100);
  }

  function planDetails(planId, zone) {
    const plan = pricing.plans[planId];
    const medicalKey = zone === 'europe' ? 'medical_expenses_europe_eur' : 'medical_expenses_rest_of_world_eur';
    const coverage_summary = Object.entries(plan.coverage).map(([key, value]) => {
      const label = pricing.coverageLabels[key] ?? key;
      if (typeof value === 'string') return `${label}: ${value}`;
      return `${label}: ${value > 0 ? formatEur(value) : 'no incluida'}`;
    });
    return {
      plan: planId,
      plan_name: plan.name,
      coverage_limits_eur: plan.coverage,
      medical_limit_for_this_trip_eur: plan.coverage[medicalKey],
      cancellation_included: plan.coverage.cancellation_per_traveler_eur > 0,
      adventure_sports_included: plan.adventure_sports_included,
      ...(plan.adventure_sports_limits && { adventure_sports_limits: plan.adventure_sports_limits }),
      search_and_rescue_eur: plan.coverage.search_and_rescue_eur,
      excess_per_medical_claim_eur: plan.excess_per_medical_claim_eur,
      coverage_summary,
      exclusions: [...pricing.exclusions, ...plan.extraExclusions],
    };
  }

  function departureCheck(departure_date) {
    if (departure_date <= todayMadrid(now())) {
      return fail('DEPARTURE_PASSED', 'La fecha de salida ya no es futura.', 'Pide un presupuesto nuevo con get_quote y una fecha de salida posterior a hoy.');
    }
    return null;
  }

  const getQuoteRow = id => (typeof id === 'string' ? db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) : undefined);
  const getOrderRow = id => (typeof id === 'string' ? db.prepare('SELECT * FROM orders WHERE id = ?').get(id) : undefined);
  const getPolicyByOrder = id => db.prepare('SELECT * FROM policies WHERE order_id = ?').get(id);

  function loadQuote(quote_id) {
    const quote = getQuoteRow(quote_id);
    if (!quote) return { error: fail('QUOTE_NOT_FOUND', 'No existe ningún presupuesto con ese quote_id.', 'Usa el quote_id exacto devuelto por get_quote, o pide uno nuevo con get_quote.') };
    if (new Date(quote.expires_at) < now()) {
      return { error: fail('QUOTE_EXPIRED', 'El presupuesto ha caducado.', 'Pide un presupuesto nuevo con get_quote.') };
    }
    return { quote };
  }

  function loadOrder(order_id) {
    const order = getOrderRow(order_id);
    if (!order) return { error: fail('ORDER_NOT_FOUND', 'No existe ningún pedido con ese order_id.', 'Usa el order_id exacto devuelto por select_plan.') };
    if (order.status === 'paid') {
      const policy = getPolicyByOrder(order.id);
      return { error: fail('ALREADY_PAID', 'Este pedido ya está pagado.', 'No lo pagues otra vez. Consulta la póliza con get_policy.', { policy_number: policy?.policy_number }) };
    }
    return { order, quote: getQuoteRow(order.quote_id) };
  }

  function tripSummary(quote) {
    return {
      origin_country: quote.origin,
      origin_name: countryName(quote.origin),
      destination_country: quote.destination,
      destination_name: countryName(quote.destination),
      zone: quote.zone,
      zone_name: pricing.zoneNames[quote.zone],
      departure_date: quote.departure_date,
      return_date: quote.return_date,
      days: quote.days,
      traveler_ages: JSON.parse(quote.ages_json),
    };
  }

  // ---------- 1. get_quote ----------
  function getQuote(input) {
    const shapeError = checkShape(input, ['origin_country', 'destination_country', 'departure_date', 'return_date', 'traveler_ages'], 'get_quote');
    if (shapeError) return shapeError;

    const origin = typeof input.origin_country === 'string' ? input.origin_country.trim().toUpperCase() : '';
    const destination = typeof input.destination_country === 'string' ? input.destination_country.trim().toUpperCase() : '';
    if (!COUNTRY_SET.has(origin)) {
      return fail('INVALID_COUNTRY', 'origin_country no es un código de país válido.', 'Usa un código ISO 3166-1 de 2 letras, por ejemplo "ES" para España.');
    }
    if (!L.allowedOrigins.includes(origin)) {
      return fail('ORIGIN_NOT_SUPPORTED', `Por ahora solo aseguramos viajes que salen de España. ${countryName(origin)} no está disponible.`, 'Usa origin_country "ES". Si el viaje no sale de España, no podemos asegurarlo todavía.');
    }
    if (!COUNTRY_SET.has(destination)) {
      return fail('INVALID_COUNTRY', 'destination_country no es un código de país válido.', 'Usa un código ISO 3166-1 de 2 letras, por ejemplo "US" para Estados Unidos o "FR" para Francia.');
    }
    if (destination === origin) {
      return fail('SAME_COUNTRY', 'El país de destino debe ser distinto del país de salida.', 'Indica un país de destino diferente de España.');
    }

    const dep = parseDate(input.departure_date);
    const ret = parseDate(input.return_date);
    if (dep === null) return fail('INVALID_DATE', 'departure_date no es una fecha válida.', 'Usa el formato AAAA-MM-DD, por ejemplo "2026-12-10".');
    if (ret === null) return fail('INVALID_DATE', 'return_date no es una fecha válida.', 'Usa el formato AAAA-MM-DD, por ejemplo "2026-12-19".');
    const today = todayMadrid(now());
    if (input.departure_date <= today) {
      return fail('DEPARTURE_NOT_IN_FUTURE', `La fecha de salida debe ser posterior a hoy (${today}).`, 'Elige una fecha de salida a partir de mañana.');
    }
    if (ret <= dep) {
      return fail('RETURN_BEFORE_DEPARTURE', 'La fecha de regreso debe ser posterior a la de salida.', 'Revisa las fechas: return_date tiene que ser después de departure_date.');
    }
    const days = Math.round((ret - dep) / DAY_MS) + 1; // both days count
    if (days > L.maxTripDays) {
      return fail('TRIP_TOO_LONG', `El viaje dura ${days} días y el máximo es ${L.maxTripDays}.`, `Acorta el viaje a ${L.maxTripDays} días o menos (contando el día de salida y el de regreso).`);
    }

    const ages = input.traveler_ages;
    if (!Array.isArray(ages) || ages.length < L.minTravelers || ages.length > L.maxTravelers) {
      return fail('INVALID_TRAVELER_COUNT', `Debe haber entre ${L.minTravelers} y ${L.maxTravelers} viajeros.`, `Envía traveler_ages como una lista con entre ${L.minTravelers} y ${L.maxTravelers} edades, por ejemplo [35, 38].`);
    }
    const badAge = ages.findIndex(a => !Number.isInteger(a) || a < L.minAge || a > L.maxAge || ageFactor(a) === null);
    if (badAge !== -1) {
      return fail('INVALID_AGE', `La edad del viajero ${badAge + 1} (${JSON.stringify(ages[badAge])}) no es válida. Aseguramos de ${L.minAge} a ${L.maxAge} años.`, `Cada edad debe ser un número entero entre ${L.minAge} y ${L.maxAge}, la edad que tendrá el viajero el día de salida.`);
    }

    const zone = zoneOf(destination);
    const prices = {};
    for (const plan of PLAN_IDS) {
      const per = ages.map(age => pricePerTravelerCents(zone, plan, days, age));
      prices[plan] = { per_traveler_cents: per, total_cents: per.reduce((a, b) => a + b, 0) };
    }

    const id = randomUUID();
    const created = now();
    const expires = new Date(created.getTime() + L.quoteValidDays * DAY_MS);
    db.prepare(`INSERT INTO quotes (id, created_at, expires_at, origin, destination, zone, departure_date, return_date, days, ages_json, prices_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, created.toISOString(), expires.toISOString(), origin, destination, zone, input.departure_date, input.return_date, days, JSON.stringify(ages), JSON.stringify(prices));

    return {
      ok: true,
      quote_id: id,
      valid_until: expires.toISOString(),
      currency: pricing.currency,
      trip: tripSummary(getQuoteRow(id)),
      plans: PLAN_IDS.map(plan => ({
        ...planDetails(plan, zone),
        total_price_eur: toEur(prices[plan].total_cents),
        price_per_traveler: ages.map((age, i) => ({ traveler: i + 1, age, price_eur: toEur(prices[plan].per_traveler_cents[i]) })),
      })),
      exclusions_all_plans: pricing.exclusions,
      disclaimer: brand.demoBanner,
      next_step: `Show both plans to the user (only Wild+ covers adventure sports). When the user chooses, call select_plan with this quote_id and plan ${planIdList}.`,
    };
  }

  // ---------- 2. select_plan ----------
  function selectPlan(input) {
    const shapeError = checkShape(input, ['quote_id', 'plan'], 'select_plan');
    if (shapeError) return shapeError;
    const { quote, error } = loadQuote(input.quote_id);
    if (error) return error;
    const plan = typeof input.plan === 'string' ? input.plan.trim().toLowerCase() : '';
    if (!PLAN_IDS.includes(plan)) {
      return fail('INVALID_PLAN', 'El plan no existe.', `Usa plan ${PLAN_IDS.map(id => `"${id}"`).join(' o ')}.`);
    }
    const depError = departureCheck(quote.departure_date);
    if (depError) return depError;

    const total = JSON.parse(quote.prices_json)[plan].total_cents;
    const id = randomUUID();
    const ts = now().toISOString();
    db.prepare(`INSERT INTO orders (id, quote_id, plan, status, total_cents, created_at, updated_at) VALUES (?, ?, ?, 'plan_selected', ?, ?, ?)`)
      .run(id, quote.id, plan, total, ts, ts);
    return {
      ok: true,
      order_id: id,
      plan,
      plan_name: pricing.plans[plan].name,
      total_price_eur: toEur(total),
      traveler_ages: JSON.parse(quote.ages_json),
      next_step: 'Ask the user for the policyholder (full name, email) and each traveller\'s full name and birth date, in the same order as traveler_ages, then call set_traveler_details.',
    };
  }

  // ---------- 3. set_traveler_details ----------
  function setTravelerDetails(input) {
    const shapeError = checkShape(input, ['order_id', 'policyholder', 'travelers'], 'set_traveler_details');
    if (shapeError) return shapeError;
    const { order, quote, error } = loadOrder(input.order_id);
    if (error) return error;

    const phShape = checkShape(input.policyholder, ['full_name', 'email'], 'policyholder');
    if (phShape) return phShape;
    const phName = cleanName(input.policyholder.full_name);
    if (!phName) return fail('INVALID_NAME', 'El nombre del tomador no es válido.', 'Indica nombre y apellidos (de 2 a 100 caracteres).');
    const email = cleanEmail(input.policyholder.email);
    if (!email) return fail('INVALID_EMAIL', 'El correo electrónico no es válido.', 'Indica un correo como nombre@ejemplo.com.');

    const ages = JSON.parse(quote.ages_json);
    if (!Array.isArray(input.travelers) || input.travelers.length !== ages.length) {
      return fail('TRAVELER_COUNT_MISMATCH', `El presupuesto es para ${ages.length} viajero(s), pero se enviaron ${Array.isArray(input.travelers) ? input.travelers.length : 0}.`, `Envía exactamente ${ages.length} viajero(s), en el mismo orden que las edades del presupuesto: ${ages.join(', ')}. Si cambió el número de viajeros, pide un presupuesto nuevo.`);
    }

    const travelers = [];
    for (const [i, t] of input.travelers.entries()) {
      const tShape = checkShape(t, ['full_name', 'birth_date'], `viajero ${i + 1}`);
      if (tShape) return tShape;
      const name = cleanName(t.full_name);
      if (!name) return fail('INVALID_NAME', `El nombre del viajero ${i + 1} no es válido.`, 'Indica nombre y apellidos (de 2 a 100 caracteres).');
      if (parseDate(t.birth_date) === null || t.birth_date > todayMadrid(now())) {
        return fail('INVALID_BIRTH_DATE', `La fecha de nacimiento del viajero ${i + 1} no es válida.`, 'Usa el formato AAAA-MM-DD con una fecha pasada, por ejemplo "1990-05-20".');
      }
      const age = ageOn(t.birth_date, quote.departure_date);
      if (age !== ages[i]) {
        return fail('AGE_MISMATCH', `El viajero ${i + 1} tendrá ${age} años el ${quote.departure_date}, pero el presupuesto es para ${ages[i]} años.`, `Comprueba la fecha de nacimiento del viajero ${i + 1} y el orden de los viajeros (edades del presupuesto, en orden: ${ages.join(', ')}). Si la edad era incorrecta, pide un presupuesto nuevo con get_quote.`, { traveler: i + 1, quoted_age: ages[i], age_at_departure: age });
      }
      travelers.push({ full_name: name, birth_date: t.birth_date });
    }

    // Saving new details always cancels any previous review_token.
    db.prepare(`UPDATE orders SET policyholder_json = ?, travelers_json = ?, status = 'details_set', review_token_hash = NULL, review_total_cents = NULL, review_snapshot_json = NULL, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify({ full_name: phName, email }), JSON.stringify(travelers), now().toISOString(), order.id);
    return { ok: true, order_id: order.id, status: 'details_set', next_step: 'Call review_order to get the full summary and a review_token.' };
  }

  // ---------- 4. review_order ----------
  function orderSummary(order, quote) {
    const prices = JSON.parse(quote.prices_json)[order.plan];
    const ages = JSON.parse(quote.ages_json);
    const travelers = order.travelers_json ? JSON.parse(order.travelers_json) : [];
    return {
      trip: tripSummary(quote),
      plan: planDetails(order.plan, quote.zone),
      policyholder: order.policyholder_json ? JSON.parse(order.policyholder_json) : null,
      travelers: travelers.map((t, i) => ({ ...t, age_at_departure: ages[i], price_eur: toEur(prices.per_traveler_cents[i]) })),
      total_eur: toEur(order.total_cents),
      exclusions: planDetails(order.plan, quote.zone).exclusions,
    };
  }

  function reviewOrder(input, ctx = {}) {
    const shapeError = checkShape(input, ['order_id'], 'review_order');
    if (shapeError) return shapeError;
    const { order, quote, error } = loadOrder(input.order_id);
    if (error) return error;
    if (order.status === 'plan_selected') {
      return fail('DETAILS_MISSING', 'Faltan los datos del tomador y de los viajeros.', 'Llama primero a set_traveler_details con este order_id.');
    }
    const depError = departureCheck(quote.departure_date);
    if (depError) return depError;

    const token = randomBytes(24).toString('base64url');
    // Freeze exactly what the customer sees now; the policy will be issued with this snapshot.
    const reviewed = orderSummary(order, quote);
    db.prepare(`UPDATE orders SET status = 'reviewed', review_token_hash = ?, review_total_cents = total_cents, review_snapshot_json = ?, updated_at = ? WHERE id = ?`)
      .run(sha256(token), JSON.stringify(reviewed), now().toISOString(), order.id);

    const plan = pricing.plans[order.plan];
    return {
      ok: true,
      order_id: order.id,
      summary: reviewed,
      total_eur: toEur(order.total_cents),
      currency: pricing.currency,
      key_conditions: [
        `Cobertura del ${quote.departure_date} al ${quote.return_date} (${quote.days} días).`,
        `Franquicia por siniestro médico: ${formatEur(plan.excess_per_medical_claim_eur)}.`,
        plan.coverage.cancellation_per_traveler_eur > 0
          ? `Cancelación incluida hasta ${formatEur(plan.coverage.cancellation_per_traveler_eur)} por viajero.`
          : 'La cancelación del viaje NO está incluida.',
        plan.adventure_sports_included
          ? `Deportes de aventura ${plan.coverage.adventure_sports}. Búsqueda y rescate hasta ${formatEur(plan.coverage.search_and_rescue_eur)}.`
          : 'Los deportes de aventura NO están incluidos.',
        'Pago simulado: no se cobra nada.',
        brand.demoBanner,
      ],
      terms_url: `${ctx.baseUrl ?? ''}/condiciones`,
      review_token: token,
      review_token_note: 'Single use. It becomes invalid after payment, if traveller details change, or if review_order is called again.',
      instructions_for_agent: 'BEFORE calling confirm_payment: show this full summary (trip, plan, travellers, total, key conditions, exclusions, terms link) to the user and get their explicit "yes" to pay this exact total and to accept the terms.',
    };
  }

  // ---------- 5. confirm_payment ----------
  async function confirmPayment(input, ctx = {}) {
    const shapeError = checkShape(input, ['order_id', 'review_token', 'accept_terms', 'confirmed_total_eur', 'user_confirmed'], 'confirm_payment');
    if (shapeError) return shapeError;
    const { order, quote, error } = loadOrder(input.order_id);
    if (error) return error;

    if (order.status !== 'reviewed' || !order.review_token_hash || !order.review_snapshot_json) {
      return fail('NOT_REVIEWED', 'El pedido no se ha revisado (o cambió después de revisarlo).', 'Llama a review_order, enseña el resumen al usuario y usa el review_token nuevo.');
    }
    const given = typeof input.review_token === 'string' ? sha256(input.review_token) : '';
    if (given.length !== order.review_token_hash.length || !timingSafeEqual(Buffer.from(given), Buffer.from(order.review_token_hash))) {
      return fail('INVALID_REVIEW_TOKEN', 'El review_token no es válido o ya no está vigente.', 'Usa el review_token del último review_order. Si no lo tienes, vuelve a llamar a review_order y enseña el resumen al usuario.');
    }
    if (input.accept_terms !== true) {
      return fail('TERMS_NOT_ACCEPTED', 'Hay que aceptar las condiciones del seguro para pagar.', 'Enseña las condiciones al usuario. Solo si las acepta expresamente, envía accept_terms: true.');
    }
    if (input.user_confirmed !== true) {
      return fail('USER_CONFIRMATION_REQUIRED', 'Falta la confirmación expresa del usuario.', 'Enseña el resumen y el total al usuario y pregúntale si quiere pagar. Solo si dice que sí, envía user_confirmed: true.');
    }
    if (typeof input.confirmed_total_eur !== 'number' || !Number.isFinite(input.confirmed_total_eur)
        || Math.round(input.confirmed_total_eur * 100) !== order.review_total_cents
        || Math.abs(input.confirmed_total_eur * 100 - order.review_total_cents) > 1e-6) {
      return fail('TOTAL_MISMATCH', `El total confirmado no coincide con el total revisado (${formatEur(toEur(order.review_total_cents))}).`, 'Envía confirmed_total_eur como número, exactamente igual al total_eur que devolvió review_order y que el usuario ha aceptado.', { reviewed_total_eur: toEur(order.review_total_cents) });
    }
    const depError = departureCheck(quote.departure_date);
    if (depError) return depError;

    // Create the policy number and PDF, then commit only if the order is still unpaid and unchanged.
    const issuedAt = now();
    const year = todayMadrid(issuedAt).slice(0, 4);
    let policy_number;
    do {
      policy_number = `${brand.policyPrefix}-${year}-${Array.from({ length: 6 }, () => POLICY_ALPHABET[randomInt(POLICY_ALPHABET.length)]).join('')}`;
    } while (db.prepare('SELECT 1 FROM policies WHERE policy_number = ?').get(policy_number));
    const pdf_token = randomBytes(32).toString('base64url');
    const policyholder = JSON.parse(order.policyholder_json);
    // The policy keeps exactly what the customer reviewed and accepted, never later config changes.
    const summary = JSON.parse(order.review_snapshot_json);

    const pdfBuffer = await buildPdf({ policy_number, issued_at: issuedAt.toISOString(), summary, brand, pricing });
    const pdfPath = join(pdfDir, `${pdf_token}.pdf`);
    await writeFile(pdfPath, pdfBuffer);

    const committed = (() => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const fresh = getOrderRow(order.id);
        if (fresh.status !== 'reviewed' || fresh.review_token_hash !== order.review_token_hash) {
          db.exec('ROLLBACK');
          return false;
        }
        db.prepare(`INSERT INTO policies (policy_number, order_id, issued_at, pdf_token, email_status, snapshot_json) VALUES (?, ?, ?, ?, 'pending', ?)`)
          .run(policy_number, order.id, issuedAt.toISOString(), pdf_token, order.review_snapshot_json);
        db.prepare(`UPDATE orders SET status = 'paid', review_token_hash = NULL, updated_at = ? WHERE id = ?`)
          .run(issuedAt.toISOString(), order.id);
        db.exec('COMMIT');
        return true;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    })();
    if (!committed) {
      await unlink(pdfPath).catch(() => {});
      return loadOrder(order.id).error
        ?? fail('NOT_REVIEWED', 'El pedido cambió mientras se procesaba el pago.', 'Vuelve a llamar a review_order y enseña el resumen al usuario.');
    }

    const pdf_url = `${ctx.baseUrl ?? ''}/poliza/${pdf_token}.pdf`;
    const email_status = await startEmail({ policy_number, policyholder, pdfBuffer, pdf_url });

    return {
      ok: true,
      policy_number,
      status: 'active',
      paid_total_eur: toEur(order.review_total_cents),
      payment: 'simulated — nothing was charged',
      pdf_url,
      email_status,
      disclaimer: brand.demoBanner,
      next_step: 'Tell the user the policy number and give them the pdf_url. They can check the policy later with get_policy (policy number + policyholder email).',
    };
  }

  // Sends the email in the background; payment never waits for it or fails because of it.
  async function startEmail({ policy_number, policyholder, pdfBuffer, pdf_url }) {
    const setStatus = (status, errorText = null) => db.prepare('UPDATE policies SET email_status = ?, email_error = ?, email_updated_at = ? WHERE policy_number = ?')
      .run(status, errorText, now().toISOString(), policy_number);
    let sending;
    try {
      sending = email.send({ to: policyholder, policy_number, pdfBuffer, pdf_url });
    } catch (err) {
      setStatus('failed', String(err.message).slice(0, 300));
      return 'failed';
    }
    if (sending.status === 'not_configured') {
      setStatus('not_configured');
      return 'not_configured';
    }
    sending.done
      .then(({ messageId }) => {
        setStatus('sent');
        db.prepare('UPDATE policies SET email_message_id = ? WHERE policy_number = ?').run(messageId, policy_number);
      })
      .catch(err => setStatus('failed', String(err.message).slice(0, 300)));
    return 'pending';
  }

  // Combines our own send status with what Brevo says happened to the message afterwards.
  async function emailDelivery(policy) {
    const local = {
      status: policy.email_status, // not_configured | pending | failed | sent
      status_at: policy.email_updated_at,
      source: 'local',
      error: policy.email_status === 'failed' ? policy.email_error : undefined,
    };
    if (policy.email_status !== 'sent' || !policy.email_message_id) return local;

    let cached = policy.email_delivery_json ? JSON.parse(policy.email_delivery_json) : null;
    let checkedAt = policy.email_checked_at;
    let check_error;
    if (!checkedAt || now() - new Date(checkedAt) >= DELIVERY_RECHECK_MS) {
      try {
        const fresh = await email.getDeliveryStatus(policy.email_message_id);
        checkedAt = now().toISOString();
        if (fresh) cached = fresh;
        db.prepare('UPDATE policies SET email_delivery_json = ?, email_checked_at = ? WHERE policy_number = ?')
          .run(cached ? JSON.stringify(cached) : null, checkedAt, policy.policy_number);
      } catch {
        check_error = 'Could not reach Brevo to check delivery; showing the last known status.';
      }
    }
    if (!cached) {
      // Brevo accepted the email but has not reported any events yet.
      return { ...local, last_checked_at: checkedAt ?? undefined, note: 'Brevo accepted the email; no delivery events reported yet.', check_error };
    }
    return {
      status: cached.status, // accepted | deferred | delivered | opened | bounced | blocked | marked_as_spam
      status_at: cached.at,
      brevo_event: cached.event,
      reason: cached.reason ?? undefined,
      source: 'brevo_events',
      last_checked_at: checkedAt,
      check_error,
    };
  }

  // ---------- 6. get_policy ----------
  async function getPolicy(input, ctx = {}) {
    const shapeError = checkShape(input, ['policy_number', 'email'], 'get_policy');
    if (shapeError) return shapeError;
    const number = typeof input.policy_number === 'string' ? input.policy_number.trim().toUpperCase() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const notFound = fail('POLICY_NOT_FOUND', 'No encontramos ninguna póliza con ese número y ese correo.', `Revisa el número de póliza (formato ${brand.policyPrefix}-AAAA-XXXXXX) y usa el correo del tomador.`);
    const policy = db.prepare('SELECT * FROM policies WHERE policy_number = ?').get(number);
    if (!policy) return notFound;
    const order = getOrderRow(policy.order_id);
    const policyholder = JSON.parse(order.policyholder_json);
    if (policyholder.email.toLowerCase() !== email) return notFound; // same answer: don't reveal that the number exists

    const quote = getQuoteRow(order.quote_id);
    const today = todayMadrid(now());
    const coverage_period = today < quote.departure_date ? 'not_started' : today > quote.return_date ? 'ended' : 'in_progress';
    return {
      ok: true,
      policy_number: policy.policy_number,
      status: coverage_period === 'ended' ? 'expired' : 'active',
      coverage_period,
      issued_at: policy.issued_at,
      // Always the snapshot saved when the policy was sold. Only test policies issued before
      // snapshots existed fall back to the current config, and say so.
      details: policy.snapshot_json ? JSON.parse(policy.snapshot_json) : orderSummary(order, quote),
      coverage_source: policy.snapshot_json ? 'snapshot_at_sale' : 'current_config_legacy_policy',
      pdf_url: `${ctx.baseUrl ?? ''}/poliza/${policy.pdf_token}.pdf`,
      email_delivery: await emailDelivery(policy),
      disclaimer: brand.demoBanner,
    };
  }

  function pdfPathForToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const policy = db.prepare('SELECT policy_number FROM policies WHERE pdf_token = ?').get(token);
    return policy ? { path: join(pdfDir, `${token}.pdf`), policy_number: policy.policy_number } : null;
  }

  return { getQuote, selectPlan, setTravelerDetails, reviewOrder, confirmPayment, getPolicy, pdfPathForToken, pricePerTravelerCents };
}
