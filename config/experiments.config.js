// A/B experiments shown on /metricas (assignment: public/exp.js; texts: brand.texts.metrics.experiments).
// baseline / target = PLANNING ASSUMPTIONS (not data) for the minimum sample size until the control variant has
// `observedFrom` sessions; from then on the observed control rate replaces the assumed baseline.
export default {
  observedFrom: 100,
  hero: { baseline: 0.40, liftPoints: 0.10 },   // % of landing sessions that choose a destination
  upsell: { baseline: 0.35, liftPoints: 0.10 }, // % of plan choices that are Wild+
};
