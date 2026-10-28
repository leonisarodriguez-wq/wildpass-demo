// ALL prices, coverage limits, exclusions and validation limits live here.
// Calibrated on 28 Oct 2026 against real competitor quotes: see docs/pricing-research.md.
// Money amounts are in euros.

export default {
  currency: 'EUR',

  // Base price per adult (age factor 1.0) for a 7-day trip, by zone and plan.
  // Longer/shorter trips are scaled by (days / 7) ^ lengthExponent (days counted inclusively).
  // An exponent below 1 makes the cost per day go down for longer trips.
  // WARNING: calibrated only on 8-15 day trips; long trips are probably underpriced (see docs).
  baseDays: 7,
  lengthExponent: 0.28,
  basePrice7Days: {
    europe: { esencial: 21.19, premium: 30.83 }, // 8 days → 22 € / 32 €
    rest_of_world: { esencial: 48.46, premium: 68.73 }, // 11 days → 55 € / 78 €; 15 days → 60 € / 85 €
    usa_canada_japan: { esencial: 50.22, premium: 70.49 }, // 11 days → 57 € / 80 €
  },

  // Age (at departure) → price multiplier. Ages outside these bands are not insurable.
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
    esencial: {
      name: 'Esencial',
      coverage: {
        medical_expenses_europe_eur: 500000,
        medical_expenses_rest_of_world_eur: 1000000,
        repatriation: '100% del coste real',
        baggage_theft_damage_eur: 1000,
        baggage_delay_eur: 150,
        urgent_dental_eur: 150,
        civil_liability_eur: 30000,
        cancellation_per_traveler_eur: 0, // 0 = not included
      },
      excess_per_medical_claim_eur: 75,
    },
    premium: {
      name: 'Premium',
      coverage: {
        medical_expenses_europe_eur: 2000000,
        medical_expenses_rest_of_world_eur: 5000000,
        repatriation: '100% del coste real',
        baggage_theft_damage_eur: 2500,
        baggage_delay_eur: 300,
        urgent_dental_eur: 500,
        civil_liability_eur: 100000,
        cancellation_per_traveler_eur: 3000,
      },
      excess_per_medical_claim_eur: 0,
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
  },

  // Exclusions that apply to both plans.
  exclusions: [
    'Enfermedades preexistentes, salvo la primera asistencia urgente.',
    'Incidentes bajo los efectos del alcohol o las drogas.',
    'Deportes profesionales o de alto riesgo.',
    'Viajes en contra de las recomendaciones oficiales del Gobierno.',
    'Actos intencionados.',
    'Viajes de más de 90 días.',
  ],
};
