// Stripe in TEST MODE ONLY, through Stripe's REST API (no extra npm package).
// At start-up only pk_test_/sk_test_ keys are accepted. A live key, a missing key or anything else
// turns Stripe OFF and the site keeps the simulated payment. Keys are never logged or returned.
const API = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 20_000;

// kind: 'unreachable' (network, timeout, Stripe 5xx) | 'card_error' (declined card) | 'api_error' (any other refusal)
export class StripeError extends Error {
  constructor(kind, message, { code, declineCode, status } = {}) {
    super(message);
    Object.assign(this, { kind, code, declineCode, status });
  }
}

// Returns { enabled: false, reason } or { enabled: true, publishableKey, ...calls }.
export function createStripe({ env = {}, fetchImpl = fetch, log = console } = {}) {
  const pk = String(env.STRIPE_PUBLISHABLE_KEY ?? '').trim();
  const sk = String(env.STRIPE_SECRET_KEY ?? '').trim();
  const off = (reason, why) => {
    log.warn(`Stripe OFF (${why}). Payments stay simulated.`);
    return { enabled: false, reason };
  };
  if (pk.startsWith('pk_live_') || sk.startsWith('sk_live_')) return off('live_key', 'a LIVE key was found in .env and refused: this demo only accepts test keys pk_test_/sk_test_');
  if (!pk && !sk) return off('no_key', 'no STRIPE_PUBLISHABLE_KEY/STRIPE_SECRET_KEY in .env');
  if (!pk.startsWith('pk_test_') || !sk.startsWith('sk_test_')) return off('not_test_key', 'both keys must be test keys: STRIPE_PUBLISHABLE_KEY must start with pk_test_ and STRIPE_SECRET_KEY with sk_test_');

  async function request(method, path, params, idempotencyKey) {
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${sk}`,
          ...(params && { 'Content-Type': 'application/x-www-form-urlencoded' }),
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
        },
        body: params ? new URLSearchParams(params).toString() : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new StripeError('unreachable', `Stripe could not be reached: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`);
    }
    const body = await res.json().catch(() => null);
    if (res.status >= 500 || !body) throw new StripeError('unreachable', `Stripe answered HTTP ${res.status}`, { status: res.status });
    if (!res.ok) {
      const e = body.error ?? {};
      throw new StripeError(e.type === 'card_error' ? 'card_error' : 'api_error', e.message ?? `Stripe answered HTTP ${res.status}`, { code: e.code, declineCode: e.decline_code, status: res.status });
    }
    return body;
  }

  return {
    enabled: true,
    publishableKey: pk,
    // One PaymentIntent per order: the idempotency key makes a repeated call return the same one.
    createPaymentIntent: ({ orderId, plan, amountCents }) => request('POST', '/payment_intents', {
      amount: String(amountCents),
      currency: 'eur',
      // Cards only. Current Stripe API versions refuse payment_method_types; allowed_payment_method_types replaces it
      // (the website's Payment Element uses the matching allowedPaymentMethodTypes option).
      'allowed_payment_method_types[0]': 'card',
      description: `Seguros Wildpass (demo) · pedido ${orderId}`,
      'metadata[order_id]': orderId,
      'metadata[plan]': plan,
    }, `wildpass-order-${orderId}`),
    retrievePaymentIntent: id => request('GET', `/payment_intents/${encodeURIComponent(id)}`),
    // AI-agent payments: Stripe's own test card, so the agent never handles card data.
    confirmWithTestCard: id => request('POST', `/payment_intents/${encodeURIComponent(id)}/confirm`, { payment_method: 'pm_card_visa' }, `wildpass-confirm-${id}`),
  };
}
