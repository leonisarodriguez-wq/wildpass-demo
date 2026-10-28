// Brand name, logo text, claim, colours, fonts and ALL website texts live here.

export default {
  name: 'Seguros Wildpass',
  logo: { wordmark: 'wildpass', tagline: 'seguros de viaje' }, // wordmark: lowercase, bold
  claim: "Travel wild. We've got you.",
  claimEs: 'Viaja salvaje. Nosotros te cubrimos.',
  policyPrefix: 'WILD', // policy numbers look like WILD-2026-XXXXXX
  emailSenderName: 'Seguros Wildpass (demo)',

  // WCAG AA checked (normal text needs 4.5:1): night on cream 15.7, night on yellow 11.0,
  // stone on cream 5.3, white on red 5.0. Red TEXT on cream is only 4.48 (fails), and
  // yellow on cream is 1.4 (fails): never use those two combinations for text.
  colors: {
    night: '#0E1B2C', // main text, header
    yellow: '#FFC629', // buttons (with night text), accents on night
    cream: '#F7F3EA', // page background
    stone: '#5B6573', // secondary text
    red: '#D7263D', // ONLY the demo banner and errors
    white: '#FFFFFF',
  },
  // Self-hosted from @fontsource (no requests to Google).
  fonts: { headings: 'Space Grotesk', text: 'Inter' },

  demoBanner: 'Demo — no es un seguro real',
  pdfDisclaimer: 'DEMO — NO ES UN SEGURO REAL',

  texts: {
    pageTitle: 'Seguros Wildpass · Seguro de viaje (demo)',
    heading: 'Seguro de viaje',
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
    emailSubject: 'Tu póliza Wildpass de demostración',
    emailGreeting: 'Hola',
  },
};
