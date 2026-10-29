# Seguros Wildpass

**Demo de seguro de viaje con deportes de aventura, contratable por personas y por agentes de IA mediante WebMCP.**
Es una demo: **no es un seguro real y ningún pago es real** (Stripe en modo test). Hecha como caso práctico para Tuio.

## Pruébalo en 2 minutos
Web: **https://wildpass.taile53924.ts.net**

- **Como persona:** pulsa «Probar con un ejemplo» (Tailandia, 10–24 dic 2026, 2 viajeros) o rellena el cotizador. Elige plan. Usa el DNI de prueba `12345678Z` y la tarjeta `4242 4242 4242 4242` (fecha futura, CVC cualquiera).
- **Con un agente:** abre la web en un navegador con asistente y pídele un seguro. Usa las herramientas WebMCP, nunca introduce la tarjeta y el DNI es opcional para él.
- Más: [/agentes](https://wildpass.taile53924.ts.net/agentes) · [/llms.txt](https://wildpass.taile53924.ts.net/llms.txt) · [/condiciones](https://wildpass.taile53924.ts.net/condiciones) · [/terminos](https://wildpass.taile53924.ts.net/terminos) · [/privacidad](https://wildpass.taile53924.ts.net/privacidad) · [/caso](https://wildpass.taile53924.ts.net/caso)

## Arquitectura
Node 24 + Express 5 + SQLite (`node:sqlite`) + PDFKit + Brevo (email) + Stripe (test). Sin paso de compilación: HTML, CSS y JS planos. **Toda la lógica vive en el servidor** (`src/business.js`): la web y el agente llaman a la misma API, así que nunca discrepan.

```
persona ─► formulario ─┐
                       ├─► API ─► precios y póliza ─► Stripe (test) · PDF · email (Brevo)
agente ──► WebMCP ─────┘            │
                                    └─► eventos ─► /metricas
```

## Herramientas WebMCP y seguridad
Las 6 herramientas, en este orden:
1. `get_quote`: precio de los tres planes (`residence_country` opcional, por defecto ES).
2. `select_plan`: empieza el pedido con `wild`, `wild_plus` o `wild_max`.
3. `set_traveler_details`: quien contrata y los viajeros (`holder_id_number` opcional).
4. `review_order`: resumen completo y código de revisión de un solo uso.
5. `confirm_payment`: paga y emite la póliza, solo si se cumplen las reglas.
6. `get_policy`: consulta la póliza con su número y el email de quien contrata.

Controles:
- Código de revisión de un solo uso; caduca si cambian los datos o se revisa de nuevo.
- `accept_terms` (condiciones del seguro y términos de contratación), confirmación explícita y total exacto.
- Todas las reglas se aplican también en el servidor.
- Errores con `error_code` y `how_to_fix`.
- Destinos con recomendación oficial de «no viajar» (Exteriores, verificado el 29/10/2026) rechazados.
- Solo residentes en España; DNI/NIE validado y siempre enmascarado.
- El agente nunca toca la tarjeta; pagos idempotentes (un pedido no se cobra dos veces).
- Claves Stripe «live» rechazadas al arrancar.
- Límites de reenvío de pólizas y antispam en el formulario de contacto.

> **Los datos sensibles (tarjeta y DNI) los introduce siempre la persona, nunca el agente.**

Funciona con el WebMCP nativo de Chrome y, si no lo hay, con el polyfill MCP-B.

## Growth y medición
- Eventos propios, **sin cookies ni terceros**, con canal web o agente (`public/track.js` → `src/events.js`).
- `/metricas`: embudo, web frente a agentes, reparto de los tres planes y experimentos.
- Dos pruebas A/B: titular de la portada y diferencia de precio (upsell). Se fuerzan con `?exp_hero=b` y `?exp_upsell=b`.
- Tamaño de muestra calculado con 95 % de confianza y 80 % de potencia; no se declara ganador antes.
- La estrategia está en [/caso](https://wildpass.taile53924.ts.net/caso).

## Despliegue y puesta en marcha
Servidor Ubuntu, servicio systemd `wildpass-app` y **Tailscale Funnel** (dirección fija, sin filtros de bots). Se cambió desde un Cloudflare Quick Tunnel porque bloqueaba a los agentes de IA. Archivos en `deploy/`.

En local (Node 24):
```
git clone https://github.com/leonisarodriguez-wq/wildpass-demo && cd wildpass-demo
npm install
cp .env.example .env
npm start        # http://127.0.0.1:3000
npm test         # pruebas automáticas
```
Variables de `.env.example`: `BREVO_API_KEY`, `SENDER_EMAIL`, `CONTACT_EMAIL`, `PUBLIC_BASE_URL`, `HOST`, `PORT`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `METRICS_ADMIN_KEY`. Sin claves, el pago es simulado y el email no se envía.

## Metodología de precios
- **13 presupuestos reales** (Heymondo, IATI, Intermundial; 28/10/2026).
- Regla: **ligeramente por debajo de la mediana** de los planes comparables.
- Factor de edad 65–74 años ×1,65 (evidencia de Intermundial).
- **Supuestos marcados:** viajes largos, menores, mayores de 75 y los límites de Wild Max (los presupuestos solo recogían precios). Wild Max se calibra con los planes top de las tres aseguradoras.
- Detalle y tablas: [docs/pricing-research.md](docs/pricing-research.md).

## Producto y marca
- **Wild** (esencial): gastos médicos hasta 500.000 € en Europa y 1.000.000 € fuera, franquicia de 75 €, sin aventura ni cancelación.
- **Wild+** (el favorito): cancelación hasta 3.000 € por viajero, franquicia 0 €, aventura (trekking hasta 4.000 m, buceo hasta 30 m) y rescate hasta 15.000 €.
- **Wild Max** (máxima protección): médicos hasta 3.000.000 € en Europa y 6.000.000 € fuera, cancelación 5.000 €, rescate 30.000 €, material deportivo 1.500 €, interrupción del viaje 3.000 €, trekking hasta 6.000 m y buceo hasta 40 m.
- «Wild» como actitud; claim «Travel wild. We've got you.».
- Precio sin pedir datos personales, móvil primero y accesibilidad cuidada (objetivo de contraste WCAG AA).
- Reenvío de la póliza y envío a quien viaja contigo; términos y privacidad de demo.

## Decisiones que tomé
- **Tres planes:** el tercero ancla el precio y hace de Wild+ la elección natural.
- **DNI opcional para agentes**, con enlace para que lo complete la persona.
- **El agente nunca toca la tarjeta.**
- **Tailscale en lugar de Cloudflare Quick Tunnel:** el segundo bloqueaba agentes.
- **No migrar a Render antes de entregar:** prioricé la estabilidad.
- **Sin reseñas inventadas:** la confianza no se finge.
- **Métricas propias sin cookies**, y `/caso` y `/metricas` fuera del menú de clientes.

## Qué mejoraría con más tiempo
- Dominio propio y email desde ese dominio; hosting gestionado.
- Verificación de identidad real (KYC) y webhook de Stripe.
- Sincronización automática con Exteriores; abrir a residentes de otros países.
- Documento de información del producto (IPID) por plan.
- Email del presupuesto, botón de compartir y referidos.
- Datos estructurados JSON-LD y endpoint público de precios; página «Mi póliza».
- Integración con una aseguradora real; monitorización y límites de uso generales.
- Pruebas con lector de pantalla y más dispositivos.
