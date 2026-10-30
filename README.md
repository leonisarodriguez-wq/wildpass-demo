# Seguros Wildpass

Seguro de viaje con deportes de aventura que se contrata en la web o con un agente de IA mediante WebMCP.
**Demo — no es un seguro real. Ningún pago es real** (Stripe en modo test). Caso práctico para Tuio.

## Pruébalo
**https://wildpass.taile53924.ts.net**

- **Como persona:** «Probar con un ejemplo» (Tailandia, 2 viajeros de 35 y 38 años, 15 días) → elige plan → DNI de prueba `12345678Z` y tarjeta `4242 4242 4242 4242` (fecha futura, CVC cualquiera). La póliza en PDF llega por email (si no la ves, mira en Spam o usa «Reenviar»).
- **Con un agente:** abre la web en un navegador con WebMCP (Chrome nativo o polyfill MCP-B) y pídele un seguro. Guía: [/agentes](https://wildpass.taile53924.ts.net/agentes) · [/llms.txt](https://wildpass.taile53924.ts.net/llms.txt) · Coberturas: [/condiciones](https://wildpass.taile53924.ts.net/condiciones)

## Arquitectura
Node 24 + Express 5 + SQLite (`node:sqlite`) + PDFKit + Brevo (email por API HTTP) + Stripe (test). Sin paso de compilación.
**Toda la lógica de negocio vive en el servidor** (`src/business.js`): la web y el agente llaman a la misma API, así que nunca discrepan. Precios y coberturas en `config/pricing.config.js`; marca y textos en `config/brand.config.js`.

```
persona ─► formulario ─┐
                       ├─► API ─► precios y póliza ─► Stripe (test) · PDF · email (Brevo)
agente ──► WebMCP ─────┘
```

**6 herramientas WebMCP:** `get_quote` → `select_plan` → `set_traveler_details` → `review_order` → `confirm_payment` → `get_policy`.

**Controles antes de pagar:** código de revisión de un solo uso (caduca si cambian los datos), `accept_terms`, confirmación explícita y total exacto; reglas comprobadas en el servidor; errores con `error_code` y `how_to_fix`; pagos idempotentes; claves Stripe «live» rechazadas. **El agente nunca toca la tarjeta y el DNI es opcional para él:** sin DNI, la póliza queda «DNI pendiente» y la persona lo completa con un enlace de un solo uso.

## Despliegue
Servidor Ubuntu 24.04. Servicio systemd `wildpass-app` (solo en 127.0.0.1:3000, se reinicia solo) publicado con **Tailscale Funnel** (HTTPS, dirección fija). Publico la web con Tailscale Funnel en lugar del túnel rápido de Cloudflare: la URL es estable (no cambia al reiniciar) y el HTTPS viene incluido; además, trycloudflare.com servía su propio robots.txt y bloqueaba a los agentes de IA.

```
# En el servidor (Tailscale instalado y con sesión iniciada)
git clone https://github.com/leonisarodriguez-wq/wildpass-demo ~/travel-demo && cd ~/travel-demo
npm install && cp .env.example .env    # rellenar las claves
sudo sh deploy/install.sh              # instala el servicio y activa Funnel

# En local
npm start   # http://127.0.0.1:3000
npm test    # pruebas automáticas
```
El servicio asume el usuario `leonisa_prueba` y la carpeta `~/travel-demo` (ajustar `deploy/wildpass-app.service` si cambian). Claves en `.env` (ver `.env.example`), nunca en Git. Sin claves, el pago es simulado y el email no se envía.

## Metodología de precios
- **Fórmula:** precio por viajero = base de 7 días (zona × plan) × factor de duración × factor de edad. Total = suma de viajeros.
- **Variables del brief:** destino (3 zonas: Europa · resto del mundo · EE. UU., Canadá y Japón), días, número y edad de viajeros, y plan. **Origen:** de momento solo viajes desde España para residentes en España, el mercado de las tres aseguradoras de referencia. Otro origen exigiría otra tarifa base; la API lo rechaza con `ORIGIN_NOT_SUPPORTED` (y otra residencia, con `RESIDENCE_NOT_COVERED`).
- **Calibración:** 13 presupuestos reales de Heymondo, IATI e Intermundial (28/10/2026) con los mismos destinos y fechas. Regla: **ligeramente por debajo de la mediana** de los planes comparables de cada nivel. Las pruebas automáticas fallan si un precio se aleja más de un ±5 % de su objetivo.
- **Edad:** 65–74 años ×1,65 (dato de Intermundial). **Supuestos marcados:** menores, mayores de 75, viajes de más de 15 días, los límites de Wild Max y las zonas (Japón y Canadá comparten la tarifa de EE. UU.; Marruecos, Turquía, Egipto y Túnez cuentan como «resto del mundo»; ninguno tiene presupuesto propio).
- Detalle y tablas: [docs/pricing-research.md](docs/pricing-research.md).

## Producto
| | **Wild** | **Wild+** (recomendado) | **Wild Max** |
|---|---|---|---|
| Médicos (Europa / fuera) | 500.000 € / 1 M € | 2 M € / 5 M € | 3 M € / 6 M € |
| Franquicia | 75 € | 0 € | 0 € |
| Cancelación por viajero | — | 3.000 € | 5.000 € |
| Aventura (trekking / buceo) | — | 4.000 m / 30 m | 6.000 m / 40 m |
| Búsqueda y rescate | — | 15.000 € | 30.000 € |

Tres planes: Wild Max ancla el precio y hace de Wild+ la elección natural. Sin reseñas inventadas; métricas propias sin cookies (embudo y tres pruebas A/B: titular, precio por día y texto del botón, explicadas en [/caso](https://wildpass.taile53924.ts.net/caso)).

**Con más tiempo:** dominio y email propios, webhook de Stripe, KYC real, hosting gestionado y otros países de origen.
