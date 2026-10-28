# travel-demo — Seguros Wildpass (project rules)

Demo travel-insurance website for the brand **Seguros Wildpass** that both humans and AI agents (via WebMCP) can use.
**It is NOT real insurance.** The banner "Demo — no es un seguro real" must appear on every page, in every PDF and every email.

The owner is not a programmer: explain things simply, report test results honestly, never claim something works without running it.

## Architecture (decided)
- Node 24 + Express 5. Plain HTML/CSS/JS frontend in `public/`, no build step, no frontend libraries.
- Landing + checkout (one page, `/`): `public/index.html` is a TEMPLATE rendered by the server (`src/landing.js`): `{{path}}` = escaped text,
  `{{{name}}}` = built HTML block; an unknown key throws (so a typo fails at once). Pages arrive complete: no text pops in, no layout shift.
  The template is read at start-up: restart the server after editing it. Never write triple braces inside an HTML comment there.
  `public/app.js` runs the quote form and the 4-step checkout (Paso X de 4: compare plans → who travels → review + pay (Stripe test mode, or simulated when Stripe is off) → done),
  with browser history per step, a trip summary card (steps 1–3, "Editar" goes back to the form) and a fixed total bar
  ("Elige un plan" + price range until a plan is chosen). Quote form: one row per traveller, "Viajero N" + age dropdown
  (0–85, "Menos de 1 año", default 30; first row rendered by the server, others copied by app.js), max 8; sends the same `traveler_ages`.
  Step 1: Wild and Wild+ as two separate cards; CSS subgrid aligns each coverage row across both cards; exclusions in a
  closed-by-default `<details>` ("En los dos planes", "Solo en Wild", "Límites de Wild+"). Friendly error texts: `brand.texts.errors`, keyed by the server's `error_code`
  (+ client-only keys like `missingDates`); the message is shown right under the field it is about.
  Birth dates are typed as dd/mm/aaaa (numeric keyboard) and sent as YYYY-MM-DD. Mobile-first CSS (`public/style.css`), breakpoints 700/960 px.
- "Desde X €" on the plan cards = 7 days, Europe, 1 adult, computed by the pricing engine (`fromPrices` in `src/landing.js`), never typed in.
- No public pricing-methodology page (removed 28 Oct 2026 at the owner's request). The research is in `docs/pricing-research.md`
  (linked from README.md); market quotes in `config/market-quotes.js` (13 quotes, counted by `quoteCount` for the FAQ answer).
- Landing effects (`public/landing-fx.js`, vanilla, no libraries, nothing but animation): hero with 3 parallax layers and a destination scene
  (`src/scenes.js`: one `<symbol>` per scene × layer in a hidden sprite, reused with `<use>`; `<option data-scene>` picks it; Europe → old town,
  unknown → mountains), a stylised Spain → destination flight path (SMIL animateMotion), a live "Desde X € · plan Wild" preview (debounced get_quote,
  no order), and the AI example chat + the real tools timeline (`showcaseHtml` in landing.js: tool names from webmcp-tools.js, price from the engine
  for `texts.ai.example`, final state server-rendered). `prefers-reduced-motion` → no animation, final state shown. Form fields use `--field-border`
  #6F94A7 (3.25:1 on white; #7FA3B5 was asked for but is only 2.69:1); `--border` #C9DCE6 stays for decorative card lines.
- Illustrations: original inline SVGs in `src/illustrations.js` (night outline + turquoise fill + small yellow accent). No emoji, no stock art,
  no fake reviews/ratings/press logos/invented stats; only promise what the product really does.
- SQLite via Node's built-in `node:sqlite` (no native npm module). DB file in `data/` (git-ignored). Small migrations run at start in `src/db.js`.
- **All business logic lives on the server in ONE module: `src/business.js`** (validation, pricing, order state, payment rules).
  The human website (`public/app.js`) and the WebMCP tools (`public/webmcp.js`) call the SAME JSON API (`src/app.js`), so they can never disagree.
  Never duplicate a business rule in the frontend (the UI may pre-check for convenience, the server decides).
- Brand name, logo text, claim, colours, fonts, email sender name and ALL website texts: `config/brand.config.js`.
- ALL prices, coverage, limits, exclusions, zones, age factors: `config/pricing.config.js`. Change prices there only.
- Website texts in Spanish. Server error messages in Spanish too (shown to users). Tool descriptions in English (read by AI agents).
- `.env` holds secrets (BREVO_API_KEY, SENDER_EMAIL, STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY). Never put secrets in code or Git; never print a key (check presence/prefix/length only). `.env.example` has placeholders only.
  The email sender NAME comes from the brand config ("Seguros Wildpass (demo)"), not from `.env`.

## Brand
- Name "Seguros Wildpass". Logo: symbol (mountain with the sun behind it) left of "wildpass" (lowercase, Space Grotesk Bold), small "seguros de viaje" below.
  Symbol geometry in `brand.symbol` (viewBox 0 0 56 56; sun circle 36/18/r10 yellow; mountain polygon turquoise on light, white on turquoise/dark).
  `src/logo.js` builds the SVG (site header, terms page, `/favicon.svg` = symbol in a rounded turquoise square); `src/pdf.js` draws the same shapes.
  PNGs `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/brand/logo-symbol-email.png` were rendered from the SVG with headless Chrome:
  re-render them if the symbol or colours change. Emails use that PNG hosted in our Brevo image gallery (`brand.emailLogoUrl`, uploaded with
  `POST /v3/emailCampaigns/images`): Gmail blocks SVG and Brevo does NOT support CID-embedded images (confirmed by Brevo staff, Oct 2025).
- Claim "Travel wild. We've got you." + hero subtitle (`texts.heroSubtitle`) + Spanish line "Viaja salvaje. Nosotros te cubrimos."
- Website banner (`brand.siteBanner`, sticky red strip on every page): "Demo — no es un seguro real. Ningún pago es real."
- Colours (`brand.colors`, exposed as CSS variables in /brand.css): sky #E3F4FB page background; white cards; night #0B1F3A main text; secondary #3C5368;
  turquoise #0E7C86 for highlighted sections (white text) and the logo mountain; turquoiseText #0B6770 for small turquoise text on light backgrounds;
  yellow #FFC21A ONLY for clickable primary buttons (bold night text, large, NO border, NO shadow) — badges and labels NEVER use yellow
  (on the website the only other yellow is the logo sun and small accents inside the illustrations; tested in `test/flow.test.js`);
  red #D7263D ONLY for the demo banner (white text) and error borders; mint #D6F0EE for the plans band and the Wild+ card.
  Badge ("El favorito de los aventureros"): turquoise #0E7C86 pill with white text. Secondary buttons: white, 2px night border, night text.
  The PDF certificate still uses pale yellow #FFF6D6 for its highlighted cells (not part of the website rule).
- WCAG AA: never yellow or white text on the light background; #0E7C86 as small text on sky fails (4.38) → use #0B6770. Error boxes: night text on white with a red border.
- Fonts: Space Grotesk (headings), Inter (text), self-hosted from `@fontsource` via `/fonts/` (no Google requests). The PDF uses the same fonts.

## Product rules
- Plans: **Wild** (id `wild`) and **Wild+** (id `wild_plus`). Coverage and exclusions in pricing config.
  Only Wild+ covers adventure sports (trekking ≤ 4,000 m, diving ≤ 30 m, ski/snowboard on marked slopes, surf, rafting, canyoning) and search & rescue up to 15,000 €.
  Wild excludes adventure sports. Professional sports and extreme activities (e.g. base jumping) are excluded in both.
- Exclusions: common list (`exclusions`) + each plan's `extraExclusions`. API: per-plan `exclusions`, and `exclusions_all_plans` on the quote.
- Price per traveller = base for 7 days (by zone + plan) × length multiplier × age factor; rounded to cents per traveller. Total = sum.
  Length multiplier: (days/7)^0.28 up to day 15; from our day 16 (= competitors' day 15) each extra day costs the average price PER DAY
  of our 11–15-day trips (= competitors' 10–14) (ASSUMPTION, no market data; `longTrip` in pricing config). 90-day Rest-of-world Wild ≈ 395 €.
- Prices calibrated 28 Oct 2026 against Heymondo / IATI / Intermundial: see `docs/pricing-research.md`. Targets checked by `test/pricing-targets.test.js` (±5%).
  Competitor "7 days" (10–17 Dec) = 8 days in our inclusive count (decision: keep inclusive counting), so targets are tested on the same date ranges.
- Age factors: 0–17 0.7 (assumption), 18–64 1.0, 65–74 1.65 (Intermundial evidence), 75–85 2.2 (assumption). We price age risk instead of refusing seniors.
- Zones: Europe / Rest of world / USA-Canada-Japan. For the medical limit, USA-Canada-Japan counts as "rest of world".
- Trip days are counted inclusively (departure and return days both count).
- Validation: origin must be Spain (ES) for now; destination ≠ origin; departure strictly after today (Europe/Madrid); return after departure; max 90 days; 1–8 travellers; ages 0–85; valid email.
- Traveller birth dates must give exactly the quoted ages at the departure date, in the same order.
- Never ask for ID numbers. Card numbers only ever go into Stripe's own Payment Element frame (straight to Stripe, test mode); our server never receives card data.

## Order flow and safety rules
quote → select_plan (order) → set_traveler_details → review_order (issues one-time review_token) → confirm_payment → policy.
- confirm_payment refuses unless: valid current review_token, accept_terms === true, user_confirmed === true, confirmed_total_eur exactly equals the reviewed total.
- Changing traveller details or calling review_order again invalidates the previous review_token.
- Agents must show the summary to the user and get explicit confirmation BEFORE confirm_payment (stated in the tool description).
- Errors are never bare throws: every API/tool result is `{ ok: true, ... }` or `{ ok: false, error_code, message, how_to_fix }`.
- Payment (`src/stripe.js`, Stripe TEST MODE ONLY, REST API via fetch, no npm package): at start-up only pk_test_/sk_test_ keys turn Stripe on;
  a live key, a missing key or anything else → Stripe OFF, simulated payment, one warning in the log (never the key).
  ALL the checks above run (`checkPayable` in business.js) BEFORE any Stripe call. One PaymentIntent per order (EUR, exact saved total in cents,
  metadata order_id + plan, Idempotency-Key `wildpass-order-<id>`), stored in `orders.payment_intent_id` and reused, so an order is never charged twice.
  Cards only: `allowed_payment_method_types[0]=card` (this account's API version 2026-09-30.endive REFUSES `payment_method_types`;
  the Payment Element uses the matching `allowedPaymentMethodTypes`, plus `wallets: { applePay, googlePay, link: 'never' }`).
  - AI agent: confirm_payment → server confirms the PaymentIntent with Stripe's test method `pm_card_visa` (agent never handles card data).
  - Website: step 3 shows the Stripe Payment Element (deferred mode, brand colours). "Pagar {total}" stays disabled until the terms box is ticked.
    Click → `elements.submit()` → `/api/start_card_payment` (checks, returns client_secret) → `stripe.confirmPayment` (browser → Stripe)
    → `/api/finish_card_payment` (server retrieves the PaymentIntent from Stripe and checks succeeded + amount + currency + order id). These two routes are not WebMCP tools.
  - The policy is issued ONLY after Stripe reports `succeeded`. Stripe unreachable → PAYMENT_PROVIDER_UNAVAILABLE (503), no policy, no fallback mid-payment.
    Declines → PAYMENT_DECLINED (402); friendly Spanish texts per decline code in `brand.texts.errors.card`.
  - `policies.payment_ref` = pi_…; the snapshot gets `payment: { provider, ref, text }`; get_policy, PDF and email show "Pago de prueba Stripe · ref. pi_…".
  - CSP adds only what Stripe needs, and only when Stripe is on: script-src js.stripe.com (+ *.js.stripe.com), frame-src js.stripe.com / hooks.stripe.com, connect-src api.stripe.com + fonts.googleapis.com (Stripe.js fetches the Inter cssSrc for its frame).
    Never use `setAttribute('style', …)` / style="" in generated HTML (CSP blocks it): `el()` sets `style` through CSSOM.
  - Tests: `test/stripe.test.js` mocks Stripe (`stripeFetch`). Test cards: 4242 4242 4242 4242 (ok), 4000 0000 0000 9995 (insufficient funds).
  - Stripe test payments: dashboard.stripe.com/test/payments (metadata order_id links a payment to our order).
- review_order freezes the summary the customer sees (`orders.review_snapshot_json`); payment copies it into `policies.snapshot_json`.
  PDF, email and get_policy use that snapshot, never the current config, so later config changes never alter a sold policy.
- Policy PDF (`src/pdf.js`): A4 certificate drawn ONLY from the policy snapshot. One page for up to 3 travellers (tested in `test/pdf.test.js`);
  more flow to extra pages, each with the red demo strip and the disclaimer footer. Dates always Spanish (10/12/2026, "10–24 dic 2026"). Nothing below 9 pt.
  Texts in `brand.texts.certificate`. To preview a PDF as PNG: there is no PDF tool on the server; render it with pdf.js in headless Chrome.
- Policy number: `WILD-<year>-XXXXXX` (older test policies keep `BRAND-…`). PDF via unguessable link `/poliza/<random token>.pdf`.
- get_policy requires policy_number AND the policyholder email (decision: policy numbers are short and guessable; the email stops strangers reading personal data).
- Policy email (`src/email.js`): HTML + plain-text versions from the policy snapshot, PDF attached, texts in `brand.texts.email`.
  Subject "Tu póliza Wildpass {número} · {destino} (demo)". Content checked in `test/email-delivery.test.js` (fake Brevo).
- Email via Brevo HTTP API; missing key → email_status "not_configured", never crash. Email is sent after payment and never blocks it.
- Delivery status: we store Brevo's messageId; get_policy asks Brevo's events API (`/v3/smtp/statistics/events?messageId=`) at most once a minute per policy
  and reports accepted / deferred / delivered / opened / bounced / blocked / marked_as_spam with Brevo's timestamp; "sent" if Brevo has no events yet.
  Brevo is faked in tests (`fetchImpl`), so tests never send real emails. The API key must never appear in responses, logs or Git.

## WebMCP
- Spec: https://webmachinelearning.github.io/webmcp (draft 27 Oct 2026). API is `document.modelContext.registerTool({name, title, description, inputSchema, annotations, execute})`.
  Fallback `navigator.modelContext` (older API), else load the MCP-B polyfill (`@mcp-b/global`, served at `/vendor/webmcp-polyfill.js`).
  `public/model-context.js`: tools are registered ONCE on the chosen object, and the missing name is aliased to that same object,
  so they are reachable via BOTH `document.modelContext` and `navigator.modelContext` (tested in `test/webmcp-context.test.js`
  and in Chrome: native, polyfill, navigator-only). Chrome 156 and the polyfill natively expose only `document.modelContext`.
  If a browser ever exposes two DIFFERENT objects, only `document.modelContext` gets the tools (never twice).
  Polyfill `executeTool(toolFromGetTools, input)` takes the tool entry (with its origin), not the tool name.
- Tool definitions live ONLY in `public/webmcp-tools.js` (pure module): `webmcp.js` registers them in the browser, and `src/landing.js`
  builds the landing's "Para desarrolladores" list from the same definitions (each tool's `es` line; confirm_payment's `rulesEs` per
  safety field; both stripped before registering). A test fails if a tool or a safety field has no Spanish line.
- Tools: get_quote, select_plan, set_traveler_details, review_order, confirm_payment, get_policy. Strict schemas (`additionalProperties: false`), readOnlyHint on read-only tools.
  The plan enum is built from the pricing config, so it always matches the server.
- Tools register a moment after page load (they wait for /api/config); an agent listing tools instantly may see none yet.
- Agent testing: Claude Code MCP server `chrome-devtools` (Google's chrome-devtools-mcp 1.10.1, headless Chrome for Testing 156, `--enable-features=WebMCP`). `@mcp-b/chrome-devtools-mcp` 3.0.0 is broken (empty package) — don't use it.

## Running (24/7 as systemd services — files in `deploy/`, installed with `sudo sh deploy/install.sh`)
- `wildpass-app.service`: `node server.js` as user leonisa_prueba, ONLY on 127.0.0.1:3000, starts at boot, `Restart=always`.
  Hardened: may only write `data/` (database + policy PDFs). Logs: `journalctl -u wildpass-app`.
- `wildpass-tunnel.service`: Cloudflare Quick Tunnel (`/usr/local/bin/cloudflared`, a root-owned copy of `~/.local/bin/cloudflared`) → 127.0.0.1:3000.
  `Restart=always`, starts at boot. Its status page is on 127.0.0.1:20241 (localhost only); `/quicktunnel` there gives the hostname.
  After start, `wildpass-save-url` saves the address to `/var/lib/wildpass-tunnel/url`; the command **`wildpass-url`** prints it.
- **The Quick Tunnel address changes whenever the tunnel service restarts** (also after a reboot). So the two services have NO dependency
  on each other: to deploy app changes run ONLY `sudo systemctl restart wildpass-app` (tunnel and address stay; visitors see a Cloudflare
  error page for ~1 s). Never restart wildpass-tunnel unless a new address is OK. `install.sh` re-run never restarts a running tunnel.
- PDF/terms links use the request's public host (cloudflared sends X-Forwarded-Proto; `trust proxy` = loopback). Leave `PUBLIC_BASE_URL` empty.
- Exposed to the internet: ONLY the website through the tunnel (plus SSH, unchanged). No database, dev tools or browser debugging port.
  Don't start hand-run copies (`npm start`, cloudflared) next to the services: port 3000/20241 would clash.
- `npm test` → automated tests (Node's built-in test runner, temporary database, port chosen automatically: safe while the service runs).
- The test browser (chrome-devtools MCP) is only started by Claude Code when testing; it uses a pipe, not a network port.
- Supply-chain rule: only install package versions at least 2 weeks old; pin exact versions.
- Git: PUBLIC repo https://github.com/leonisarodriguez-wq/wildpass-demo (`origin`, HTTPS, `gh auth setup-git` credentials).
  Commit identity = GitHub noreply `349275578+leonisarodriguez-wq@users.noreply.github.com` (history rewritten on 28 Oct 2026 to hide the
  personal email; original history backed up in `~/travel-demo-history-backup.bundle`, never pushed). Before every push: no secrets,
  no personal email, no `.env`/`data/`/PDFs/`previews/` (all git-ignored). Test fixtures use example.com addresses only.

## Not done yet / known gaps
- iOS gives date inputs a built-in minimum width (the Ida/Vuelta boxes overlapped on an iPhone): fixed with `appearance: none;
  min-width: 0`, stacked below 360 px. Tested in Chrome's phone emulation only, not on a real iPhone.
- Native date pickers (Ida/Vuelta) show the BROWSER's date format (dd/mm/aaaa in a Spanish browser, mm/dd/yyyy in an English one);
  everything we print ourselves is always dd/mm/aaaa.
- No rate limiting. No real payment (Stripe test mode only) or real insurer. Prices are provisional.
- No Stripe webhook: if the browser closes after Stripe succeeded but before finish_card_payment, no policy is issued yet; paying that
  order again (review → Pagar, or confirm_payment) finds the succeeded PaymentIntent and issues the policy without charging again.
- Policies issued before the snapshot feature have no snapshot and show the current config (`coverage_source: "current_config_legacy_policy"`).
- Emails sent before 28 Oct 2026 (afternoon) load their logo from an old tunnel address, so it no longer shows in them.
