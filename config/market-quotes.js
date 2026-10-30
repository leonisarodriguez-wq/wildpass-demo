// Real competitor quotes collected by the project owner on 28 Oct 2026 (see docs/pricing-research.md §1).
// Used for the FAQ answer ("Lo calibramos con N presupuestos…"); the full research is in docs/pricing-research.md.
// Prices in EUR, total for the quote unless perPerson is true. A "quote" = one insurer's answer for one trip.

export default {
  collectedOn: '2026-10-28',
  insurers: ['Heymondo', 'IATI', 'Intermundial'], // shown as A, B, C in this order
  // The competitor plan compared with each of ours (by coverage level).
  comparable: {
    wild: { Heymondo: 'Tranquilidad', IATI: 'Estándar', Intermundial: 'Mini' },
    wild_plus: { Heymondo: 'Top', IATI: 'Mochilero', Intermundial: 'Totaltravel' },
    wild_max: { Heymondo: 'Premium', IATI: 'Estrella', Intermundial: 'Premium' }, // IATI has no top plan in the Italy quote
  },
  trips: [
    {
      label: 'Italia', zone: 'europe', from: '2026-12-10', to: '2026-12-17', age: 35, perPerson: false,
      quotes: {
        Heymondo: { Tranquilidad: 23.53, Top: 30.50, Premium: 40.77 },
        IATI: { Escapadas: 22.20, 'Estándar': 24.85, Mochilero: 34.18 },
        Intermundial: { Mini: 19.53, Totaltravel: 30.22, Premium: 46.60 },
      },
    },
    {
      label: 'Tailandia', zone: 'rest_of_world', from: '2026-12-10', to: '2026-12-24', age: 35, perPerson: false,
      quotes: {
        Heymondo: { Esencial: 49.42, Tranquilidad: 64.00, Top: 88.02, Premium: 109.37 },
        IATI: { 'Estándar': 65.61, Mochilero: 90.87, Estrella: 117.80 },
        Intermundial: { Mini: 56.71, Totaltravel: 79.99, Premium: 106.99 },
      },
    },
    {
      label: 'EE. UU.', zone: 'usa_canada_japan', from: '2026-12-10', to: '2026-12-20', age: 35, perPerson: true, // 2 adults (35 and 38), per person
      quotes: {
        Heymondo: { Esencial: 42.29, Tranquilidad: 57.00, Top: 79.48, Premium: 101.82 },
        IATI: { 'Estándar': 57.65, Mochilero: 83.67, Estrella: 111.39 },
        Intermundial: { Mini: 69.21, Totaltravel: 83.26, Premium: 134.99 },
      },
    },
    {
      // Heymondo and IATI don't price by age, so their 68-year-old price is also their adult price.
      label: 'México (68 años)', zone: 'rest_of_world', from: '2026-12-10', to: '2026-12-20', age: 68, perPerson: false,
      quotes: {
        Heymondo: { Esencial: 42.27, Tranquilidad: 57.00, Top: 82.42, Premium: 101.81 },
        IATI: { 'Estándar': 58.03, Mochilero: 84.05, Estrella: 109.66 },
        Intermundial: { Mini: 86.77, Totaltravel: 120.20, Premium: 164.98 },
      },
    },
    {
      // Control quote: only Intermundial was asked again for a 35-year-old. For the comparison, the other two
      // insurers' prices come from the 68-year-old quote (they don't price by age); the page marks them with *.
      label: 'México (35 años)', zone: 'rest_of_world', from: '2026-12-10', to: '2026-12-20', age: 35, perPerson: false, borrowFrom: 'México (68 años)',
      quotes: {
        Intermundial: { Mini: 52.59, Totaltravel: 72.85, Premium: 99.99 },
      },
    },
  ],
};

// The trips shown in the /caso calibration table (and counted in the FAQ answer).
export const calibrationTrips = ['Italia', 'Tailandia', 'EE. UU.'];
// Competitor prices in that table: one per insurer and comparable plan that has a quote.
export const comparedPriceCount = data => data.trips.filter(t => calibrationTrips.includes(t.label)).reduce((n, t) => n + Object.values(data.comparable).reduce((m, byInsurer) => m + data.insurers.filter(ins => t.quotes[ins]?.[byInsurer[ins]] !== undefined).length, 0), 0);

// Number of quotes (one per insurer per trip).
export const quoteCount = data => data.trips.reduce((n, trip) => n + Object.keys(trip.quotes).length, 0);
