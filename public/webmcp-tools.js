// The WebMCP tool definitions, in ONE place. Used by public/webmcp.js (registered in the browser) and by
// src/landing.js (the "Para desarrolladores" list on the landing page), so the list can never get out of sync.
// Pure module: no DOM, no network. `es` and `rulesEs` are the plain Spanish lines for that list; webmcp.js strips them.
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const ID = { type: 'string', minLength: 1, maxLength: 100 };

export function buildTools({ limits, plans, brand, payments }) {
  const stripeOn = payments?.provider === 'stripe_test';
  const DEMO = `DEMO ONLY (${brand.name}): this is not real insurance and ${stripeOn ? 'payment is a Stripe TEST-MODE payment (nothing real is charged)' : 'payment is simulated'}.`;
  const HOW_PAID = stripeOn
    ? 'Payment runs in Stripe TEST MODE: only after all the checks above pass, the server confirms a Stripe PaymentIntent for exactly the reviewed total using Stripe\'s test payment method pm_card_visa, and issues the policy only if Stripe reports the payment succeeded. You never see, ask for or send card data. An order can never be charged twice: calling again after success returns ALREADY_PAID. If Stripe is unreachable you get PAYMENT_PROVIDER_UNAVAILABLE and no policy is issued; just retry later.'
    : 'No card data is needed or accepted.';
  const planIds = Object.keys(plans); // e.g. ["wild", "wild_plus"]
  const planList = planIds.map(id => `"${id}" (${plans[id]})`).join(' and ');
  return [
    {
      name: 'get_quote',
      es: 'Calcula el precio de los dos planes para un viaje: destino, fechas y edades.',
      title: 'Get travel insurance quote',
      description: `Get prices for travel insurance for one trip. Returns a quote_id and BOTH plans, ${planList}, with total price, price per traveller, coverage limits, medical excess and each plan's exclusions. Only Wild+ covers adventure sports (trekking up to 4,000 m, scuba diving up to 30 m, skiing/snowboarding on marked slopes, surf, rafting, canyoning) and search & rescue up to 15,000 EUR; professional sports and extreme activities such as base jumping are excluded in both plans. Only trips starting in Spain (origin_country "ES") are accepted. Dates are YYYY-MM-DD; departure must be after today; the trip may last at most ${limits.maxTripDays} days counting both departure and return day. traveler_ages = each traveller's age ON THE DEPARTURE DATE. Show both plans to the user and let them choose. ${DEMO}`,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['origin_country', 'destination_country', 'departure_date', 'return_date', 'traveler_ages'],
        properties: {
          origin_country: { type: 'string', pattern: '^[A-Za-z]{2}$', description: 'ISO 3166-1 alpha-2 code of the country the trip starts from. Currently only "ES" (Spain).' },
          destination_country: { type: 'string', pattern: '^[A-Za-z]{2}$', description: 'ISO 3166-1 alpha-2 code of the destination, e.g. "US", "FR", "JP". Must differ from origin_country.' },
          departure_date: { ...DATE, description: 'Departure date, YYYY-MM-DD, after today.' },
          return_date: { ...DATE, description: 'Return date, YYYY-MM-DD, after departure_date.' },
          traveler_ages: {
            type: 'array', minItems: limits.minTravelers, maxItems: limits.maxTravelers,
            items: { type: 'integer', minimum: limits.minAge, maximum: limits.maxAge },
            description: `Age of each traveller on the departure date (${limits.minTravelers}-${limits.maxTravelers} travellers, ages ${limits.minAge}-${limits.maxAge}). Keep this order for set_traveler_details.`,
          },
        },
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'select_plan',
      es: 'Empieza un pedido con el plan que ha elegido la persona.',
      title: 'Select a plan',
      description: `Start an order for the plan the USER chose from a quote. Returns an order_id. Do not choose a plan on the user's behalf unless they told you which one. ${DEMO}`,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['quote_id', 'plan'],
        properties: {
          quote_id: { ...ID, description: 'quote_id returned by get_quote.' },
          plan: { type: 'string', enum: planIds, description: `The plan the user chose: ${planList}. If the user will do adventure sports, only Wild+ covers them.` },
        },
      },
    },
    {
      name: 'set_traveler_details',
      es: 'Guarda quién contrata (nombre y email) y el nombre y la fecha de nacimiento de cada viajero; nada más.',
      title: 'Set policyholder and traveller details',
      description: 'Save the policyholder (full name + email, the policy is sent there) and every traveller (full name + birth date). Travellers must be in the SAME ORDER as traveler_ages in the quote, and each birth date must give exactly the quoted age on the departure date. Never ask for or send ID/passport numbers or card numbers. Changing details cancels any earlier review_token.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['order_id', 'policyholder', 'travelers'],
        properties: {
          order_id: { ...ID, description: 'order_id returned by select_plan.' },
          policyholder: {
            type: 'object',
            additionalProperties: false,
            required: ['full_name', 'email'],
            properties: {
              full_name: { type: 'string', minLength: 2, maxLength: 100 },
              email: { type: 'string', maxLength: 254, description: 'Where the policy will be emailed.' },
            },
          },
          travelers: {
            type: 'array', minItems: limits.minTravelers, maxItems: limits.maxTravelers,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['full_name', 'birth_date'],
              properties: {
                full_name: { type: 'string', minLength: 2, maxLength: 100 },
                birth_date: { ...DATE, description: 'YYYY-MM-DD' },
              },
            },
          },
        },
      },
    },
    {
      name: 'review_order',
      es: 'Devuelve el resumen completo y el total, que el asistente debe enseñarte antes de pagar.',
      title: 'Review order before payment',
      description: 'Get the full order summary (trip, plan, travellers, total, key conditions, exclusions, terms link) and a single-use review_token needed for confirm_payment. You MUST show this summary and the total to the user before asking them to confirm payment. Calling it again replaces the previous review_token.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['order_id'],
        properties: { order_id: { ...ID, description: 'order_id returned by select_plan.' } },
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'confirm_payment',
      es: stripeOn ? 'Paga (pago de prueba con Stripe, el asistente nunca ve datos de tarjeta) y emite la póliza, solo si se cumplen todas estas reglas:' : 'Paga (pago simulado) y emite la póliza, solo si se cumplen todas estas reglas:',
      // One plain Spanish line per safety field (test/webmcp-tools.test.js checks every required field has one).
      rulesEs: {
        review_token: 'el código del último resumen revisado. Caduca si cambian los datos o se vuelve a revisar.',
        accept_terms: 'has aceptado las condiciones del seguro.',
        user_confirmed: 'has dicho que sí, expresamente, a pagar.',
        confirmed_total_eur: 'el total coincide al céntimo con el del resumen.',
      },
      title: stripeOn ? 'Confirm and pay (Stripe test mode)' : 'Confirm and pay (simulated)',
      description: `Pay for a reviewed order and issue the policy. IMPORTANT: call this ONLY after you have shown the user the review_order summary and total, and the user has explicitly said yes to paying that exact total AND accepting the terms. Never set accept_terms or user_confirmed to true on your own. confirmed_total_eur must be exactly the total_eur from review_order. Returns the policy number and a PDF link. ${HOW_PAID} ${DEMO}`,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['order_id', 'review_token', 'accept_terms', 'confirmed_total_eur', 'user_confirmed'],
        properties: {
          order_id: { ...ID },
          review_token: { ...ID, description: 'review_token from the latest review_order.' },
          accept_terms: { type: 'boolean', description: 'true only if the user explicitly accepted the terms.' },
          confirmed_total_eur: { type: 'number', minimum: 0, description: 'The total the user confirmed; must equal total_eur from review_order.' },
          user_confirmed: { type: 'boolean', description: 'true only if the user explicitly confirmed this payment after seeing the summary.' },
        },
      },
      annotations: { consequentialHint: true },
    },
    {
      name: 'get_policy',
      es: 'Consulta una póliza con su número y el email de quien la contrató.',
      title: 'Look up a policy',
      description: 'Look up an issued policy: status, coverage period, policy details, PDF link and email delivery status. Needs the policy number AND the policyholder\'s email. email_delivery.status is one of: not_configured, pending, failed (our send was refused), sent (accepted, no delivery events yet), accepted, deferred, delivered, opened, bounced, blocked, marked_as_spam — with status_at as the time of that event.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['policy_number', 'email'],
        properties: {
          policy_number: { type: 'string', maxLength: 40, description: 'e.g. WILD-2026-AB12CD' },
          email: { type: 'string', maxLength: 254, description: 'The policyholder email used when buying.' },
        },
      },
      annotations: { readOnlyHint: true },
    },
  ];
}
