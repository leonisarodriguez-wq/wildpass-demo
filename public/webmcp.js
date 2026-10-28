// Registers the WebMCP tools (spec draft 27 Oct 2026: document.modelContext.registerTool).
// Each tool just forwards its input to the SAME server endpoint the website uses, and returns the
// server's structured answer. Tools never throw: errors come back as { ok:false, error_code, message, how_to_fix }.
import { callApi, loadConfig } from './api.js';

const activity = document.getElementById('agent-activity');

function logActivity(tool, input, result) {
  if (!activity) return;
  const line = `${new Date().toLocaleTimeString('es-ES')} · ${tool} → ${result.ok ? 'ok' : result.error_code}`;
  activity.textContent = activity.textContent === '—' ? line : `${activity.textContent}\n${line}`;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

// Prefer the browser's own WebMCP; only load the MCP-B polyfill when there is none.
async function getModelContext() {
  if (document.modelContext) return { ctx: document.modelContext, source: 'native document.modelContext' };
  if (navigator.modelContext) return { ctx: navigator.modelContext, source: 'native navigator.modelContext' };
  await loadScript('/vendor/webmcp-polyfill.js');
  if (document.modelContext) return { ctx: document.modelContext, source: 'MCP-B polyfill' };
  throw new Error('WebMCP is not available in this browser.');
}

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const ID = { type: 'string', minLength: 1, maxLength: 100 };

function buildTools({ limits, plans, brand }) {
  const DEMO = `DEMO ONLY (${brand.name}): this is not real insurance and payment is simulated.`;
  const planIds = Object.keys(plans); // e.g. ["wild", "wild_plus"]
  const planList = planIds.map(id => `"${id}" (${plans[id]})`).join(' and ');
  return [
    {
      name: 'get_quote',
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
      title: 'Confirm and pay (simulated)',
      description: `Pay for a reviewed order and issue the policy. IMPORTANT: call this ONLY after you have shown the user the review_order summary and total, and the user has explicitly said yes to paying that exact total AND accepting the terms. Never set accept_terms or user_confirmed to true on your own. confirmed_total_eur must be exactly the total_eur from review_order. Returns the policy number and a PDF link. ${DEMO} No card data is needed or accepted.`,
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

async function register() {
  const statusEl = document.getElementById('webmcp-status');
  try {
    const config = await loadConfig();
    const { ctx, source } = await getModelContext();
    for (const tool of buildTools(config)) {
      await ctx.registerTool({
        ...tool,
        execute: async input => {
          const result = await callApi(tool.name, input ?? {});
          logActivity(tool.name, input, result);
          return result;
        },
      });
    }
    window.__webmcpSource = source;
    if (statusEl) statusEl.textContent = `WebMCP: ${source}`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `WebMCP no disponible: ${err.message}`;
  }
}

register();
