# travel-demo — project rules

Demo travel-insurance website that both humans and AI agents (via WebMCP) can use.
**It is NOT real insurance.** The banner "Demo — no es un seguro real" must appear on every page, in every PDF and every email.

The owner is not a programmer: explain things simply, report test results honestly, never claim something works without running it.

## Architecture (decided)
- Node 24 + Express 5. Plain HTML/CSS/JS frontend in `public/`, no build step. No visual design yet: plain and functional.
- SQLite via Node's built-in `node:sqlite` (no native npm module). DB file in `data/` (git-ignored).
- **All business logic lives on the server in ONE module: `src/business.js`** (validation, pricing, order state, payment rules).
  The human website (`public/app.js`) and the WebMCP tools (`public/webmcp.js`) call the SAME JSON API (`src/app.js`), so they can never disagree.
  Never duplicate a business rule in the frontend (the UI may pre-check for convenience, the server decides).
- Brand name, colours and ALL website texts: `config/brand.config.js` (placeholder name "BRAND").
- ALL prices, limits, exclusions, zones, age factors: `config/pricing.config.js`. Change prices there only.
- Website texts in Spanish. Server error messages in Spanish too (shown to users). Tool descriptions in English (read by AI agents).
- `.env` holds secrets (BREVO_API_KEY, SENDER_EMAIL). Never put secrets in code or Git. `.env.example` has placeholders only.

## Product rules (provisional — prices to be calibrated against real competitor quotes)
- Plans: Esencial, Premium (limits in pricing config).
- Price per traveller = base for 7 days (by zone + plan) × (days/7)^exponent (exponent < 1, so cost per day falls on longer trips) × age factor; rounded to cents per traveller. Total = sum.
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
- Policy number: `BRAND-<year>-XXXXXX`. PDF via unguessable link `/poliza/<random token>.pdf`.
- get_policy requires policy_number AND the policyholder email (decision: policy numbers are short and guessable; the email stops strangers reading personal data).
- Email via Brevo HTTP API; missing key → email_status "not_configured", never crash. Email is sent after payment and never blocks it.

## WebMCP
- Spec: https://webmachinelearning.github.io/webmcp (draft 27 Oct 2026). API is `document.modelContext.registerTool({name, title, description, inputSchema, annotations, execute})`.
  Fallback `navigator.modelContext` (older API), else load the MCP-B polyfill (`@mcp-b/global`, served at `/vendor/webmcp-polyfill.js`).
- Tools: get_quote, select_plan, set_traveler_details, review_order, confirm_payment, get_policy. Strict schemas (`additionalProperties: false`), readOnlyHint on read-only tools.
- Agent testing: Claude Code MCP server `chrome-devtools` (Google's chrome-devtools-mcp 1.10.1, headless Chrome for Testing 156, `--enable-features=WebMCP`). `@mcp-b/chrome-devtools-mcp` 3.0.0 is broken (empty package) — don't use it.

## Running
- `npm start` → http://127.0.0.1:3000 (binds to localhost only).
- `npm test` → automated tests (Node's built-in test runner, temporary database).
- Public URL for testing: `~/.local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3000` (Quick Tunnel, URL changes each start).
- Supply-chain rule: only install package versions at least 2 weeks old; pin exact versions.

## Not done yet / known gaps
- No visual design. No rate limiting. No real payment or real insurer. Prices are provisional.
