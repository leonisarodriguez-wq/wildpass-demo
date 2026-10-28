# Seguros Wildpass (demo)

Demo travel-insurance website that both people and AI agents (through [WebMCP](https://webmachinelearning.github.io/webmcp))
can use to get a quote, choose a plan and buy a policy. **It is not real insurance: no cover, no real payment.**

- Run locally: `npm install`, then `npm start` → http://127.0.0.1:3000
- Tests: `npm test`
- 24/7 on a server: systemd services in `deploy/` (see `CLAUDE.md`, section "Running")
- Project rules and architecture: `CLAUDE.md`

## Pricing

Prices are provisional. They were calibrated on 28 Oct 2026 against 13 real quotes from three travel insurers sold in Spain.
Method, comparison table and assumptions: **[docs/pricing-research.md](docs/pricing-research.md)**.
The raw quotes are in `config/market-quotes.js`; all prices and cover limits are in `config/pricing.config.js`.
