// Brand name, logo text, claim, colours, fonts and ALL website texts live here.

export default {
  name: 'Seguros Wildpass',
  logo: { wordmark: 'wildpass', tagline: 'seguros de viaje' }, // wordmark: lowercase, bold
  claim: "Travel wild. We've got you.",
  claimEs: 'Viaja salvaje. Nosotros te cubrimos.',
  policyPrefix: 'WILD', // policy numbers look like WILD-2026-XXXXXX
  emailSenderName: 'Seguros Wildpass (demo)',
  // Logo symbol for emails, hosted in our Brevo image gallery (Gmail blocks SVG, and Brevo does not
  // support images embedded with CID). A copy of public/brand/logo-symbol-email.png. Re-upload if it changes.
  emailLogoUrl: 'https://img.mailinblue.com/12605694/images/rnb/original/6ae206fddaa0afba48308b28.png',

  // WCAG AA checked (normal text needs 4.5:1): night on sky 14.6, night on white 16.5,
  // secondary on sky 7.1, white on turquoise 4.95, turquoiseText on sky 5.8 / on white 6.6,
  // night on yellow 10.2, white on red 5.0. Turquoise #0E7C86 as SMALL text on sky is only 4.38
  // (fails): use turquoiseText for that. NEVER yellow or white text on the light background.
  colors: {
    sky: '#E3F4FB', // page background
    white: '#FFFFFF', // cards; text on turquoise and red
    night: '#0B1F3A', // main text
    secondary: '#3C5368', // secondary text
    turquoise: '#0E7C86', // highlighted sections (white text on it) and the logo mountain
    turquoiseText: '#0B6770', // small turquoise text on light backgrounds
    yellow: '#FFC21A', // primary buttons (bold night text, no border, no shadow) and the logo sun
    red: '#D7263D', // ONLY the demo banner (white text) and error borders
    border: '#C9DCE6', // thin decorative lines and card borders (PDF, email, cards) — NOT form fields
    fieldBorder: '#6F94A7', // input/select borders: 3.25:1 against white (WCAG 1.4.11 asks ≥ 3:1)
    paleYellow: '#FFF6D6', // highlighted cells (total price, excess), with night text
    mint: '#D6F0EE', // soft turquoise band on the landing (night or turquoiseText text only)
  },
  // Logo symbol (a mountain with the sun behind it), drawn by src/logo.js and src/pdf.js.
  // Mountain is turquoise on light backgrounds and white on turquoise or dark ones.
  symbol: {
    viewBox: '0 0 56 56',
    sun: { cx: 36, cy: 18, r: 10 },
    mountain: '4,48 22,18 31,32 38,24 52,48',
  },
  // Self-hosted from @fontsource (no requests to Google).
  fonts: { headings: 'Space Grotesk', text: 'Inter' },

  demoBanner: 'Demo — no es un seguro real',

  // Banner on every web page (PDF and email use demoBanner).
  siteBanner: 'Demo — no es un seguro real. Ningún pago es real.',
  siteBannerShort: 'Demo · sin pagos reales', // phones: one line

  // Website texts. {placeholders} are filled in by the server (src/landing.js) or by public/app.js.
  texts: {
    // Site header (every page): skip link, menu links and the "Ver mi precio" button. Phones: a simple "Menú" panel.
    nav: {
      skip: 'Saltar al contenido',
      label: 'Menú principal',
      menu: 'Menú',
      close: 'Cerrar',
      faq: 'Preguntas frecuentes',
      agents: 'Agentes',
      terms: 'Condiciones',
      cta: 'Ver mi precio',
    },
    pageTitle: 'Seguros Wildpass · Seguro de viaje con deportes de aventura (demo)',
    metaDescription: 'Demo de seguro de viaje con deportes de aventura. Calcula tu precio sin datos personales.',
    // The claim stays in English (lang="en" on the h1); this Spanish line says what Wildpass is.
    heroSubtitle: 'Viaja salvaje, nosotros te cubrimos: seguro de viaje con deportes de aventura y la póliza en tu email en 2 minutos.',

    // Trust strip under the hero (white, 4 items with an icon). Only what the product really does: no reviews, no seals.
    trust: [
      { icon: 'mail', text: 'Póliza en tu email en 2 min' },
      { icon: 'cancel', text: 'Cancelación hasta {plusCancellation} con Wild+' },
      { icon: 'mountain', text: 'Deportes de aventura incluidos con Wild+' },
      { icon: 'doc', text: 'Sin letra pequeña: condiciones claras' },
    ],
    trustLabel: 'Por qué Wildpass',

    // Landing: hero + quote form
    form: {
      destination: '¿A dónde vas?',
      destinationPlaceholder: 'Elige un país',
      departure: 'Ida',
      return: 'Vuelta',
      travelers: 'Viajeros y edad el día de la ida',
      travelerRow: 'Viajero {n}',
      age: '{age} años',
      ageZero: 'Menos de 1 año',
      ageOne: '1 año',
      defaultAge: 30,
      addTraveler: '+ Añadir viajero',
      removeTravelerLabel: 'Quitar el viajero {n}',
      submit: 'Ver mi precio',
      note: 'Gratis y sin compromiso: no te pedimos datos personales.',
      loading: 'Calculando…',
      passLabel: 'Calcula tu precio',
      // Live price above "Ver mi precio", from get_quote (cheapest plan, all travellers). Shown ONLY once there is a price.
      pricePreview: 'Tu precio: desde {price}',
      pricePreviewSub: 'plan {plan} · {n} {travelersWord}',
      routeFrom: 'España',
      routeTo: '{name} · {days} días', // shown only once a destination is chosen; without dates just the name
      agesHelp: 'La edad influye en el precio.',
      // Searchable destination box (public/destination-picker.js)
      destinationSearch: 'Escribe un país',
      popularDestinations: ['FR', 'IT', 'PT', 'GB', 'US', 'MX', 'TH', 'JP', 'PE', 'MA'],
      popularLabel: 'Destinos populares',
      allLabel: 'Todos los destinos',
      noResults: 'No encontramos ese destino. Prueba con otro nombre.',
      // Other names people type (short forms and main cities/regions) → the country. Matched without accents or capitals.
      destinationAliases: {
        US: ['EEUU', 'EE UU', 'EE. UU.', 'USA', 'Estados Unidos', 'América', 'Nueva York', 'New York', 'Los Ángeles', 'Miami', 'San Francisco', 'Las Vegas', 'Chicago', 'Orlando', 'Hawái', 'Boston', 'Washington'],
        GB: ['UK', 'Inglaterra', 'Escocia', 'Gales', 'Gran Bretaña', 'Londres', 'London', 'Edimburgo', 'Manchester', 'Liverpool'],
        FR: ['París', 'Paris', 'Niza', 'Lyon', 'Marsella', 'Burdeos', 'Córcega'],
        IT: ['Roma', 'Milán', 'Venecia', 'Florencia', 'Nápoles', 'Sicilia', 'Cerdeña', 'Toscana'],
        PT: ['Lisboa', 'Oporto', 'Madeira', 'Azores', 'Algarve'],
        DE: ['Berlín', 'Múnich', 'Hamburgo', 'Fráncfort', 'Colonia'],
        NL: ['Holanda', 'Ámsterdam', 'Amsterdam', 'Róterdam'],
        BE: ['Bruselas', 'Brujas'],
        CH: ['Zúrich', 'Ginebra'],
        AT: ['Viena', 'Salzburgo'],
        CZ: ['República Checa', 'Praga'],
        HU: ['Budapest'],
        PL: ['Varsovia', 'Cracovia'],
        IE: ['Dublín'],
        IS: ['Reikiavik'],
        NO: ['Oslo', 'Fiordos'],
        SE: ['Estocolmo'],
        DK: ['Copenhague'],
        FI: ['Helsinki', 'Laponia'],
        GR: ['Atenas', 'Santorini', 'Mykonos', 'Creta'],
        HR: ['Dubrovnik', 'Split'],
        TR: ['Estambul', 'Capadocia'],
        JP: ['Tokio', 'Kioto', 'Osaka'],
        TH: ['Bangkok', 'Phuket', 'Chiang Mai'],
        VN: ['Hanói', 'Ho Chi Minh'],
        ID: ['Bali', 'Yakarta'],
        CN: ['Pekín', 'Shanghái'],
        KR: ['Seúl'],
        IN: ['Delhi', 'Bombay', 'Goa'],
        NP: ['Katmandú', 'Everest'],
        AE: ['Dubái', 'Dubai', 'Abu Dabi', 'Emiratos'],
        EG: ['El Cairo'],
        MA: ['Marrakech', 'Fez', 'Tánger'],
        TZ: ['Zanzíbar', 'Kilimanjaro'],
        KE: ['Nairobi'],
        ZA: ['Ciudad del Cabo'],
        MX: ['Ciudad de México', 'Cancún', 'Tulum', 'Riviera Maya'],
        PE: ['Lima', 'Cuzco', 'Cusco', 'Machu Picchu'],
        AR: ['Buenos Aires', 'Patagonia'],
        BR: ['Río de Janeiro', 'São Paulo'],
        CU: ['La Habana'],
        DO: ['Punta Cana', 'Santo Domingo'],
        CO: ['Bogotá', 'Cartagena', 'Medellín'],
        CL: ['Santiago de Chile'],
        CA: ['Toronto', 'Vancouver', 'Montreal'],
        AU: ['Sídney', 'Sydney', 'Melbourne'],
        NZ: ['Auckland'],
      },
      // Typing Spain or a Spanish place: the box explains that the trip has to go abroad.
      homeAliases: ['España', 'Spain', 'Espanya', 'Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Málaga', 'Bilbao', 'Canarias', 'Tenerife', 'Gran Canaria', 'Baleares', 'Mallorca', 'Ibiza', 'Menorca'],
      homeMessage: 'Este seguro es para viajes desde España al extranjero.',
      chooseAge: 'Elige la edad',
      maxTravelersNote: 'Máximo {maxTravelers} viajeros por póliza',
      resultsCount: '{n} destinos',
      resultsOne: '1 destino',
    },

    // Landing: AI block
    ai: {
      title: 'Tu asistente también puede contratarlo',
      text: 'Wildpass es un seguro de viaje preparado para agentes de IA. Pídeselo a tu asistente: él cotiza, te enseña el resumen y solo paga cuando tú confirmas.',
      promptLabel: 'Prueba a pedirle esto:',
      examplePrompt: 'Búscame un seguro de viaje para 2 personas de 35 y 38 años, de España a Tailandia, del 10 al 24 de diciembre, y enséñame el resumen antes de pagar.',
      copy: 'Copiar',
      copied: '¡Copiado!',
      copyLabel: 'Copiar el ejemplo',
      compatNote: 'Funciona con asistentes y navegadores compatibles con WebMCP, un estándar nuevo que se está incorporando a Chrome.', // /agentes
      // The ONE line about agents on the landing, in the served HTML (not added by JavaScript), followed by a link "/agentes".
      agentsLine: '¿Usas un asistente de IA? Puede contratar por ti aquí: usa nuestras herramientas WebMCP o el formulario, como tú. Instrucciones:',
      devTitle: 'Para desarrolladores',
      devIntro: 'Esta página ofrece {count} herramientas WebMCP a los asistentes de IA:',
      // Animated example (an illustration, not a live chat). {price}/{plan} come from the pricing engine for `example`.
      showcaseLabel: 'Ilustración de cómo funciona',
      example: { destination: 'TH', days: 15, ages: [35, 38], plan: 'wild_plus' }, // 10–24 Dec, counted inclusively
      chat: [
        { who: 'user', text: 'Necesito un seguro para Tailandia, del 10 al 24 de diciembre, 2 personas de 35 y 38 años.' },
        { who: 'assistant', text: '{plan}: {price} para los dos, con aventura y cancelación. ¿Te enseño el resumen?' },
        { who: 'user', text: 'Sí, y págalo.' },
        { who: 'assistant', text: 'He revisado las condiciones contigo. ¿Confirmas el pago de {price}?' },
        { who: 'user', text: 'Confirmo.' },
        { who: 'done', text: '✓ Póliza enviada a tu email.' },
      ],
      speakers: { user: 'Usuario', assistant: 'Asistente' },
      replay: 'Repetir',
    },

    // Landing: editorial headline + benefits
    editorial: {
      label: 'Seguro de viaje para los que no se quedan quietos',
      headline: 'Tú pon la aventura. Nosotros, todo lo demás.',
      benefits: [
        { title: 'Lo esencial, bien cubierto', text: 'Médicos, dentista urgente, equipaje y retraso de maleta, en los dos planes.' },
        { title: 'Aventura cubierta', text: 'Trekking, buceo, esquí, surf… y rescate hasta {rescue} con Wild+.' },
        { title: 'Sin franquicia en Wild+', text: 'Si te pasa algo, no pagas los primeros euros.' },
      ],
    },

    // Landing: "¿Y si…?" scenarios. Limits are {placeholders} filled from the pricing config; `figure` = the big number
    // (plan + coverage key in pricing config), `plans` = per-plan verdict chips (ok: covered or not).
    whatIf: {
      title: '¿Y si…?',
      intro: 'Situaciones de viaje que pasan, y qué plan te cubre.',
      listLabel: 'Situaciones de viaje',
      prev: 'Ver situaciones anteriores',
      next: 'Ver más situaciones',
      hint: 'Desliza para ver las {count} situaciones',
      comparePlans: 'Comparar planes',
      note: 'Ejemplos orientativos. Consulta coberturas y exclusiones completas en las',
      noteLink: 'condiciones',
      covered: 'Cubierto',
      notCovered: 'No cubierto',
      // `figure` (optional) = the big number: a plan + coverage key in the pricing config. Every limit is a {placeholder}.
      scenarios: [
        { id: 'sick', title: '¿Y si me pongo enfermo durante el viaje?',
          figure: { plan: 'wild_plus', key: 'medical_expenses_rest_of_world_eur' }, figureLabel: 'en gastos médicos fuera de Europa con Wild+',
          text: 'Los dos planes pagan el médico y el hospital. Wild tiene una franquicia de {wildExcess} por siniestro; Wild+ no tiene franquicia.',
          plans: { wild: { ok: true, text: '{wildMedEurope} en Europa · {wildMedWorld} fuera' }, wild_plus: { ok: true, text: '{plusMedEurope} en Europa · {plusMedWorld} fuera' } } },
        { id: 'suitcase', title: '¿Y si me roban la maleta o llega rota?',
          figure: { plan: 'wild_plus', key: 'baggage_theft_damage_eur' }, figureLabel: 'por robo o daños del equipaje con Wild+',
          text: 'El robo o los daños del equipaje están cubiertos en los dos planes.',
          plans: { wild: { ok: true, text: 'Hasta {wildBaggage}' }, wild_plus: { ok: true, text: 'Hasta {plusBaggage}' } } },
        { id: 'delay', title: '¿Y si mi maleta llega tarde?',
          figure: { plan: 'wild_plus', key: 'baggage_delay_eur' }, figureLabel: 'para lo imprescindible con Wild+',
          text: 'Mientras tu maleta no aparece, te cubrimos lo imprescindible que tengas que comprar.',
          plans: { wild: { ok: true, text: 'Hasta {wildBaggageDelay}' }, wild_plus: { ok: true, text: 'Hasta {plusBaggageDelay}' } } },
        { id: 'tooth', title: '¿Y si me duele una muela?',
          figure: { plan: 'wild_plus', key: 'urgent_dental_eur' }, figureLabel: 'en dentista urgente con Wild+',
          text: 'El dentista urgente está cubierto en los dos planes.',
          plans: { wild: { ok: true, text: 'Hasta {wildDental}' }, wild_plus: { ok: true, text: 'Hasta {plusDental}' } } },
        { id: 'liability', title: '¿Y si causo un daño a otra persona?',
          figure: { plan: 'wild_plus', key: 'civil_liability_eur' }, figureLabel: 'en responsabilidad civil con Wild+',
          text: 'Si sin querer causas daños a otra persona o a sus cosas, la responsabilidad civil te cubre en los dos planes.',
          plans: { wild: { ok: true, text: 'Hasta {wildLiability}' }, wild_plus: { ok: true, text: 'Hasta {plusLiability}' } } },
        { id: 'home', title: '¿Y si tengo que volver a casa por un problema médico?',
          text: 'La repatriación está cubierta en los dos planes: {repatriation}.',
          plans: { wild: { ok: true, text: '{repatriation}' }, wild_plus: { ok: true, text: '{repatriation}' } } },
        { id: 'sprain', title: '¿Y si me tuerzo el tobillo haciendo trekking?',
          figure: { plan: 'wild_plus', key: 'search_and_rescue_eur' }, figureLabel: 'en búsqueda y rescate con Wild+',
          text: 'El trekking es un deporte de aventura: solo Wild+ lo cubre, hasta {trekkingAltitude} m de altitud.',
          plans: { wild: { ok: false, text: 'No cubre deportes de aventura' }, wild_plus: { ok: true, text: 'Médico y trekking incluidos' } } },
        { id: 'cancel', title: '¿Y si tengo que cancelar por una enfermedad?',
          figure: { plan: 'wild_plus', key: 'cancellation_per_traveler_eur' }, figureLabel: 'por viajero en cancelación con Wild+',
          text: 'Si una enfermedad te obliga a cancelar antes de salir, Wild+ te devuelve los gastos del viaje. Wild no incluye cancelación.',
          plans: { wild: { ok: false, text: 'Sin cancelación' }, wild_plus: { ok: true, text: 'Hasta {plusCancellation} por viajero' } } },
        { id: 'rescue', title: '¿Y si me pierdo en la montaña?',
          figure: { plan: 'wild_plus', key: 'search_and_rescue_eur' }, figureLabel: 'en búsqueda y rescate con Wild+',
          text: 'Si te pierdes haciendo una actividad cubierta, Wild+ paga la búsqueda y el rescate. Wild no incluye búsqueda y rescate.',
          plans: { wild: { ok: false, text: 'Sin búsqueda y rescate' }, wild_plus: { ok: true, text: 'Hasta {rescue}' } } },
        { id: 'diving', title: '¿Y si me hago daño buceando a 20 m?',
          text: 'Con Wild+ el buceo está cubierto hasta {divingDepth} m de profundidad. Wild no cubre deportes de aventura.',
          plans: { wild: { ok: false, text: 'No cubre deportes de aventura' }, wild_plus: { ok: true, text: 'Buceo hasta {divingDepth} m' } } },
        { id: 'ski', title: '¿Y si me caigo esquiando en una pista señalizada?',
          text: 'Esquí y snowboard en pistas señalizadas están incluidos en Wild+.',
          plans: { wild: { ok: false, text: 'No cubre deportes de aventura' }, wild_plus: { ok: true, text: 'En pistas señalizadas' } } },
        { id: 'offpiste', title: '¿Y si me caigo esquiando fuera de pista?',
          text: 'Esquiar fuera de las pistas señalizadas no está cubierto en ningún plan.',
          plans: { wild: { ok: false, text: 'No cubre deportes de aventura' }, wild_plus: { ok: false, text: 'Solo pistas señalizadas' } } },
        { id: 'rafting', title: '¿Y si me lesiono haciendo rafting o barranquismo?',
          text: 'Surf, rafting y barranquismo están incluidos en Wild+, con búsqueda y rescate hasta {rescue}.',
          plans: { wild: { ok: false, text: 'No cubre deportes de aventura' }, wild_plus: { ok: true, text: 'Incluidos' } } },
        { id: 'base', title: '¿Y si hago salto BASE?',
          text: 'Las actividades extremas y los deportes profesionales están excluidos en los dos planes.',
          plans: { wild: { ok: false, text: 'Actividad extrema' }, wild_plus: { ok: false, text: 'Actividad extrema' } } },
        { id: 'long', title: '¿Y si mi viaje dura 4 meses?',
          text: 'Aseguramos viajes de hasta {maxTripDays} días, contando el de ida y el de vuelta.',
          plans: { wild: { ok: false, text: 'Máximo {maxTripDays} días' }, wild_plus: { ok: false, text: 'Máximo {maxTripDays} días' } } },
      ],
    },

    // Landing: destinations strip (each card: its hero scene + "7 días desde X €", Wild, 1 adult, from the pricing engine)
    destinations: {
      title: '¿A dónde te escapas?',
      intro: 'Toca un destino y lo dejamos puesto en el formulario.',
      price: '7 días desde {price}',
      pricePlus: 'Wild+ desde {price}',
      note: '7 días, 1 adulto: primer precio con Wild, segundo con Wild+.',
      cardLabel: 'Elegir {name}: 7 días desde {price} con Wild o {plusPrice} con Wild+',
      prev: 'Ver destinos anteriores',
      next: 'Ver más destinos',
      countries: ['TH', 'JP', 'PE', 'IS', 'MX', 'US', 'IT'],
    },

    // Landing: sticky bar on phones once the hero is off screen
    stickyCta: 'Ver mi precio',

    // Landing: plans band
    plans: {
      title: 'Elige cómo quieres viajar',
      wildDescription: 'Lo esencial para viajar tranquilo.',
      wildPlusDescription: 'Aventura y cancelación incluidas.',
      wildPlusBadge: 'El favorito de los aventureros',
      from: 'Desde {price}',
      fromNote: '7 días en Europa, 1 adulto.',
      seePrice: 'Ver mi precio',
      choose: 'Elegir {plan}', // secondary: goes to the form with this plan preselected for step 1
      whatCovers: 'Ver qué cubre',
    },

    // Landing: FAQ, closed behind "Ver preguntas frecuentes". Answers use values from the pricing config.
    // [text](#quote-form) becomes a link to the quote form. The contact question shows only when CONTACT_EMAIL is set in .env.
    faqTitle: 'Preguntas frecuentes',
    faqShow: 'Ver preguntas frecuentes',
    faqHide: 'Ocultar preguntas frecuentes',
    faq: [
      { q: '¿Esto es un seguro real?', a: 'No. Seguros Wildpass es una demostración: no ofrece ninguna cobertura y ningún pago es real. Si se te pide una tarjeta, es solo la tarjeta de prueba de Stripe (modo test): nunca se cobra nada. La póliza que recibes es un documento de prueba sin validez.' },
      { q: '¿Qué diferencia hay entre Wild y Wild+?', a: 'Wild cubre gastos médicos hasta {wildMedEurope} en Europa y {wildMedWorld} en el resto del mundo, equipaje hasta {wildBaggage} y tiene una franquicia de {wildExcess} por siniestro médico. No incluye cancelación ni deportes de aventura. Wild+ sube los gastos médicos a {plusMedEurope} y {plusMedWorld}, el equipaje a {plusBaggage}, no tiene franquicia e incluye cancelación hasta {plusCancellation} por viajero, deportes de aventura y rescate hasta {rescue}. [Compara los dos con tu viaje](#quote-form).' },
      { q: '¿Qué deportes de aventura cubre Wild+?', a: 'Wild+ incluye trekking hasta {trekkingAltitude} m, buceo hasta {divingDepth} m, esquí y snowboard en pistas señalizadas, surf, rafting y barranquismo, con búsqueda y rescate hasta {rescue}. No cubre deportes profesionales ni actividades extremas como el salto BASE, ni lo que pase de esos límites.' },
      { q: '¿Quién puede contratarlo?', a: 'Viajes que salen de España, de hasta {maxTripDays} días, de {minTravelers} a {maxTravelers} viajeros por póliza y de {minAge} a {maxAge} años. Solo te pedimos nombre, email y fecha de nacimiento: nada de DNI. [Calcula tu precio](#quote-form).' },
      { q: '¿Cómo calculáis el precio?', a: 'El precio depende del destino (Europa, resto del mundo, o EE. UU., Canadá y Japón), de los días de viaje y de la edad de cada viajero. Lo calibramos con {count} presupuestos reales de otras aseguradoras. [Mira cuánto cuesta tu viaje](#quote-form).' },
      { q: '¿Cuánto tarda en llegar la póliza?', a: 'La póliza se emite en cuanto se confirma el pago (de prueba): puedes descargarla al momento y te la enviamos por email, donde suele llegar en un par de minutos. Si no la ves, mira en Spam.' },
      { q: '¿A qué destinos no podéis asegurar?', a: 'A los países donde el Ministerio de Asuntos Exteriores recomienda no viajar. Si eliges uno, el formulario te lo dice al momento.' },
      { q: '¿Qué no cubre ningún plan?', a: 'Las enfermedades preexistentes (salvo la primera asistencia urgente), los incidentes bajo los efectos del alcohol o las drogas, los deportes profesionales y las actividades extremas, los viajes en contra de las recomendaciones oficiales, los actos intencionados y los viajes de más de {maxTripDays} días.' },
      { q: '¿Puede contratarlo mi asistente de IA?', a: 'Sí, si tu asistente es compatible con WebMCP, el estándar que permite a los agentes de IA usar una web. Tu asistente pide el precio, te enseña el resumen completo y solo puede pagar cuando tú lo confirmas expresamente.' },
      { q: '¿Cómo contacto con vosotros?', a: 'Escríbenos a {contactLink} y te contestamos lo antes posible.', needsContact: true },
    ],
    finalCtaTitle: '¿Preparado para empezar tu viaje?',
    finalCtaButton: 'Ver mi precio',

    // Footer
    footerLegal: 'Seguros Wildpass es un producto ficticio creado para una demostración. No es un seguro real, no ofrece cobertura y ningún pago es real.',
    footerTerms: 'Condiciones del seguro',
    footerWebmcp: 'Hecho con WebMCP',
    footerAgents: 'Para desarrolladores y agentes de IA',

    // /llms.txt: plain text for AI agents. Tool lines come from public/webmcp-tools.js (each tool's `es` line).
    llms: {
      intro: 'Wildpass es una web de demostración de un seguro de viaje (planes Wild y Wild+) que pueden usar tanto personas como agentes de IA.',
      howTitle: 'Cómo comprar (agentes de IA)',
      how: 'La compra se hace con las herramientas WebMCP que la página principal ({url}) registra en el navegador (document.modelContext). Llámalas en este orden:',
      confirm: 'Antes de confirm_payment, enseña el resumen y el total a la persona y espera su confirmación explícita.',
      moreTitle: 'Más información',
      agentsLink: 'Instrucciones para agentes y desarrolladores',
      termsLink: 'Condiciones del seguro',
    },

    // /agentes: the developer & AI-agent page (linked only from the footer). Tool lines come from public/webmcp-tools.js.
    agents: {
      title: 'Para desarrolladores y agentes de IA',
      intro: 'Esta demo se puede contratar entera desde un asistente de IA, sin rellenar ningún formulario.',
      webmcpTitle: 'Qué es WebMCP',
      webmcpText: 'WebMCP es un estándar web nuevo (en preparación en el W3C y en pruebas en Chrome) que permite a una página ofrecer «herramientas» a los asistentes de IA del navegador: en vez de leer la pantalla y pulsar botones, el asistente llama a funciones con datos claros. La página principal de Wildpass registra sus herramientas al cargarse, y cada una usa las mismas reglas del servidor que la web.',
      promptTitle: 'Pruébalo',
      toolsTitle: 'Las {count} herramientas',
      rulesTitle: 'Reglas de seguridad de confirm_payment',
      rulesIntro: 'El pago se rechaza si falta cualquiera de estas condiciones:',
      where: 'Las herramientas están disponibles en la página principal.',
      providerTitle: 'WebMCP en tu navegador',
      providerChecking: 'Comprobando…',
      providerNative: 'Tu navegador trae WebMCP propio ({name}). La página principal registra las herramientas ahí, y el otro nombre ({other}) apunta al mismo sitio.',
      providerPolyfill: 'Tu navegador no trae WebMCP. La página principal carga el polyfill MCP-B (@mcp-b/global) y expone las mismas herramientas en document.modelContext y navigator.modelContext (un único objeto).',
    },
    // Floating pill shown ONLY while an AI assistant calls the WebMCP tools (public/agent-pill.js).
    // Fixed phrases only: never the data the assistant sends (names, emails, ids, tokens).
    agentPill: {
      label: 'Tu asistente está usando Wildpass',
      show: 'Ver lo que ha hecho tu asistente',
      hide: 'Ocultar lo que ha hecho tu asistente',
      logLabel: 'Actividad de tu asistente',
      steps: {
        get_quote: 'Ha calculado el precio',
        select_plan: 'Ha elegido {plan}',
        set_traveler_details: 'Ha guardado los viajeros',
        review_order: 'Ha preparado el resumen',
        confirm_payment: 'Pago confirmado',
        get_policy: 'Ha consultado la póliza',
      },
      sent: 'Póliza enviada',
      failed: 'Paso pendiente: tu asistente lo está revisando',
    },

    // Checkout
    checkout: {
      progress: 'Paso {x} de 4',
      // Success screen = a boarding pass
      boarding: {
        title: 'Tarjeta de embarque',
        passenger: 'Pasajero/a',
        passengers: 'Pasajeros/as',
        destination: 'Destino',
        departure: 'Salida',
        return: 'Regreso',
        plan: 'Plan',
        stamp: 'Cubierto',
        qrLabel: 'Código QR con el enlace a tu póliza en PDF',
        qrNote: 'Escanéalo para abrir tu póliza',
      },
      tripCard: {
        title: 'Tu viaje',
        destination: 'Destino',
        dates: 'Fechas',
        travelers: 'Viajeros',
        days: '{days} días',
        ages: '{ages} años',
        lessThanOneYear: 'menos de 1 año',
        and: 'y',
        edit: 'Editar',
        editLabel: 'Editar el viaje',
        plan: 'Plan',
      },
      back: '← Volver',
      tripLine: '{from} – {to} · {days} días · {n} {travelersWord}',
      travelerOne: 'viajero',
      travelerMany: 'viajeros',
      totalLabel: 'Total',
      totalPaidLabel: 'Pagado (simulado)',
      choosePlan: 'Elige un plan',
      priceRange: '{min} – {max}',

      step1Title: 'Tu viaje a {destination}, cubierto',
      step1Line: 'Precio total para {n} {travelersWord}. Sin sorpresas después.',
      compare: {
        feature: 'Cobertura',
        price: 'Precio total',
        medical: 'Gastos médicos ({zone})',
        repatriation: 'Repatriación',
        baggage: 'Equipaje (robo o daños)',
        cancellation: 'Cancelación',
        perTraveler: 'por viajero',
        excess: 'Franquicia por siniestro médico',
        adventure: 'Deportes de aventura',
        adventureYes: 'Incluidos, con rescate hasta {rescue}',
        adventureNo: 'No incluidos',
        notIncluded: 'No incluida',
        exclusionsToggle: 'Qué no cubre (ver exclusiones)',
        bothPlans: 'En los dos planes',
        onlyIn: 'Solo en {plan}',
        limitsOf: 'Límites de {plan}',
        // Phones: compact switcher on top, then one row per coverage (label, then both values side by side).
        switchLabel: 'Elige tu plan',
        chooseShort: 'Elegir',
        compareTitle: 'Compara las coberturas',
      },
      choose: 'Elegir {plan}',
      selectedPlan: 'elegido',

      step2Title: '¿Quién viaja?',
      step2Line: 'Solo necesitamos nombre y fecha de nacimiento. Nada de DNI.',
      policyholder: 'Quién contrata',
      fullName: 'Nombre y apellidos',
      email: 'Email',
      emailHint: 'Te enviaremos la póliza aquí.',
      traveler: 'Viajero {n} · {age} años',
      ageYears: '{age} años',
      birthDate: 'Fecha de nacimiento',
      birthDatePlaceholder: 'dd/mm/aaaa',
      birthDateHint: 'Formato dd/mm/aaaa, por ejemplo 07/03/1990.',
      updateAge: 'Actualizar a {age} años y recalcular',
      ageUpdated: 'Listo: viajero {traveler} con {age} años. Nuevo total: {total}. Revisa los datos y pulsa Continuar.',
      sameAsPolicyholder: 'Es quien contrata',
      continue: 'Continuar',

      step3Title: 'Revisa antes de pagar',
      trip: 'Viaje',
      dates: 'Fechas',
      plan: 'Plan',
      whoBuys: 'Quién contrata',
      travelers: 'Viajeros',
      coverage: 'Coberturas por viajero',
      keyConditions: 'Lo más importante',
      exclusions: 'Exclusiones',
      terms: 'Leer las condiciones completas',
      accept: 'He leído y acepto las condiciones y exclusiones.',
      pay: 'Pagar {total} (simulado)',
      payNote: 'Es una demo: no se cobra nada ni se piden datos de tarjeta.',
      // Stripe test mode (only when test keys are configured).
      payStripe: 'Pagar {total}',
      cardTitle: 'Pago con tarjeta',
      cardMethod: 'Tarjeta de crédito o débito',
      cardMethodSelected: 'Seleccionado',
      cardLoading: 'Cargando el pago seguro de Stripe…',
      stripeNote: 'Pago de prueba con Stripe (modo test). Usa la tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier CVC. No se cobra nada.',
      processing: 'Procesando pago…',
      totalPaidStripeLabel: 'Pagado (prueba Stripe)',
      editDetails: '← Editar datos',

      step4Title: '¡Todo listo para empezar tu aventura!',
      policyNumber: 'Nº de póliza',
      download: 'Descargar mi póliza',
      emailSent: 'Te hemos enviado la póliza a {email}. Si no la ves, mira en Spam.',
      emailNotConfigured: 'El envío por email no está activo en esta demo: descarga la póliza con el botón.',
      startOver: 'Calcular otro viaje',

      working: 'Un momento…',
    },

    // Friendly error messages by server error_code ({placeholders} come from limits or the error).
    errors: {
      DESTINATION_NOT_COVERED: 'No podemos asegurar viajes a destinos con recomendación oficial de no viajar.',
      RETURN_BEFORE_DEPARTURE: 'La vuelta tiene que ser después de la ida. ¿Lo revisamos?',
      TRIP_TOO_LONG: 'Cubrimos viajes de hasta {maxTripDays} días.',
      INVALID_AGE: 'Por ahora aseguramos a viajeros de {minAge} a {maxAge} años.',
      INVALID_TRAVELER_COUNT: 'Podéis ser de {minTravelers} a {maxTravelers} viajeros.',
      DEPARTURE_NOT_IN_FUTURE: 'La ida tiene que ser a partir de mañana.',
      DEPARTURE_PASSED: 'La fecha de ida ya ha pasado. Calcula el precio de nuevo con otras fechas.',
      INVALID_DATE: 'Revisa las fechas de ida y vuelta.',
      SAME_COUNTRY: 'Elige un destino fuera de España.',
      INVALID_COUNTRY: 'Elige un destino de la lista.',
      ORIGIN_NOT_SUPPORTED: 'Por ahora solo aseguramos viajes que salen de España.',
      TERMS_NOT_ACCEPTED: 'Necesitamos que aceptes las condiciones para emitir la póliza.',
      INVALID_EMAIL: 'Ese email no parece correcto. Es donde te enviaremos la póliza.',
      INVALID_NAME: 'Escribe el nombre y apellidos de cada persona.',
      INVALID_BIRTH_DATE: 'Escribe la fecha de nacimiento como dd/mm/aaaa.',
      AGE_MISMATCH: 'Con esa fecha de nacimiento, el viajero {traveler} tendría {actualAge} años, y el precio es para {quotedAge}. ¿La revisamos?',
      QUOTE_EXPIRED: 'Este precio ha caducado. Calcúlalo de nuevo, solo tarda un momento.',
      NETWORK_ERROR: 'No hemos podido conectar. Revisa tu conexión y vuelve a intentarlo.',
      PAYMENT_DECLINED: 'La tarjeta ha sido rechazada. No se ha cobrado nada. Prueba con la tarjeta 4242 4242 4242 4242.',
      PAYMENT_PROVIDER_UNAVAILABLE: 'No hemos podido conectar con Stripe y la póliza no se ha emitido. Vuelve a intentarlo en unos minutos: nunca cobramos dos veces el mismo pedido.',
      PAYMENT_ERROR: 'Stripe no ha podido procesar el pago y la póliza no se ha emitido. Vuelve a intentarlo en unos minutos.',
      PAYMENT_NOT_COMPLETED: 'El pago no se ha completado, así que no hemos emitido la póliza. Vuelve a intentarlo.',
      PAYMENT_MISMATCH: 'Algo no cuadra con este pago. Vuelve a revisar tus datos y paga de nuevo.',
      stripeLoadError: 'No hemos podido cargar el pago con tarjeta de Stripe. Revisa tu conexión y recarga la página.',
      // Declined Stripe test cards, by Stripe decline_code / error code.
      card: {
        insufficient_funds: 'La tarjeta no tiene fondos suficientes. No se ha cobrado nada. Prueba con la tarjeta 4242 4242 4242 4242.',
        expired_card: 'La tarjeta está caducada. Prueba con la tarjeta 4242 4242 4242 4242 y una fecha futura.',
        incorrect_cvc: 'El código de seguridad (CVC) no es correcto. Revísalo y vuelve a intentarlo.',
        incorrect_number: 'El número de la tarjeta no es correcto. Revísalo y vuelve a intentarlo.',
        processing_error: 'Ha habido un error al procesar la tarjeta. No se ha cobrado nada. Vuelve a intentarlo.',
        lost_card: 'La tarjeta ha sido rechazada. No se ha cobrado nada. Prueba con la tarjeta 4242 4242 4242 4242.',
        stolen_card: 'La tarjeta ha sido rechazada. No se ha cobrado nada. Prueba con la tarjeta 4242 4242 4242 4242.',
        payment_intent_authentication_failure: 'No se ha completado la verificación de la tarjeta. No se ha cobrado nada. Vuelve a intentarlo.',
        card_declined: 'La tarjeta ha sido rechazada. No se ha cobrado nada. Prueba con la tarjeta 4242 4242 4242 4242.',
      },
      missingDestination: 'Elige a dónde vas.',
      missingDates: 'Elige las fechas de ida y vuelta.',
      missingDeparture: 'Elige la fecha de ida.',
      missingReturn: 'Elige la fecha de vuelta.',
      missingAge: 'Elige la edad del viajero {n}.',
      missingName: 'Escribe el nombre y apellidos.',
      missingBirthDate: 'Escribe la fecha de nacimiento como dd/mm/aaaa.',
      generic: 'Algo no ha ido bien. Vuelve a intentarlo.',
    },


    back: 'Volver',
    // Terms page
    planExclusionsTitle: 'No cubre',
    exclusionsTitle: 'Exclusiones de ambos planes',
    networkError: 'No se pudo conectar con el servidor. Inténtalo de nuevo.',
    // How a policy was paid (review conditions, get_policy, PDF and email). {ref} = Stripe PaymentIntent id.
    payment: {
      simulated: 'Pago simulado',
      stripeRef: 'Pago de prueba Stripe · ref. {ref}',
      simulatedCondition: 'Pago simulado: no se cobra nada.',
      stripeCondition: 'Pago de prueba con Stripe (modo test): no se cobra nada.',
    },

    // Terms page, PDF and email
    termsTitle: 'Condiciones del seguro (demo)',
    termsIntro: 'Esto es una demostración. No es un seguro real y no ofrece ninguna cobertura.',
    certificateTitle: 'Certificado de seguro de viaje',
    // PDF certificate (src/pdf.js)
    certificate: {
      topStrip: 'DEMO — NO ES UN SEGURO REAL · ESTE DOCUMENTO NO TIENE VALIDEZ',
      policyNumberLabel: 'PÓLIZA Nº',
      issuedOn: 'Emitida el',
      planPill: 'Plan',
      destination: 'Destino',
      dates: 'Fechas',
      origin: 'Origen',
      total: 'Prima total',
      simulatedPayment: 'Pago simulado',
      stripePayment: 'Pago de prueba Stripe',
      days: 'días',
      travelerOne: 'viajero',
      travelerMany: 'viajeros',
      peopleTitle: 'Tomador y asegurados',
      name: 'Nombre',
      role: 'Rol',
      birthDate: 'Fecha de nacimiento',
      rolePolicyholder: 'Tomador',
      roleInsured: 'Asegurado/a',
      roleBoth: 'Tomador y asegurado/a',
      coverageTitle: 'Coberturas por viajero',
      coverage: 'Cobertura',
      limit: 'Límite',
      excess: 'Franquicia por siniestro médico',
      exclusionsTitle: 'Principales exclusiones',
      emergencyTitle: '¿Una emergencia?',
      emergencyText: 'Llama antes de acudir al médico y no adelantes dinero.',
      emergencyPhone: '[Teléfono de asistencia · demo]',
      emergencyKeepNumber: 'Ten a mano tu nº de póliza.',
      footer: 'Seguros Wildpass es un producto ficticio creado para una demostración. Este certificado no tiene validez legal ni ofrece cobertura real.',
      termsLabel: 'Condiciones:',
    },
    // Policy email (src/email.js). {name} {destination} {number} are filled in.
    email: {
      subject: 'Tu póliza Wildpass {number} · {destination} (demo)',
      demoLine: 'Demo — no es un seguro real. No se ha cobrado nada.',
      headline: '¡Listo, {name}! Tu viaje a {destination} está cubierto',
      intro: 'Te adjuntamos el certificado en PDF. Estos son los datos principales:',
      policyNumber: 'Nº de póliza',
      plan: 'Plan',
      dates: 'Fechas',
      travelers: 'Viajeros',
      total: 'Total',
      totalNote: 'pago simulado',
      totalNoteStripe: 'pago de prueba Stripe · ref. {ref}',
      days: 'días',
      button: 'Descargar mi póliza',
      attachedNote: 'También va adjunta a este correo.',
      emergency: '¿Una emergencia? Llama antes de acudir al médico y no adelantes dinero. Teléfono: [Teléfono de asistencia · demo]. Ten a mano tu nº de póliza.',
      footer: 'Seguros Wildpass es un producto ficticio creado para una demostración. Este correo y el certificado no tienen validez legal ni ofrecen cobertura real.',
    },
  },
};
