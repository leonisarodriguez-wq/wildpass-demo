// ALL prices, coverage limits, exclusions and validation limits live here.
// Calibrated on 28 Oct 2026 against real competitor quotes: see docs/pricing-research.md.
// Money amounts are in euros. Plan ids: "wild" and "wild_plus".

export default {
  currency: 'EUR',

  // Base price per adult (age factor 1.0) for a 7-day trip, by zone and plan.
  // Up to `longTrip.fromDay - 1` days, trips are scaled by (days / 7) ^ lengthExponent
  // (days counted inclusively); an exponent below 1 makes the cost per day fall for longer trips.
  baseDays: 7,
  lengthExponent: 0.28,
  basePrice7Days: {
    europe: { wild: 21.19, wild_plus: 28.42 }, // 8 days → 22 € / 29.50 €
    rest_of_world: { wild: 48.46, wild_plus: 68.73 }, // 11 days → 55 € / 78 €; 15 days → ~60 € / ~85 €
    usa_canada_japan: { wild: 50.22, wild_plus: 70.49 }, // 11 days → 57 € / 80 €
  },

  // From day 15 the per-day discount stops: each extra day costs the average of what
  // days 10–14 each add to the price. ASSUMPTION without market data (see docs).
  longTrip: { fromDay: 15, averageOfDays: [10, 14] },

  // Age (at departure) → price multiplier. Ages outside these bands are not insurable.
  // We price age risk instead of refusing seniors.
  ageFactors: [
    { minAge: 0, maxAge: 17, factor: 0.7 }, // assumption, no market evidence
    { minAge: 18, maxAge: 64, factor: 1.0 },
    { minAge: 65, maxAge: 74, factor: 1.65 }, // market evidence: Intermundial ×1.65 at 68
    { minAge: 75, maxAge: 85, factor: 2.2 }, // assumption, no market evidence
  ],

  limits: {
    allowedOrigins: ['ES'], // only Spain for now
    maxTripDays: 90,
    minTravelers: 1,
    maxTravelers: 8,
    minAge: 0,
    maxAge: 85,
    quoteValidDays: 7,
  },

  // Destination country (ISO 3166-1 alpha-2) → zone. Anything not listed is rest_of_world.
  zones: {
    europe: [
      'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
      'FO', 'FR', 'GB', 'GI', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC',
      'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA',
    ],
    usa_canada_japan: ['US', 'CA', 'JP'],
  },
  zoneNames: {
    europe: 'Europa',
    rest_of_world: 'Resto del mundo',
    usa_canada_japan: 'EE. UU., Canadá y Japón',
  },

  plans: {
    wild: {
      name: 'Wild',
      coverage: {
        medical_expenses_europe_eur: 500000,
        medical_expenses_rest_of_world_eur: 1000000,
        repatriation: '100% del coste real',
        baggage_theft_damage_eur: 1000,
        baggage_delay_eur: 150,
        urgent_dental_eur: 150,
        civil_liability_eur: 30000,
        cancellation_per_traveler_eur: 0, // 0 = not included
        adventure_sports: 'no incluidos',
        search_and_rescue_eur: 0,
      },
      adventure_sports_included: false,
      excess_per_medical_claim_eur: 75,
      extraExclusions: [
        'Deportes de aventura (trekking, buceo, esquí, snowboard, surf, rafting, barranquismo y similares). Para cubrirlos, elige Wild+.',
      ],
    },
    wild_plus: {
      name: 'Wild+',
      coverage: {
        medical_expenses_europe_eur: 2000000,
        medical_expenses_rest_of_world_eur: 5000000,
        repatriation: '100% del coste real',
        baggage_theft_damage_eur: 2500,
        baggage_delay_eur: 300,
        urgent_dental_eur: 500,
        civil_liability_eur: 100000,
        cancellation_per_traveler_eur: 3000,
        adventure_sports: 'incluidos: trekking hasta 4.000 m, buceo hasta 30 m, esquí y snowboard en pistas señalizadas, surf, rafting y barranquismo',
        search_and_rescue_eur: 15000,
      },
      adventure_sports_included: true,
      adventure_sports_limits: {
        trekking_max_altitude_m: 4000,
        scuba_diving_max_depth_m: 30,
        skiing_snowboarding: 'marked slopes only',
        other_included: ['surf', 'rafting', 'canyoning'],
      },
      excess_per_medical_claim_eur: 0,
      extraExclusions: [
        'Deportes de aventura fuera de los límites cubiertos: trekking por encima de 4.000 m, buceo a más de 30 m, esquí o snowboard fuera de pistas señalizadas.',
      ],
    },
  },

  // Spanish labels for each coverage line (used on the website, terms page and PDF).
  coverageLabels: {
    medical_expenses_europe_eur: 'Gastos médicos (Europa)',
    medical_expenses_rest_of_world_eur: 'Gastos médicos (resto del mundo)',
    repatriation: 'Repatriación',
    baggage_theft_damage_eur: 'Robo o daños del equipaje',
    baggage_delay_eur: 'Retraso del equipaje',
    urgent_dental_eur: 'Dental urgente',
    civil_liability_eur: 'Responsabilidad civil',
    cancellation_per_traveler_eur: 'Cancelación (por viajero)',
    adventure_sports: 'Deportes de aventura',
    search_and_rescue_eur: 'Búsqueda y rescate',
  },

  // Exclusions that apply to BOTH plans (each plan adds its own extraExclusions).
  exclusions: [
    'Enfermedades preexistentes, salvo la primera asistencia urgente.',
    'Incidentes bajo los efectos del alcohol o las drogas.',
    'Deportes profesionales y actividades extremas (por ejemplo, salto BASE).',
    'Viajes en contra de las recomendaciones oficiales del Gobierno.',
    'Actos intencionados.',
    'Viajes de más de 90 días.',
  ],
};
