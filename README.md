# Seguros Wildpass

**Demo de seguro de viaje con deportes de aventura, contratable por personas y por agentes de IA mediante WebMCP.**
Es una demo: **no es un seguro real y ningún pago es real** (Stripe en modo test). Hecha como caso práctico para Tuio.

## Pruébalo en 2 minutos
Web: **https://wildpass.taile53924.ts.net**

- **Como persona:** pulsa «Probar con un ejemplo» (Tailandia, 2 viajeros de 35 y 38 años, salida dentro de 6 semanas y 14 días de viaje: las fechas se ajustan solas) o rellena el cotizador. Elige plan. Usa el DNI de prueba `12345678Z` y la tarjeta `4242 4242 4242 4242` (fecha futura, CVC cualquiera).
- La póliza llega por email en un par de minutos; si no la ves, mira en Spam o usa «Reenviar» en la pantalla final.
- **Con un agente:** abre la web en un navegador con asistente y pídele un seguro. Usa las herramientas WebMCP, nunca introduce la tarjeta y el DNI es opcional para él.
- Más: [/agentes](https://wildpass.taile53924.ts.net/agentes) · [/llms.txt](https://wildpass.taile53924.ts.net/llms.txt) · [/condiciones](https://wildpass.taile53924.ts.net/condiciones) · [/terminos](https://wildpass.taile53924.ts.net/terminos) · [/privacidad](https://wildpass.taile53924.ts.net/privacidad) · [/caso](https://wildpass.taile53924.ts.net/caso)

## Arquitectura
Node 24 + Express 5 + SQLite (`node:sqlite`) + PDFKit + Brevo (email) + Stripe (test). Sin paso de compilación. **Toda la lógica vive en el servidor** (`src/business.js`): la web y el agente llaman a la misma API, así que nunca discrepan.

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
- Código de revisión de un solo uso; caduca si cambian los datos.
- `accept_terms` (condiciones del seguro y términos de contratación), confirmación explícita y total exacto.
- Reglas también en el servidor; errores con `error_code` y `how_to_fix`.
- Destinos con recomendación oficial de «no viajar» (Exteriores, verificado el 29/10/2026) rechazados.
- Solo residentes en España; DNI/NIE validado y siempre enmascarado.
- El agente nunca toca la tarjeta; pagos idempotentes; claves Stripe «live» rechazadas.
- Límites de reenvío de pólizas y antispam en el contacto.

> **Los datos sensibles (tarjeta y DNI) los introduce siempre la persona, nunca el agente.**

Compatible con el WebMCP nativo de Chrome y con el polyfill MCP-B.

## Growth y medición
- Eventos propios, **sin cookies ni terceros**, por canal (web o agente). `/metricas`: embudo, web frente a agentes, reparto de los tres planes y experimentos.
- Dos pruebas A/B: titular de la portada y diferencia de precio (upsell). Se fuerzan con `?exp_hero=b` y `?exp_upsell=b`.
- Tamaño de muestra con 95 % de confianza y 80 % de potencia; no se declara ganador antes. Estrategia en [/caso](https://wildpass.taile53924.ts.net/caso).

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
- **Supuestos marcados:** viajes largos, menores, mayores de 75 y los límites de Wild Max. Su precio se calibra con los planes top de las tres aseguradoras.
- Detalle y tablas: [docs/pricing-research.md](docs/pricing-research.md).

## Producto y marca
Los tres planes, con los mismos datos para compararlos:

| | **Wild** (esencial) | **Wild+** (el favorito) | **Wild Max** (máxima protección) |
|---|---|---|---|
| Gastos médicos (Europa / fuera) | 500.000 € / 1.000.000 € | 2.000.000 € / 5.000.000 € | 3.000.000 € / 6.000.000 € |
| Franquicia médica | 75 € | 0 € | 0 € |
| Cancelación (por viajero) | No incluida | 3.000 € | 5.000 € |
| Aventura: trekking | No incluida | Hasta 4.000 m | Hasta 6.000 m |
| Aventura: buceo | No incluida | Hasta 30 m | Hasta 40 m |
| Búsqueda y rescate | No incluido | 15.000 € | 30.000 € |

Wild Max añade material deportivo (1.500 €) e interrupción del viaje (3.000 € por viajero). **Los límites de Wild Max son supuestos** (los presupuestos solo recogían precios).

- «Wild» como actitud; claim «Travel wild. We've got you.». Precio sin datos personales, móvil primero y accesibilidad cuidada (contraste AA).
- Reenvío de la póliza y envío a quien viaja contigo; términos y privacidad de demo.

## Decisiones que tomé
- **Tres planes:** el tercero ancla el precio y hace de Wild+ la elección natural.
- **DNI opcional para agentes**, con enlace para que lo complete la persona.
- **El agente nunca toca la tarjeta.**
- **Tailscale en lugar de Cloudflare Quick Tunnel:** el segundo bloqueaba agentes.
- **No migrar a Render antes de entregar:** estabilidad.
- **Sin reseñas inventadas**; **métricas propias sin cookies**; `/caso` y `/metricas` fuera del menú de clientes.

## Qué mejoraría con más tiempo
- Dominio propio y email desde él; hosting gestionado; KYC real; webhook de Stripe.
- Sincronización con Exteriores; otros países; IPID por plan.
- Email del presupuesto, compartir y referidos; JSON-LD y endpoint público de precios; página «Mi póliza».
- Aseguradora real; monitorización y límites de uso generales; pruebas con lector de pantalla y más dispositivos.
