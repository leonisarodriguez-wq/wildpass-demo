# travel-demo — Seguros Wildpass (project rules)

Demo travel-insurance website for the brand **Seguros Wildpass** that both humans and AI agents (via WebMCP) can use.
**It is NOT real insurance.** The banner "Demo — no es un seguro real" must appear on every page, in every PDF and every email.

The owner is not a programmer: explain things simply, report test results honestly, never claim something works without running it.

## Architecture (decided)
- Node 24 + Express 5. Plain HTML/CSS/JS frontend in `public/`, no build step. Brand basics applied; the full landing design is NOT done yet.
- SQLite via Node's built-in `node:sqlite` (no native npm module). DB file in `data/` (git-ignored). Small migrations run at start in `src/db.js`.
- **All business logic lives on the server in ONE module: `src/business.js`** (validation, pricing, order state, payment rules).
  The human website (`public/app.js`) and the WebMCP tools (`public/webmcp.js`) call the SAME JSON API (`src/app.js`), so they can never disagree.
  Never duplicate a business rule in the frontend (the UI may pre-check for convenience, the server decides).
- Brand name, logo text, claim, colours, fonts, email sender name and ALL website texts: `config/brand.config.js`.
- ALL prices, coverage, limits, exclusions, zones, age factors: `config/pricing.config.js`. Change prices there only.
- Website texts in Spanish. Server error messages in Spanish too (shown to users). Tool descriptions in English (read by AI agents).
- `.env` holds secrets (BREVO_API_KEY, SENDER_EMAIL). Never put secrets in code or Git. `.env.example` has placeholders only.
  The email sender NAME comes from the brand config ("Seguros Wildpass (demo)"), not from `.env`.

## Brand
- Name "Seguros Wildpass". Logo: "wildpass" (lowercase, bold) with small "seguros de viaje" underneath.
- Claim "Travel wild. We've got you." + Spanish support line "Viaja salvaje. Nosotros te cubrimos."
- Colours: night blue #0E1B2C, signal yellow #FFC629 (buttons, with night-blue text), cream #F7F3EA, stone grey #5B6573,
  warning red #D7263D ONLY for the demo banner and errors.
- WCAG AA: never red TEXT on cream (4.48:1, fails) and never yellow text on cream (1.4:1). Error boxes use night text with a red border.
- Fonts: Space Grotesk (headings), Inter (text), self-hosted from `@fontsource` via `/fonts/` (no Google requests). The PDF uses the same fonts.

## Product rules
- Plans: **Wild** (id `wild`) and **Wild+** (id `wild_plus`). Coverage and exclusions in pricing config.
  Only Wild+ covers adventure sports (trekking ≤ 4,000 m, diving ≤ 30 m, ski/snowboard on marked slopes, surf, rafting, canyoning) and search & rescue up to 15,000 €.
  Wild excludes adventure sports. Professional sports and extreme activities (e.g. base jumping) are excluded in both.
- Exclusions: common list (`exclusions`) + each plan's `extraExclusions`. API: per-plan `exclusions`, and `exclusions_all_plans` on the quote.
- Price per traveller = base for 7 days (by zone + plan) × length multiplier × age factor; rounded to cents per traveller. Total = sum.
  Length multiplier: (days/7)^0.28 up to day 14; from day 15 each extra day adds the average of what days 10–14 add (ASSUMPTION, no market data).
- Prices calibrated 28 Oct 2026 against Heymondo / IATI / Intermundial: see `docs/pricing-research.md`. Targets checked by `test/pricing-targets.test.js` (±5%).
  Competitor "7 days" (10–17 Dec) = 8 days in our inclusive count (decision: keep inclusive counting), so targets are tested on the same date ranges.
- Age factors: 0–17 0.7 (assumption), 18–64 1.0, 65–74 1.65 (Intermundial evidence), 75–85 2.2 (assumption). We price age risk instead of refusing seniors.
- Zones: Europe / Rest of world / USA-Canada-Japan. For the medical limit, USA-Canada-Japan counts as "rest of world".
- Trip days are counted inclusively (departure and return days both count).
- Validation: origin must be Spain (ES) for now; destination ≠ origin; departure strictly after today (Europe/Madrid); return after departure; max 90 days; 1–8 travellers; ages 0–85; valid email.
- Traveller birth dates must give exactly the quoted ages at the departure date, in the same order.
- Never ask for ID numbers or card numbers. Payment is simulated.

## Order flow and safety rules
quote → select_plan (order) → set_traveler_details → review_order (issues one-time review_token) → confirm_payment → policy.
- confirm_payment refuses unless: valid current review_token, accept_terms === true, user_confirmed === true, confirmed_total_eur exactly equals the reviewed total.
- Changing traveller details or calling review_order again invalidates the previous review_token.
- Agents must show the summary to the user and get explicit confirmation BEFORE confirm_payment (stated in the tool description).
- Errors are never bare throws: every API/tool result is `{ ok: true, ... }` or `{ ok: false, error_code, message, how_to_fix }`.
- Policy number: `WILD-<year>-XXXXXX` (older test policies keep `BRAND-…`). PDF via unguessable link `/poliza/<random token>.pdf`.
- get_policy requires policy_number AND the policyholder email (decision: policy numbers are short and guessable; the email stops strangers reading personal data).
- Email via Brevo HTTP API; missing key → email_status "not_configured", never crash. Email is sent after payment and never blocks it.
- Delivery status: we store Brevo's messageId; get_policy asks Brevo's events API (`/v3/smtp/statistics/events?messageId=`) at most once a minute per policy
  and reports accepted / deferred / delivered / opened / bounced / blocked / marked_as_spam with Brevo's timestamp; "sent" if Brevo has no events yet.
  Brevo is faked in tests (`fetchImpl`), so tests never send real emails. The API key must never appear in responses, logs or Git.

## WebMCP
- Spec: https://webmachinelearning.github.io/webmcp (draft 27 Oct 2026). API is `document.modelContext.registerTool({name, title, description, inputSchema, annotations, execute})`.
  Fallback `navigator.modelContext` (older API), else load the MCP-B polyfill (`@mcp-b/global`, served at `/vendor/webmcp-polyfill.js`).
- Tools: get_quote, select_plan, set_traveler_details, review_order, confirm_payment, get_policy. Strict schemas (`additionalProperties: false`), readOnlyHint on read-only tools.
  The plan enum is built from the pricing config, so it always matches the server.
- Tools register a moment after page load (they wait for /api/config); an agent listing tools instantly may see none yet.
- Agent testing: Claude Code MCP server `chrome-devtools` (Google's chrome-devtools-mcp 1.10.1, headless Chrome for Testing 156, `--enable-features=WebMCP`). `@mcp-b/chrome-devtools-mcp` 3.0.0 is broken (empty package) — don't use it.

## Running
- `npm start` → http://127.0.0.1:3000 (binds to localhost only).
- `npm test` → automated tests (Node's built-in test runner, temporary database).
- Public URL for testing: `~/.local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3000` (Quick Tunnel, URL changes each start).
- Supply-chain rule: only install package versions at least 2 weeks old; pin exact versions.

## Not done yet / known gaps
- Full landing design. No rate limiting. No real payment or real insurer. Prices are provisional.
- Issued policies show the CURRENT plan coverage from config (prices are snapshotted per quote, coverage is not).
