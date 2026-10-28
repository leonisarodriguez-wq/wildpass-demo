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
- Name "Seguros Wildpass". Logo: symbol (mountain with the sun behind it) left of "wildpass" (lowercase, Space Grotesk Bold), small "seguros de viaje" below.
  Symbol geometry in `brand.symbol` (viewBox 0 0 56 56; sun circle 36/18/r10 yellow; mountain polygon turquoise on light, white on turquoise/dark).
  `src/logo.js` builds the SVG (site header, terms page, `/favicon.svg` = symbol in a rounded turquoise square); `src/pdf.js` draws the same shapes.
  PNGs `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/brand/logo-symbol-email.png` were rendered from the SVG with headless Chrome:
  re-render them if the symbol or colours change. Emails use that PNG hosted in our Brevo image gallery (`brand.emailLogoUrl`, uploaded with
  `POST /v3/emailCampaigns/images`): Gmail blocks SVG and Brevo does NOT support CID-embedded images (confirmed by Brevo staff, Oct 2025).
- Claim "Travel wild. We've got you." + hero subtitle (`texts.heroSubtitle`) + Spanish line "Viaja salvaje. Nosotros te cubrimos."
- Colours (`brand.colors`, exposed as CSS variables in /brand.css): sky #E3F4FB page background; white cards; night #0B1F3A main text; secondary #3C5368;
  turquoise #0E7C86 for highlighted sections (white text) and the logo mountain; turquoiseText #0B6770 for small turquoise text on light backgrounds;
  yellow #FFC21A primary buttons (bold night text, large, NO border, NO shadow) and the sun; red #D7263D ONLY for the demo banner (white text) and error borders.
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
- Never ask for ID numbers or card numbers. Payment is simulated.

## Order flow and safety rules
quote → select_plan (order) → set_traveler_details → review_order (issues one-time review_token) → confirm_payment → policy.
- confirm_payment refuses unless: valid current review_token, accept_terms === true, user_confirmed === true, confirmed_total_eur exactly equals the reviewed total.
- Changing traveller details or calling review_order again invalidates the previous review_token.
- Agents must show the summary to the user and get explicit confirmation BEFORE confirm_payment (stated in the tool description).
- Errors are never bare throws: every API/tool result is `{ ok: true, ... }` or `{ ok: false, error_code, message, how_to_fix }`.
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
- Policies issued before the snapshot feature have no snapshot and show the current config (`coverage_source: "current_config_legacy_policy"`).
- Emails sent before 28 Oct 2026 (afternoon) load their logo from an old tunnel address, so it no longer shows in them.
