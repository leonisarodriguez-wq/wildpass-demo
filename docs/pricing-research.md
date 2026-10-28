# Pricing research and calibration — Seguros Wildpass

**Status:** provisional calibration, 28 Oct 2026. Prices live in `config/pricing.config.js`; the automated checks are in `test/pricing-targets.test.js`.

Our plans: **Wild** (id `wild`, the basic plan) and **Wild+** (id `wild_plus`, the complete plan with adventure sports).

## 1. Data collected

Collected by the project owner on **28 Oct 2026** from the competitors' official quote pages, as a Spain resident, with no personal data entered. All trips depart in December 2026. Prices are **total prices in EUR** unless marked "per person".

| Trip | Travellers | Heymondo | IATI | Intermundial |
|---|---|---|---|---|
| Italy, 10–17 Dec | 1 adult, 35 | Tranquilidad 23.53 · Top 30.50 · Premium 40.77 | Escapadas 22.20 · Estándar 24.85 · Mochilero 34.18 | Mini 19.53 · Totaltravel 30.22 · Premium 46.60 |
| Thailand, 10–24 Dec | 1 adult, 35 | Esencial 49.42 · Tranquilidad 64.00 · Top 88.02 · Premium 109.37 | Estándar 65.61 · Mochilero 90.87 · Estrella 117.80 | Mini 56.71 · Totaltravel 79.99 · Premium 106.99 |
| USA, 10–20 Dec | 2 adults, 35 and 38 (**per person**) | Esencial 42.29 · Tranquilidad 57.00 · Top 79.48 · Premium 101.82 | Estándar 57.65 · Mochilero 83.67 · Estrella 111.39 | Mini 69.21 · Totaltravel 83.26 · Premium 134.99 |
| Mexico, 10–20 Dec | 1 senior, 68 | Esencial 42.27 · Tranquilidad 57.00 · Top 82.42 · Premium 101.81 | Estándar 58.03 · Mochilero 84.05 · Estrella 109.66 | Mini 86.77 · Totaltravel 120.20 · Premium 164.98 |
| Mexico, 10–20 Dec (control) | 1 adult, 35 | — | — | Mini 52.59 · Totaltravel 72.85 · Premium 99.99 |

(The competitor plan names above, such as "Esencial" or "Premium", are the competitors' own names, not ours.)

Observations from the data:
- **Intermundial charges exactly ×1.65 for travellers aged 68+** (86.77/52.59 = 1.6499; 120.20/72.85 = 1.6500; 164.98/99.99 = 1.6500).
- **Heymondo and IATI do not price by age at the quote stage**; they restrict which plans a traveller can buy by age instead. So their Mexico 68-year-old prices are also their adult prices.
- Heymondo prices Mexico and the USA almost identically (Tranquilidad 57.00 in both). We put Mexico in "Rest of world" and the USA in "USA/Canada/Japan", so we are cheaper than Heymondo for Mexico.

## 2. Methodology

**Comparable plans** (chosen by coverage level):

| Our plan | Heymondo | IATI | Intermundial |
|---|---|---|---|
| Wild | Tranquilidad | Estándar | Mini |
| Wild+ | Top | Mochilero | Totaltravel |

**Target** = slightly below the median of the three comparable plans ("challenger" positioning), for an adult aged 18–64. Decided by the project owner.

**Trip length (decision: keep inclusive counting).** Competitor trips are described by their dates, e.g. "10–17 Dec", which the targets call "7 days". **Our app counts both the departure and the return day**, so the same trip is **8 days** for us. We keep that rule and calibrate on the **exact same date ranges**:

| Target as stated | Same dates | Our day count |
|---|---|---|
| Europe "7 days" | 10–17 Dec | 8 days |
| Rest of world / USA "10 days" | 10–20 Dec | 11 days |
| Rest of world "14 days" | 10–24 Dec | 15 days |

**Formula.** Price per traveller = base price for 7 days (by zone and plan) × length multiplier × age factor, rounded to cents.
- **Up to 14 days:** length multiplier = (days ÷ 7)^0.28. The exponent 0.28 comes from the targets themselves (Rest of world goes from 55 → 60 and 78 → 85 between 11 and 15 days, giving 0.281 and 0.277).
- **From day 15 (assumption, see §5):** the per-day discount stops. Each extra day costs the same: the **average of what days 10, 11, 12, 13 and 14 each add** to the price.

## 3. Calibrated values

| Zone | Wild base (7 days) | Wild+ base (7 days) |
|---|---|---|
| Europe | 21.19 | **28.42** (was 30.83) |
| Rest of world | 48.46 | 68.73 |
| USA/Canada/Japan | 50.22 | 70.49 |

Length exponent: **0.28**, up to day 14.

| Age band | Factor | Evidence |
|---|---|---|
| 0–17 | 0.70 | **Assumption — no market evidence** (no child quotes were collected) |
| 18–64 | 1.00 | Reference |
| 65–74 | **1.65** | Market evidence: Intermundial charges exactly ×1.65 at 68 |
| 75–85 | 2.20 | **Assumption — no market evidence** (no quotes above 68 were collected) |

## 4. Results: ours vs competitors (per adult unless stated)

| Trip (our day count) | Plan | Heymondo | IATI | Intermundial | Median | **Target** | **Ours** | Ours vs median |
|---|---|---|---|---|---|---|---|---|
| Italy (8 days) | Wild | 23.53 | 24.85 | 19.53 | 23.53 | 22 | **22.00** | −6.5% |
| Italy (8 days) | Wild+ | 30.50 | 34.18 | 30.22 | 30.50 | 29.50 | **29.50** | −3.3% |
| Thailand (15 days) | Wild | 64.00 | 65.61 | 56.71 | 64.00 | 60 | **60.21** | −5.9% |
| Thailand (15 days) | Wild+ | 88.02 | 90.87 | 79.99 | 88.02 | 85 | **85.39** | −3.0% |
| USA (11 days) | Wild | 57.00 | 57.65 | 69.21 | 57.65 | 57 | **57.00** | −1.1% |
| USA (11 days) | Wild+ | 79.48 | 83.67 | 83.26 | 83.26 | 80 | **80.00** | −3.9% |
| Mexico, adult 35 (11 days) | Wild | 57.00\* | 58.03\* | 52.59 | 57.00 | 55 | **55.00** | −3.5% |
| Mexico, adult 35 (11 days) | Wild+ | 82.42\* | 84.05\* | 72.85 | 82.42 | 78 | **78.00** | −5.4% |
| Mexico, senior 68 (11 days) | Wild | 57.00 | 58.03 | 86.77 | 58.03 | — | **90.75** | +56.4% (see §5.2) |
| Mexico, senior 68 (11 days) | Wild+ | 82.42 | 84.05 | 120.20 | 84.05 | — | **128.70** | +53.1% (see §5.2) |

\* Heymondo and IATI quotes were for a 68-year-old, but they don't price by age, so they equal their adult price.

All adult targets are now **below the median**, and all are met within ±5% (in fact within ±0.7%). This is checked automatically by `npm test`.

**Long trips (no market comparison available):**

| Zone | 14 days | 15 days | 30 days | 60 days | 90 days | Each day after 14 |
|---|---|---|---|---|---|---|
| Europe, Wild / Wild+ | 25.73 / 34.51 | 26.33 / 35.31 | 35.31 / 47.36 | 53.27 / 71.45 | 71.24 / 95.54 | ≈0.60 / ≈0.80 |
| Rest of world, Wild / Wild+ | 58.84 / 83.45 | 60.21 / 85.39 | 80.75 / 114.53 | 121.83 / 172.79 | 162.91 / 231.06 | ≈1.37 / ≈1.94 |
| USA/Can/Jap, Wild / Wild+ | 60.98 / 85.59 | 62.40 / 87.58 | 83.68 / 117.46 | 126.26 / 177.22 | 168.83 / 236.98 | ≈1.42 / ≈1.99 |

Before this change, a 90-day Rest-of-world Wild trip cost about €99; now it costs about €163.

## 5. Decisions, assumptions and open questions

1. **Inclusive day counting kept** (decision). 10–17 Dec = 8 days.
2. **Seniors: we price age risk instead of refusing seniors.** Heymondo and IATI quote the same price for a 68-year-old as for a 35-year-old, but they restrict which plans older travellers can buy (and may ask health questions later). We prefer to **accept travellers up to 85 on both plans and charge for the higher risk**, using Intermundial's ×1.65, the only age surcharge visible in the market. That makes us more expensive than the median for seniors (+53–56%), but we don't turn them away. Our 65–74 price is +4.6% (Wild) / +7.1% (Wild+) above Intermundial's.
3. **Long trips — ASSUMPTION WITHOUT MARKET DATA.** All quotes were for 8–15 day trips. From day 15, we stop the per-day discount: each extra day costs the average of what days 10–14 add. We read "the average daily rate of days 10–14" as *the average extra cost of days 10–14*. Under the other possible reading (the average price per day of a 10–14-day trip), a 90-day Rest-of-world Wild trip would cost about €419 instead of €163. **Collect real quotes for 30, 60 and 90 days to confirm.**
4. **No child (0–17) or 75+ data.** Those factors are assumptions.
5. **Adventure cover.** Adventure cover inspired by IATI Mochilero (60+ sports, diving to 40 m, trekking to 5,400 m, rescue 15,000 EUR); we set more conservative limits as a new product. **Wild+ covers** trekking up to 4,000 m, scuba diving up to 30 m, skiing/snowboarding on marked slopes, surf, rafting and canyoning, plus search & rescue up to 15,000 €. **Wild excludes adventure sports.** Professional sports and extreme activities (e.g. base jumping) are excluded in both plans. The adventure cover was **not priced separately**: the Wild+ targets already compare with IATI Mochilero, which includes it.
6. **Same-plan coverage not compared line by line.** Plans were matched by tier and general level, not by checking every limit (medical, baggage, cancellation, excess).
7. **Single snapshot.** Prices were collected on one day (28 Oct 2026) for December departures; seasonality and promotions are not captured.
