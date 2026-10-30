# Seguros Wildpass

Seguro de viaje con deportes de aventura que se contrata en la web o con un agente de IA mediante WebMCP. Caso práctico para Tuio.

> **Es una demo:** no hay aseguradora ni pagos reales (Stripe en modo test) y los precios son provisionales.

## Pruébalo
**https://wildpass.taile53924.ts.net**
- **Como persona:** «Probar con un ejemplo» (Tailandia, 2 viajeros de 35 y 38 años) → elige plan → DNI de prueba `12345678Z` y tarjeta `4242 4242 4242 4242` (fecha futura, CVC cualquiera). La póliza en PDF llega por email (si no la ves, mira en Spam).
- **Con un agente:** guía en [/agentes](https://wildpass.taile53924.ts.net/agentes) y [/llms.txt](https://wildpass.taile53924.ts.net/llms.txt). Coberturas en [/condiciones](https://wildpass.taile53924.ts.net/condiciones).

## Arquitectura
- **Servidor:** Node 24 + Express 5, sin paso de compilación. Frontend en HTML/CSS/JS plano (`public/`).
- **Base de datos:** SQLite con `node:sqlite` (archivo en `data/`, fuera de Git). Pólizas en PDF con PDFKit.
- **Toda la lógica de negocio está en el servidor** (`src/business.js`). La web y las herramientas WebMCP llaman a la misma API, así que no pueden discrepar. Precios y coberturas: `config/pricing.config.js`; marca y textos: `config/brand.config.js`.
- **WebMCP:** las herramientas se registran en `document.modelContext`; si el navegador solo tiene `navigator.modelContext`, ahí, y los dos nombres apuntan al mismo objeto. Si no tiene ninguno, se carga el polyfill MCP-B (`@mcp-b/global`).
- **Pagos:** Stripe en modo test (la clave «live» se rechaza al arrancar). **Emails:** Brevo por API HTTP, con el PDF adjunto.

```
persona ─► formulario ─┐
                       ├─► API ─► precios y póliza ─► Stripe (test) · PDF · email (Brevo)
agente ──► WebMCP ─────┘
```

## Las 6 herramientas WebMCP
`get_quote` calcula el precio de los tres planes · `select_plan` abre el pedido con el plan elegido · `set_traveler_details` guarda quién contrata y los viajeros · `review_order` devuelve el resumen y un `review_token` · `confirm_payment` paga y emite la póliza · `get_policy` consulta una póliza (número + email).

**`confirm_payment` se rechaza salvo que haya:** `review_token` del último resumen · `accept_terms: true` · `confirmed_total_eur` igual al total revisado · `user_confirmed: true`. Los errores devuelven `error_code` y `how_to_fix`.
**El agente nunca toca la tarjeta. El DNI/NIE es opcional para él**, por privacidad: sin DNI la póliza queda «DNI pendiente» y la persona lo completa con un enlace de un solo uso.

## Metodología de precios
- **Fórmula:** precio por viajero = base de 7 días (zona × plan) × factor de duración × factor de edad. Total = suma.
- **Zonas:** Europa · resto del mundo · EE. UU., Canadá y Japón. **Días:** se cuentan ida y vuelta (Tailandia del 10 al 24 de diciembre = 15 días).
- **Edad:** 0–17 ×0,7 · 18–64 ×1 · 65–74 ×1,65 (dato de Intermundial) · 75–85 ×2,2.
- **Calibración:** 13 presupuestos de Heymondo, IATI e Intermundial (28/10/2026); la comparación de 3 viajes tipo (Italia, Tailandia, EE. UU.) usa 26 de sus precios. Regla: **ligeramente por debajo de la mediana de los comparables**. `npm test` falla si un precio se aleja más de un ±5 % de su objetivo.
- **Es supuesto (sin datos de mercado):** Wild Max, el factor de menores y de 75–85 años, los viajes de más de 15 días y las zonas (Japón y Canadá comparten tarifa con EE. UU.).
- Detalle y tablas: [docs/pricing-research.md](docs/pricing-research.md).

## Despliegue (servidor Ubuntu nuevo)
1. Instala Node 24, git y Tailscale (con sesión iniciada, HTTPS y Funnel activados en tu tailnet).
2. `git clone https://github.com/leonisarodriguez-wq/wildpass-demo ~/travel-demo && cd ~/travel-demo && npm install`
3. `cp .env.example .env` y rellena las variables (nunca van a Git): `BREVO_API_KEY`, `SENDER_EMAIL`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` (solo claves de prueba), `METRICS_ADMIN_KEY`, y opcionales `CONTACT_EMAIL`, `PUBLIC_BASE_URL`, `HOST`, `PORT`. Sin claves, el pago es simulado y el email no se envía.
4. `sudo sh deploy/install.sh` instala el servicio y publica la web con Funnel.
5. Tras cambiar código: `sudo systemctl restart wildpass-app`.

El servicio `wildpass-app` (systemd) escucha solo en `127.0.0.1:3000`, arranca con el servidor, se reinicia solo y solo puede escribir en `data/`. Asume el usuario `leonisa_prueba` y la carpeta `~/travel-demo` (ajusta `deploy/wildpass-app.service` si cambian).
**Por qué Tailscale Funnel y no el túnel rápido de Cloudflare:** la URL es fija (no cambia al reiniciar) y el HTTPS viene incluido; además trycloudflare.com servía su propio `robots.txt` y bloqueaba a los agentes de IA.

## Pruebas
`npm test`: 109 pruebas automáticas (Node 24, base de datos temporal, sin enviar emails ni cobros reales).

## Qué haría con más tiempo
- Verificación de identidad real (KYC) en lugar de un DNI escrito a mano.
- Abrir Wildpass a residentes y viajes de otros países de origen.
- Un servidor MCP remoto o endpoint HTTP con el mismo motor, para asistentes sin navegador.
- Estado del pedido recuperable con el `order_id`.
