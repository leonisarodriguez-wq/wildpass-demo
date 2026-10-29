// ALL business logic: validation, pricing, order state and payment rules.
// The website and the WebMCP tools both reach these functions through the same JSON API.
// Every function returns { ok: true, ... } or { ok: false, error_code, message, how_to_fix }.
import { randomUUID, randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { writeFile, unlink, readFile } from 'node:fs/promises';
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
const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
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

// Spanish DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter), with the mod-23 control letter.
// Returns { value } (normalised, e.g. "12345678Z") or { error: 'format' | 'letter' }.
const ID_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
export function checkIdNumber(raw) {
  const value = typeof raw === 'string' ? raw.toUpperCase().replace(/[\s.-]/g, '') : '';
  const m = /^(\d{8}|[XYZ]\d{7})([A-Z])$/.exec(value);
  if (!m) return { error: 'format' };
  const digits = Number(m[1].replace(/^[XYZ]/, ch => String('XYZ'.indexOf(ch))));
  return ID_LETTERS[digits % 23] === m[2] ? { value } : { error: 'letter' };
}
// "*****678Z": enough to recognise it, never the whole number.
export const maskIdNumber = id => (id ? `*****${id.slice(-4)}` : null);
function idError(kind) {
  return kind === 'letter'
    ? fail('INVALID_ID_NUMBER', 'La letra del DNI/NIE no corresponde a sus números.', 'Revisa el DNI/NIE: la letra final se calcula con los números (módulo 23). Ejemplo de prueba de la demo: 12345678Z.', { reason: 'letter' })
    : fail('INVALID_ID_NUMBER', 'El DNI/NIE no tiene un formato válido.', 'Usa 8 números y una letra (DNI, por ejemplo 12345678Z) o X, Y o Z + 7 números y una letra (NIE). O no lo envíes: la persona podrá completarlo después con el enlace del email.', { reason: 'format' });
}
// What the customer and the agent see: "Activa" or "DNI pendiente", plus the masked number.
const ID_STATUS_TEXT = { active: 'Activa', pending_id: 'DNI pendiente' };

export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f<>]/.test(name)) return null;
  return name;
}

export function cleanEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

// ---------- main factory ----------

const DELIVERY_RECHECK_MS = 60_000; // ask Brevo at most once a minute per policy
const SEND_RECHECK_MS = 10_000; // resent/forwarded copies: the success step shows their status, so a little more often
const MAX_POLICY_SENDS = 5; // resends + forwards per policy (the automatic first email is not counted)

// "l***@gmail.com": enough to recognise the address, without storing or showing it whole.
export function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

// stripe: from createStripe() (src/stripe.js). When it is off, payments are simulated.
export function createBusiness({ db, pricing, brand, pdfDir, buildPdf, email, stripe = { enabled: false }, now = () => new Date() }) {
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
    // Lines that only some plans have are left out of the certificate when the plan does not include them.
    const OPTIONAL_LINES = ['sports_equipment_eur', 'trip_interruption_per_traveler_eur'];
    const coverage_summary = Object.entries(plan.coverage).filter(([key, value]) => !(OPTIONAL_LINES.includes(key) && !value)).map(([key, value]) => {
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
    const shapeError = checkShape(input, ['origin_country', 'destination_country', 'departure_date', 'return_date', 'traveler_ages', 'residence_country'], 'get_quote');
    if (shapeError) return shapeError;
    // Optional; missing = "ES". Only residents of Spain can be insured (same rule as the website's step 2).
    if (input.residence_country !== undefined) {
      const residence = typeof input.residence_country === 'string' ? input.residence_country.trim().toUpperCase() : '';
      if (!COUNTRY_SET.has(residence) && residence !== 'ES') {
        return fail('INVALID_COUNTRY', 'residence_country no es un código de país válido.', 'Usa un código ISO 3166-1 de 2 letras, por ejemplo "ES" para España.');
      }
      if (residence !== 'ES') {
        return fail('RESIDENCE_NOT_COVERED', 'Por ahora solo aseguramos a residentes en España.', 'Wildpass solo asegura a residentes en España. Pregunta al usuario su país de residencia.', { residence_country: residence });
      }
    }

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
    if (pricing.destinationsNotCovered.includes(destination)) {
      return fail('DESTINATION_NOT_COVERED', `No podemos asegurar viajes a destinos con recomendación oficial de no viajar (${countryName(destination)}).`,
        'Elige otro destino. Las recomendaciones de viaje oficiales están en exteriores.gob.es.', { destination_country: destination });
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
      next_step: `Show all the plans to the user (only Wild+ and Wild Max cover adventure sports). When the user chooses, call select_plan with this quote_id and plan ${planIdList}.`,
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
      next_step: 'Ask the user for the policyholder (full name, email) and each traveller\'s full name and birth date, in the same order as traveler_ages, then call set_traveler_details. The policyholder\'s DNI/NIE (holder_id_number) is optional for agents: without it the policy is issued as "DNI pendiente" and the person completes it with the emailed link.',
    };
  }

  // ---------- 3. set_traveler_details ----------
  function setTravelerDetails(input) {
    const shapeError = checkShape(input, ['order_id', 'policyholder', 'travelers', 'holder_id_number'], 'set_traveler_details');
    if (shapeError) return shapeError;
    const { order, quote, error } = loadOrder(input.order_id);
    if (error) return error;

    const phShape = checkShape(input.policyholder, ['full_name', 'email'], 'policyholder');
    if (phShape) return phShape;
    const phName = cleanName(input.policyholder.full_name);
    if (!phName) return fail('INVALID_NAME', 'El nombre del tomador no es válido.', 'Indica nombre y apellidos (de 2 a 100 caracteres).');
    const email = cleanEmail(input.policyholder.email);
    if (!email) return fail('INVALID_EMAIL', 'El correo electrónico no es válido.', 'Indica un correo como nombre@ejemplo.com.');
    // Optional for agents (privacy: better typed by the person with the link in the policy email); required by the website's form.
    let holderId = null;
    if (input.holder_id_number !== undefined && input.holder_id_number !== null && input.holder_id_number !== '') {
      const id = checkIdNumber(input.holder_id_number);
      if (id.error) return idError(id.error);
      holderId = id.value;
    }

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
    db.prepare(`UPDATE orders SET policyholder_json = ?, travelers_json = ?, holder_id_number = ?, status = 'details_set', review_token_hash = NULL, review_total_cents = NULL, review_snapshot_json = NULL, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify({ full_name: phName, email }), JSON.stringify(travelers), holderId, now().toISOString(), order.id);
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
      policyholder: order.policyholder_json
        ? { ...JSON.parse(order.policyholder_json), id_number_masked: maskIdNumber(order.holder_id_number), id_status: order.holder_id_number ? 'provided' : 'pending' }
        : null,
      policy_status_after_payment: order.holder_id_number ? ID_STATUS_TEXT.active : ID_STATUS_TEXT.pending_id,
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
        stripe.enabled ? brand.texts.payment.stripeCondition : brand.texts.payment.simulatedCondition,
        order.holder_id_number
          ? `DNI/NIE del tomador: ${maskIdNumber(order.holder_id_number)}. La póliza quedará «${ID_STATUS_TEXT.active}».`
          : `Sin DNI/NIE del tomador: la póliza se emitirá con estado «${ID_STATUS_TEXT.pending_id}» y la persona lo completará con el enlace que recibe por email.`,
        brand.demoBanner,
      ],
      terms_url: `${ctx.baseUrl ?? ''}/condiciones`,
      review_token: token,
      review_token_note: 'Single use. It becomes invalid after payment, if traveller details change, or if review_order is called again.',
      instructions_for_agent: 'BEFORE calling confirm_payment: show this full summary (trip, plan, travellers, total, key conditions, exclusions, terms link) to the user and get their explicit "yes" to pay this exact total and to accept the terms.',
    };
  }

  // ---------- 5. confirm_payment (and the website's card payment) ----------
  // Every check runs BEFORE any call to Stripe: review token, accepted terms, user confirmation, exact total.
  const PAY_FIELDS = ['order_id', 'review_token', 'accept_terms', 'confirmed_total_eur', 'user_confirmed'];
  function checkPayable(input, action, extraFields = []) {
    const shapeError = checkShape(input, [...PAY_FIELDS, ...extraFields], action);
    if (shapeError) return { error: shapeError };
    const { order, quote, error } = loadOrder(input.order_id);
    if (error) return { error };

    if (order.status !== 'reviewed' || !order.review_token_hash || !order.review_snapshot_json) {
      return { error: fail('NOT_REVIEWED', 'El pedido no se ha revisado (o cambió después de revisarlo).', 'Llama a review_order, enseña el resumen al usuario y usa el review_token nuevo.') };
    }
    const given = typeof input.review_token === 'string' ? sha256(input.review_token) : '';
    if (given.length !== order.review_token_hash.length || !timingSafeEqual(Buffer.from(given), Buffer.from(order.review_token_hash))) {
      return { error: fail('INVALID_REVIEW_TOKEN', 'El review_token no es válido o ya no está vigente.', 'Usa el review_token del último review_order. Si no lo tienes, vuelve a llamar a review_order y enseña el resumen al usuario.') };
    }
    if (input.accept_terms !== true) {
      return { error: fail('TERMS_NOT_ACCEPTED', 'Hay que aceptar las condiciones del seguro para pagar.', 'Enseña las condiciones al usuario. Solo si las acepta expresamente, envía accept_terms: true.') };
    }
    if (input.user_confirmed !== true) {
      return { error: fail('USER_CONFIRMATION_REQUIRED', 'Falta la confirmación expresa del usuario.', 'Enseña el resumen y el total al usuario y pregúntale si quiere pagar. Solo si dice que sí, envía user_confirmed: true.') };
    }
    if (typeof input.confirmed_total_eur !== 'number' || !Number.isFinite(input.confirmed_total_eur)
        || Math.round(input.confirmed_total_eur * 100) !== order.review_total_cents
        || Math.abs(input.confirmed_total_eur * 100 - order.review_total_cents) > 1e-6) {
      return { error: fail('TOTAL_MISMATCH', `El total confirmado no coincide con el total revisado (${formatEur(toEur(order.review_total_cents))}).`, 'Envía confirmed_total_eur como número, exactamente igual al total_eur que devolvió review_order y que el usuario ha aceptado.', { reviewed_total_eur: toEur(order.review_total_cents) }) };
    }
    const depError = departureCheck(quote.departure_date);
    if (depError) return { error: depError };
    return { order, quote };
  }

  // Stripe problems become clear errors. The policy is never issued and there is no silent fallback.
  function stripeFailure(err) {
    if (err?.kind === 'card_error') {
      return fail('PAYMENT_DECLINED', 'Stripe ha rechazado la tarjeta. No se ha emitido la póliza.', 'Prueba con otra tarjeta de prueba, por ejemplo 4242 4242 4242 4242.', { decline_code: err.declineCode ?? err.code });
    }
    if (err?.kind === 'unreachable') {
      return fail('PAYMENT_PROVIDER_UNAVAILABLE', 'No hemos podido contactar con Stripe y la póliza no se ha emitido.', 'Vuelve a intentarlo en unos minutos. Un mismo pedido nunca se cobra dos veces.');
    }
    if (err?.kind === 'api_error') {
      console.error('Stripe refused a request:', err.code ?? '', err.message);
      return fail('PAYMENT_ERROR', 'Stripe no ha podido procesar el pago y la póliza no se ha emitido.', 'Vuelve a intentarlo en unos minutos. Un mismo pedido nunca se cobra dos veces.');
    }
    throw err;
  }

  // The order's single PaymentIntent: reused if it exists, so an order can never be charged twice.
  async function orderPaymentIntent(order) {
    const pi = order.payment_intent_id
      ? await stripe.retrievePaymentIntent(order.payment_intent_id)
      : await stripe.createPaymentIntent({ orderId: order.id, plan: order.plan, amountCents: order.total_cents });
    if (!order.payment_intent_id) db.prepare('UPDATE orders SET payment_intent_id = ? WHERE id = ? AND payment_intent_id IS NULL').run(pi.id, order.id);
    return pi;
  }

  // Stripe's answer must be for this order and exactly the reviewed total, in euros.
  function paymentMatches(pi, order) {
    return pi.amount === order.review_total_cents && pi.currency === 'eur' && pi.metadata?.order_id === order.id;
  }
  const paymentMismatch = () => fail('PAYMENT_MISMATCH', 'El pago de Stripe no corresponde a este pedido o a este total.', 'Vuelve a revisar el pedido con review_order y paga de nuevo.');
  const paymentNotDone = () => fail('PAYMENT_NOT_COMPLETED', 'Stripe todavía no ha confirmado el pago, así que la póliza no se ha emitido.', 'Completa el pago con la tarjeta y vuelve a intentarlo.');

  // AI agents (and the website when Stripe is off). With Stripe on, the server pays with Stripe's test card pm_card_visa.
  async function confirmPayment(input, ctx = {}) {
    const { order, quote, error } = checkPayable(input, 'confirm_payment');
    if (error) return error;
    if (!stripe.enabled) return issuePolicy(order, quote, ctx, null);
    try {
      let pi = await orderPaymentIntent(order);
      if (!paymentMatches(pi, order)) return paymentMismatch();
      if (pi.status !== 'succeeded') pi = await stripe.confirmWithTestCard(pi.id);
      if (pi.status !== 'succeeded') return paymentNotDone();
      return await issuePolicy(order, quote, ctx, pi.id);
    } catch (err) {
      return stripeFailure(err);
    }
  }

  // Website, Stripe on, step A: after all checks, returns the client_secret for the Stripe Payment Element.
  // The card data goes from the browser straight to Stripe; it never reaches this server.
  async function startCardPayment(input) {
    const { order, error } = checkPayable(input, 'start_card_payment');
    if (error) return error;
    if (!stripe.enabled) return fail('CARD_PAYMENT_OFF', 'El pago con tarjeta de prueba no está activo.', 'Usa confirm_payment (pago simulado).');
    try {
      const pi = await orderPaymentIntent(order);
      if (!paymentMatches(pi, order)) return paymentMismatch();
      return { ok: true, order_id: order.id, payment_intent_id: pi.id, client_secret: pi.client_secret, status: pi.status };
    } catch (err) {
      return stripeFailure(err);
    }
  }

  // Website, step B: the server asks Stripe itself whether the payment succeeded; only then is the policy issued.
  async function finishCardPayment(input, ctx = {}) {
    const { order, quote, error } = checkPayable(input, 'finish_card_payment', ['payment_intent_id']);
    if (error) return error;
    if (!stripe.enabled) return fail('CARD_PAYMENT_OFF', 'El pago con tarjeta de prueba no está activo.', 'Usa confirm_payment (pago simulado).');
    if (!order.payment_intent_id || input.payment_intent_id !== order.payment_intent_id) return paymentMismatch();
    try {
      const pi = await stripe.retrievePaymentIntent(order.payment_intent_id);
      if (!paymentMatches(pi, order)) return paymentMismatch();
      if (pi.status !== 'succeeded') return paymentNotDone();
      return await issuePolicy(order, quote, ctx, pi.id);
    } catch (err) {
      return stripeFailure(err);
    }
  }

  const paymentText = ref => (ref ? fill(brand.texts.payment.stripeRef, { ref }) : brand.texts.payment.simulated);

  // Creates the policy number and PDF, then commits only if the order is still unpaid and unchanged.
  // paymentRef: the Stripe PaymentIntent id (pi_…) that succeeded, or null for a simulated payment.
  async function issuePolicy(order, quote, ctx, paymentRef) {
    const issuedAt = now();
    const year = todayMadrid(issuedAt).slice(0, 4);
    let policy_number;
    do {
      policy_number = `${brand.policyPrefix}-${year}-${Array.from({ length: 6 }, () => POLICY_ALPHABET[randomInt(POLICY_ALPHABET.length)]).join('')}`;
    } while (db.prepare('SELECT 1 FROM policies WHERE policy_number = ?').get(policy_number));
    const pdf_token = randomBytes(32).toString('base64url');
    // Kept only in the buyer's browser (success step): it allows resending or forwarding this policy's email.
    const manage_token = randomBytes(24).toString('base64url');
    const policyholder = JSON.parse(order.policyholder_json);
    // The policy keeps exactly what the customer reviewed and accepted (plus how it was paid), never later config changes.
    const summary = { ...JSON.parse(order.review_snapshot_json), payment: { provider: paymentRef ? 'stripe_test' : 'simulated', ref: paymentRef, text: paymentText(paymentRef) } };
    // DNI/NIE: given → "Activa"; missing → "DNI pendiente" + a one-time link for the person to type it in.
    const id_status = order.holder_id_number ? 'active' : 'pending_id';
    const id_token = id_status === 'pending_id' ? randomBytes(24).toString('base64url') : null;
    const complete_id_url = id_token ? `${ctx.baseUrl ?? ''}/poliza/completar/${id_token}` : null;
    summary.policyholder = { ...summary.policyholder, id_number_masked: maskIdNumber(order.holder_id_number) };
    summary.id_status = id_status;
    summary.status_text = ID_STATUS_TEXT[id_status];

    const pdfBuffer = await buildPdf({ policy_number, issued_at: issuedAt.toISOString(), summary, brand, terms_url: `${ctx.baseUrl ?? ''}/condiciones`, complete_id_url });
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
        db.prepare(`INSERT INTO policies (policy_number, order_id, issued_at, pdf_token, email_status, snapshot_json, payment_ref, manage_token_hash, holder_id_number, id_status, id_token_hash) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`)
          .run(policy_number, order.id, issuedAt.toISOString(), pdf_token, JSON.stringify(summary), paymentRef, sha256(manage_token), order.holder_id_number, id_status, id_token ? sha256(id_token) : null);
        db.prepare(`UPDATE orders SET status = 'paid', review_token_hash = NULL, holder_id_number = NULL, updated_at = ? WHERE id = ?`)
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
    const email_status = await startEmail({ policy_number, policyholder, summary, pdfBuffer, pdf_url, complete_id_url });

    return {
      ok: true,
      policy_number,
      status: id_status,
      status_text: ID_STATUS_TEXT[id_status],
      holder_id_number_masked: maskIdNumber(order.holder_id_number),
      ...(complete_id_url && {
        complete_id_url,
        complete_id_note: 'The policy is issued but its status is "DNI pendiente". Give this link to the user: THEY type their DNI/NIE there (one-time link, also in the policy email). Do not fill it in yourself.',
      }),
      plan: order.plan,
      paid_total_eur: toEur(order.review_total_cents),
      payment: paymentRef ? 'Stripe test mode — paid with a Stripe test card, nothing real was charged' : 'simulated — nothing was charged',
      ...(paymentRef && { payment_ref: paymentRef }),
      payment_text: paymentText(paymentRef),
      pdf_url,
      email_status,
      manage_token,
      manage_token_note: 'Private. Lets the buyer resend or forward this policy email right after buying; never show it to anyone.',
      disclaimer: brand.demoBanner,
      next_step: 'Tell the user the policy number and give them the pdf_url. They can check the policy later with get_policy (policy number + policyholder email).',
    };
  }

  // Sends the email in the background; payment never waits for it or fails because of it.
  async function startEmail({ policy_number, policyholder, summary, pdfBuffer, pdf_url, complete_id_url = null }) {
    const setStatus = (status, errorText = null) => db.prepare('UPDATE policies SET email_status = ?, email_error = ?, email_updated_at = ? WHERE policy_number = ?')
      .run(status, errorText, now().toISOString(), policy_number);
    let sending;
    try {
      sending = email.send({ to: policyholder, policy_number, summary, pdfBuffer, pdf_url, complete_id_url });
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
      status: coverage_period === 'ended' ? 'expired' : (policy.id_status ?? 'active'),
      status_text: coverage_period === 'ended' ? 'Caducada' : ID_STATUS_TEXT[policy.id_status ?? 'active'],
      holder_id_number_masked: maskIdNumber(policy.holder_id_number),
      ...(policy.id_status === 'pending_id' && { complete_id_note: 'DNI/NIE pending: the person completes it with the one-time link in the policy email.' }),
      coverage_period,
      issued_at: policy.issued_at,
      // Always the snapshot saved when the policy was sold. Only test policies issued before
      // snapshots existed fall back to the current config, and say so.
      details: policy.snapshot_json ? JSON.parse(policy.snapshot_json) : orderSummary(order, quote),
      coverage_source: policy.snapshot_json ? 'snapshot_at_sale' : 'current_config_legacy_policy',
      payment: paymentText(policy.payment_ref),
      ...(policy.payment_ref && { payment_ref: policy.payment_ref }),
      pdf_url: `${ctx.baseUrl ?? ''}/poliza/${policy.pdf_token}.pdf`,
      email_delivery: await emailDelivery(policy),
      disclaimer: brand.demoBanner,
    };
  }

  // ---------- success step: resend the policy email, or forward it to a travel companion ----------
  // Allowed with the private manage_token from the purchase (the buyer's browser), or with the policy number + the
  // policyholder's email (same rule as get_policy). At most MAX_POLICY_SENDS per policy; each send is logged.
  function policyForSending(input, action, extraFields) {
    const shapeError = checkShape(input, ['policy_number', 'manage_token', 'policyholder_email', ...extraFields], action);
    if (shapeError) return { error: shapeError };
    const number = typeof input.policy_number === 'string' ? input.policy_number.trim().toUpperCase() : '';
    const notFound = fail('POLICY_NOT_FOUND', 'No encontramos esa póliza, o no tienes permiso para enviarla.', 'Usa el enlace de la página de confirmación de la compra, o el número de póliza y el email de quien la contrató.');
    const policy = db.prepare('SELECT * FROM policies WHERE policy_number = ?').get(number);
    if (!policy) return { error: notFound };
    const order = getOrderRow(policy.order_id);
    const policyholder = JSON.parse(order.policyholder_json);
    let allowed = false;
    if (typeof input.manage_token === 'string' && policy.manage_token_hash) {
      const given = sha256(input.manage_token);
      allowed = timingSafeEqual(Buffer.from(given), Buffer.from(policy.manage_token_hash));
    } else if (typeof input.policyholder_email === 'string') {
      allowed = input.policyholder_email.trim().toLowerCase() === policyholder.email.toLowerCase();
    }
    if (!allowed) return { error: notFound };
    return { policy, order, policyholder };
  }

  const sendsOf = number => db.prepare('SELECT * FROM policy_sends WHERE policy_number = ? ORDER BY id').all(number);

  async function sendPolicyCopy(input, ctx = {}) {
    const { policy, policyholder, error } = policyForSending(input, 'send_policy_copy', ['kind', 'to_email']);
    if (error) return error;
    if (!['resend', 'forward'].includes(input.kind)) {
      return fail('INVALID_INPUT', 'kind debe ser "resend" o "forward".', 'Usa kind "resend" para reenviar al titular o "forward" para enviarla a otra persona.');
    }
    const to = input.kind === 'resend' ? policyholder.email : cleanEmail(input.to_email);
    if (!to) return fail('INVALID_EMAIL', 'El correo electrónico no es válido.', 'Indica un correo como nombre@ejemplo.com.');
    if (input.kind === 'forward' && to.toLowerCase() === policyholder.email.toLowerCase()) {
      return fail('FORWARD_TO_SELF', 'Ese es el email de quien contrató la póliza.', 'Para enviarla a ese email usa kind "resend".');
    }
    if (!email.configured) return fail('EMAIL_NOT_CONFIGURED', 'El envío por email no está activo en esta demo.', 'Descarga la póliza con el enlace del PDF y compártela tú.');
    const used = sendsOf(policy.policy_number).length;
    if (used >= MAX_POLICY_SENDS) {
      return fail('SEND_LIMIT_REACHED', `Ya se han hecho los ${MAX_POLICY_SENDS} envíos permitidos para esta póliza.`, 'Descarga la póliza con el enlace del PDF y compártela tú.', { max_sends: MAX_POLICY_SENDS });
    }
    if (!policy.snapshot_json) return fail('POLICY_NOT_FOUND', 'Esta póliza de prueba es antigua y no se puede reenviar.', 'Descarga la póliza con el enlace del PDF.');

    const summary = JSON.parse(policy.snapshot_json);
    const pdf_url = `${ctx.baseUrl ?? ''}/poliza/${policy.pdf_token}.pdf`;
    const forward = input.kind === 'forward';
    const to_masked = maskEmail(to);
    let status = 'sent';
    let messageId = null;
    let errorText = null;
    try {
      const pdfBuffer = await readFile(join(pdfDir, `${policy.pdf_token}.pdf`));
      const sending = email.send({ to: forward ? { email: to } : policyholder, policy_number: policy.policy_number, summary, pdfBuffer, pdf_url, forward });
      ({ messageId } = await sending.done); // wait for Brevo to accept it, so the page can say "enviada" truthfully
    } catch (err) {
      status = 'failed';
      errorText = String(err.message).slice(0, 300);
    }
    const ts = now().toISOString();
    const { lastInsertRowid } = db.prepare('INSERT INTO policy_sends (policy_number, kind, to_masked, sent_at, status, error, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(policy.policy_number, input.kind, to_masked, ts, status, errorText, messageId);
    if (status === 'failed') {
      return fail('EMAIL_SEND_FAILED', 'No hemos podido enviar el email ahora mismo.', 'Vuelve a intentarlo en unos minutos o descarga la póliza con el enlace del PDF.', { sends_left: MAX_POLICY_SENDS - used - 1 });
    }
    return {
      ok: true,
      send_id: Number(lastInsertRowid),
      kind: input.kind,
      to_masked,
      sent_at: ts,
      delivery: { status: 'sent', status_at: ts, source: 'local' },
      sends_left: MAX_POLICY_SENDS - used - 1,
      max_sends: MAX_POLICY_SENDS,
    };
  }

  // ---------- "Completa tu DNI": the one-time link from the policy email / success step / confirm_payment ----------
  const policyByIdToken = token => (typeof token === 'string' && token.length >= 20
    ? db.prepare("SELECT * FROM policies WHERE id_token_hash = ? AND id_status = 'pending_id'").get(sha256(token)) : undefined);
  const badIdLink = () => fail('ID_LINK_INVALID', 'Este enlace ya no es válido: el DNI ya se completó o el enlace no existe.', 'Si tu póliza sigue con «DNI pendiente», usa el enlace del email más reciente.');

  function idLinkStatus(token) {
    const policy = policyByIdToken(token);
    return policy ? { ok: true, policy_number: policy.policy_number } : badIdLink();
  }

  async function completeHolderId(input, ctx = {}) {
    const shapeError = checkShape(input, ['token', 'id_number'], 'complete_holder_id');
    if (shapeError) return shapeError;
    const policy = policyByIdToken(input.token);
    if (!policy) return badIdLink();
    const id = checkIdNumber(input.id_number);
    if (id.error) return idError(id.error);

    const summary = JSON.parse(policy.snapshot_json);
    summary.policyholder = { ...summary.policyholder, id_number_masked: maskIdNumber(id.value) };
    summary.id_status = 'active';
    summary.status_text = ID_STATUS_TEXT.active;
    // One-time link: the UPDATE only succeeds while the policy is still pending with this token.
    const { changes } = db.prepare("UPDATE policies SET holder_id_number = ?, id_status = 'active', id_token_hash = NULL, snapshot_json = ? WHERE policy_number = ? AND id_token_hash = ?")
      .run(id.value, JSON.stringify(summary), policy.policy_number, policy.id_token_hash);
    if (!changes) return badIdLink();

    const pdfBuffer = await buildPdf({ policy_number: policy.policy_number, issued_at: policy.issued_at, summary, brand, terms_url: `${ctx.baseUrl ?? ''}/condiciones` });
    await writeFile(join(pdfDir, `${policy.pdf_token}.pdf`), pdfBuffer); // same private link, updated certificate
    const pdf_url = `${ctx.baseUrl ?? ''}/poliza/${policy.pdf_token}.pdf`;
    const policyholder = JSON.parse(getOrderRow(policy.order_id).policyholder_json);
    const email_status = await startEmail({ policy_number: policy.policy_number, policyholder, summary, pdfBuffer, pdf_url });
    return { ok: true, policy_number: policy.policy_number, status: 'active', status_text: ID_STATUS_TEXT.active, holder_id_number_masked: maskIdNumber(id.value), pdf_url, email_status };
  }

  // The resent / forwarded copies of a policy with their real Brevo delivery status (asked at most every 10 s per copy).
  async function policySends(input) {
    const { policy, error } = policyForSending(input, 'policy_sends', []);
    if (error) return error;
    const sends = [];
    for (const row of sendsOf(policy.policy_number)) {
      let delivery = row.delivery_json ? JSON.parse(row.delivery_json) : null;
      if (row.status === 'sent' && row.message_id && (!row.checked_at || now() - new Date(row.checked_at) >= SEND_RECHECK_MS)) {
        try {
          const fresh = await email.getDeliveryStatus(row.message_id);
          if (fresh) delivery = fresh;
          db.prepare('UPDATE policy_sends SET delivery_json = ?, checked_at = ? WHERE id = ?').run(delivery ? JSON.stringify(delivery) : null, now().toISOString(), row.id);
        } catch { /* Brevo unreachable: keep the last known status */ }
      }
      sends.push({
        send_id: row.id, kind: row.kind, to_masked: row.to_masked, sent_at: row.sent_at,
        delivery: row.status === 'failed' ? { status: 'failed' } : delivery ? { status: delivery.status, status_at: delivery.at, source: 'brevo_events' } : { status: 'sent', status_at: row.sent_at, source: 'local' },
      });
    }
    return { ok: true, policy_number: policy.policy_number, sends, sends_left: Math.max(0, MAX_POLICY_SENDS - sends.length), max_sends: MAX_POLICY_SENDS };
  }

  function pdfPathForToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const policy = db.prepare('SELECT policy_number FROM policies WHERE pdf_token = ?').get(token);
    return policy ? { path: join(pdfDir, `${token}.pdf`), policy_number: policy.policy_number } : null;
  }

  return { getQuote, selectPlan, setTravelerDetails, reviewOrder, confirmPayment, startCardPayment, finishCardPayment, getPolicy, sendPolicyCopy, policySends, idLinkStatus, completeHolderId, pdfPathForToken, pricePerTravelerCents };
}
