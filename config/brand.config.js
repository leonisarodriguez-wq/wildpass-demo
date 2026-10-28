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
    border: '#C9DCE6', // thin lines and box borders (PDF, email)
    paleYellow: '#FFF6D6', // highlighted cells (total price, excess), with night text
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

  texts: {
    pageTitle: 'Seguros Wildpass · Seguro de viaje (demo)',
    heading: 'Seguro de viaje',
    heroSubtitle: 'Seguro de viaje con deportes de aventura, sin letra pequeña y con la póliza en tu email en 2 minutos.',
    intro: 'Calcula tu precio en segundos. Solo para viajes que salen de España.',

    // Step 1: quote
    quoteTitle: '1. Tu viaje',
    origin: 'País de salida',
    destination: 'País de destino',
    departureDate: 'Fecha de salida',
    returnDate: 'Fecha de regreso',
    travelerAges: 'Edad de cada viajero (el día de salida)',
    addTraveler: 'Añadir viajero',
    removeTraveler: 'Quitar',
    getQuote: 'Ver precios',

    // Step 2: plans
    plansTitle: '2. Elige tu plan',
    perTraveler: 'por viajero',
    total: 'Total',
    excess: 'Franquicia por siniestro médico',
    notIncluded: 'No incluida',
    planExclusionsTitle: 'No cubre',
    exclusionsTitle: 'Exclusiones de ambos planes',
    choosePlan: 'Elegir',

    // Step 3: travellers
    detailsTitle: '3. Datos de los viajeros',
    policyholder: 'Tomador del seguro',
    fullName: 'Nombre y apellidos',
    email: 'Correo electrónico',
    traveler: 'Viajero',
    age: 'años',
    ageColumn: 'Edad',
    priceColumn: 'Precio',
    birthDate: 'Fecha de nacimiento',
    noIdNote: 'No te pedimos DNI ni datos de tarjeta.',
    continue: 'Continuar',

    // Step 4: review + payment
    reviewTitle: '4. Revisa y paga',
    trip: 'Viaje',
    plan: 'Plan',
    travelers: 'Viajeros',
    reviewExclusionsTitle: 'Exclusiones',
    acceptTerms: 'He leído y acepto las condiciones del seguro',
    termsLink: 'Ver condiciones',
    payButton: 'Pagar (simulado)',
    simulatedPaymentNote: 'Pago simulado: no se cobra nada y no se piden datos de tarjeta.',
    mustAcceptTerms: 'Debes aceptar las condiciones para continuar.',

    // Step 5: confirmation
    doneTitle: '¡Listo! Tu póliza de demostración',
    policyNumber: 'Número de póliza',
    downloadPdf: 'Descargar certificado (PDF)',
    emailStatus: 'Estado del correo',
    emailStatuses: {
      not_configured: 'El envío de correos no está configurado',
      pending: 'Enviando…',
      sent: 'Enviado',
      failed: 'No se pudo enviar',
      accepted: 'Aceptado por el servicio de correo',
      deferred: 'Entrega retrasada, se reintentará',
      delivered: 'Entregado',
      opened: 'Abierto',
      bounced: 'Rebotado (no se pudo entregar)',
      blocked: 'Bloqueado',
      marked_as_spam: 'Marcado como spam',
    },
    startOver: 'Nuevo presupuesto',

    back: 'Volver',
    loading: 'Cargando…',
    networkError: 'No se pudo conectar con el servidor. Inténtalo de nuevo.',

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
      emergencyText: 'Llama antes de acudir al médico y no adelantes dinero. Asistencia 24\u00a0h en español.',
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
      days: 'días',
      button: 'Descargar mi póliza',
      attachedNote: 'También va adjunta a este correo.',
      emergency: '¿Una emergencia? Llama antes de acudir al médico y no adelantes dinero. Asistencia 24\u00a0h en español: [Teléfono de asistencia · demo]. Ten a mano tu nº de póliza.',
      footer: 'Seguros Wildpass es un producto ficticio creado para una demostración. Este correo y el certificado no tienen validez legal ni ofrecen cobertura real.',
    },
  },
};
