// Brand name, colours and ALL website texts live here. "BRAND" is a placeholder.

export default {
  name: 'BRAND',
  policyPrefix: 'BRAND', // policy numbers look like BRAND-2026-XXXXXX
  colors: {
    primary: '#1f4e8c',
    banner: '#b00020',
    bannerText: '#ffffff',
  },
  demoBanner: 'Demo — no es un seguro real',
  pdfDisclaimer: 'DEMO — NO ES UN SEGURO REAL',

  texts: {
    pageTitle: 'BRAND · Seguro de viaje',
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
    exclusionsTitle: 'Exclusiones (ambos planes)',
    choosePlan: 'Elegir',

    // Step 3: travellers
    detailsTitle: '3. Datos de los viajeros',
    policyholder: 'Tomador del seguro',
    fullName: 'Nombre y apellidos',
    email: 'Correo electrónico',
    traveler: 'Viajero',
    age: 'edad',
    birthDate: 'Fecha de nacimiento',
    noIdNote: 'No te pedimos DNI ni datos de tarjeta.',
    continue: 'Continuar',

    // Step 4: review + payment
    reviewTitle: '4. Revisa y paga',
    trip: 'Viaje',
    plan: 'Plan',
    travelers: 'Viajeros',
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
    emailSubject: 'Tu póliza de demostración',
  },
};
