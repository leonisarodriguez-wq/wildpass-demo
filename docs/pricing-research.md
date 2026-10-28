# Pricing research and calibration

**Status:** provisional calibration, 28 Oct 2026. Prices live in `config/pricing.config.js`; the automated check is `test/pricing-targets.test.js`.

## 1. Data collected

Collected by the project owner on **28 Oct 2026** from the competitors' official quote pages, as a Spain resident, with no personal data entered. All trips depart in December 2026. Prices are **total prices in EUR** unless marked "per person".

| Trip | Travellers | Heymondo | IATI | Intermundial |
|---|---|---|---|---|
| Italy, 10–17 Dec | 1 adult, 35 | Tranquilidad 23.53 · Top 30.50 · Premium 40.77 | Escapadas 22.20 · Estándar 24.85 · Mochilero 34.18 | Mini 19.53 · Totaltravel 30.22 · Premium 46.60 |
| Thailand, 10–24 Dec | 1 adult, 35 | Esencial 49.42 · Tranquilidad 64.00 · Top 88.02 · Premium 109.37 | Estándar 65.61 · Mochilero 90.87 · Estrella 117.80 | Mini 56.71 · Totaltravel 79.99 · Premium 106.99 |
| USA, 10–20 Dec | 2 adults, 35 and 38 (**per person**) | Esencial 42.29 · Tranquilidad 57.00 · Top 79.48 · Premium 101.82 | Estándar 57.65 · Mochilero 83.67 · Estrella 111.39 | Mini 69.21 · Totaltravel 83.26 · Premium 134.99 |
| Mexico, 10–20 Dec | 1 senior, 68 | Esencial 42.27 · Tranquilidad 57.00 · Top 82.42 · Premium 101.81 | Estándar 58.03 · Mochilero 84.05 · Estrella 109.66 | Mini 86.77 · Totaltravel 120.20 · Premium 164.98 |
| Mexico, 10–20 Dec (control) | 1 adult, 35 | — | — | Mini 52.59 · Totaltravel 72.85 · Premium 99.99 |

Observations from the data:
- **Intermundial charges exactly ×1.65 for travellers aged 68+** (86.77/52.59 = 1.6499; 120.20/72.85 = 1.6500; 164.98/99.99 = 1.6500).
- **Heymondo and IATI do not price by age at the quote stage**; they restrict which plans a traveller can buy by age instead. So their Mexico 68-year-old prices are also their adult prices.
- Heymondo prices Mexico and the USA almost identically (Tranquilidad 57.00 in both). We put Mexico in "Rest of world" and the USA in "USA/Canada/Japan", so we are cheaper than Heymondo for Mexico.

## 2. Methodology

**Comparable plans** (chosen by coverage level):

| Our plan | Heymondo | IATI | Intermundial |
|---|---|---|---|
| Esencial | Tranquilidad | Estándar | Mini |
| Premium | Top | Mochilero | Totaltravel |

**Target** = slightly below the median of the three comparable plans ("challenger" positioning), set by the project owner, for an adult aged 18–64.

**Trip length.** Competitor trips are described by their dates, e.g. "10–17 Dec", which the targets call "7 days". **Our app counts both the departure and the return day**, so the same trip is **8 days** for us. To compare like with like, we calibrate on the **exact same date ranges**:

| Target as stated | Same dates | Our day count |
|---|---|---|
| Europe "7 days" | 10–17 Dec | 8 days |
| Rest of world / USA "10 days" | 10–20 Dec | 11 days |
| Rest of world "14 days" | 10–24 Dec | 15 days |

**Formula** (unchanged structure): price per traveller = base price for 7 days (by zone and plan) × (days ÷ 7)^0.28 × age factor, rounded to cents.
- The exponent **0.28** comes from the targets themselves: Rest of world goes from 55 → 60 (Esencial) and 78 → 85 (Premium) between 11 and 15 days, giving exponents of 0.281 and 0.277.
- The base prices are then solved so each zone hits its target exactly.

## 3. Calibrated values

| Zone | Esencial base (7 days) | Premium base (7 days) |
|---|---|---|
| Europe | 21.19 | 30.83 |
| Rest of world | 48.46 | 68.73 |
| USA/Canada/Japan | 50.22 | 70.49 |

Length exponent: **0.28** (was 0.70).

| Age band | Factor | Evidence |
|---|---|---|
| 0–17 | 0.70 | **Assumption — no market evidence** (no child quotes were collected) |
| 18–64 | 1.00 | Reference |
| 65–74 | **1.65** (was 1.60) | Intermundial charges exactly ×1.65 at 68 |
| 75–85 | 2.20 | **Assumption — no market evidence** (no quotes above 68 were collected) |

## 4. Results: ours vs competitors (per adult unless stated)

| Trip (our day count) | Plan | Heymondo | IATI | Intermundial | Median | **Target** | **Ours** | Ours vs median |
|---|---|---|---|---|---|---|---|---|
| Italy (8 days) | Esencial | 23.53 | 24.85 | 19.53 | 23.53 | 22 | **22.00** | −6.5% |
| Italy (8 days) | Premium | 30.50 | 34.18 | 30.22 | 30.50 | 32 | **32.00** | **+4.9% ⚠️** |
| Thailand (15 days) | Esencial | 64.00 | 65.61 | 56.71 | 64.00 | 60 | **59.99** | −6.3% |
| Thailand (15 days) | Premium | 88.02 | 90.87 | 79.99 | 88.02 | 85 | **85.08** | −3.3% |
| USA (11 days) | Esencial | 57.00 | 57.65 | 69.21 | 57.65 | 57 | **57.00** | −1.1% |
| USA (11 days) | Premium | 79.48 | 83.67 | 83.26 | 83.26 | 80 | **80.00** | −3.9% |
| Mexico, adult 35 (11 days) | Esencial | 57.00\* | 58.03\* | 52.59 | 57.00 | 55 | **55.00** | −3.5% |
| Mexico, adult 35 (11 days) | Premium | 82.42\* | 84.05\* | 72.85 | 82.42 | 78 | **78.00** | −5.4% |
| Mexico, senior 68 (11 days) | Esencial | 57.00 | 58.03 | 86.77 | 58.03 | — | **90.75** | **+56.4% ⚠️** |
| Mexico, senior 68 (11 days) | Premium | 82.42 | 84.05 | 120.20 | 84.05 | — | **128.70** | **+53.1% ⚠️** |

\* Heymondo and IATI quotes were for a 68-year-old, but they don't price by age, so they equal their adult price.

All four targets are met within ±5% (in fact within ±0.2%); this is checked automatically by `npm test`.

## 5. Warnings and open questions

1. **Europe Premium target is above the median.** €32 is 4.9% *above* the median of comparable plans (€30.50), which contradicts the "slightly below median" rule. Kept as instructed; a target of about €29.50 would match the rule.
2. **Seniors are much more expensive than Heymondo and IATI** (+53–56% vs the median), because only Intermundial adds an age surcharge at the quote stage. Our 65–74 factor matches Intermundial (+4.6% / +7.1% above it). Competitors that don't surcharge may instead exclude seniors from some plans or ask health questions later; that wasn't captured in this data.
3. **Long and very short trips are not supported by data.** All quotes are 8–15 days. With the flat exponent 0.28, a 90-day Rest-of-world Esencial costs about **€99** and a 2-day Europe Esencial about **€15**. Long-trip prices are very probably too low. **Before selling trips over ~3 weeks, collect quotes for 30, 60 and 90 days**, and probably change the length formula.
4. **No child (0–17) or 75+ data.** Those factors are assumptions.
5. **Same-plan coverage not compared line by line.** Plans were matched by tier name and general level, not by checking every limit (medical, baggage, cancellation, excess).
6. **Single snapshot.** Prices were collected on one day (28 Oct 2026) for December departures; seasonality and promotions are not captured.
