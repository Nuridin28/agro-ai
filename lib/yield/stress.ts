// ────────────────────────────────────────────────────────────────────────────
// Ks — абиотический стресс (не вода): жара, заморозки, ветер, град, полегание.
//
// Формула: Ks = K_heat × K_frost × K_wind × K_hail × K_lodging
//
// Источники:
//   - Asseng et al. 2015 Nature Climate Change: 5–10% потери/день T>32°C
//     в фазу колошения. Берём 7%.
//   - Поршнев/Шиятый: классика степной агрономии — заморозок при цветении
//     срезает 30–50% урожая, при кущении 10–20%.
//   - Berry et al. 2003: полегание = 10–30% потери, обычно ~12%.
// ────────────────────────────────────────────────────────────────────────────

import type { YieldPredictionInput, KsResult } from "./types";
import { clamp } from "./types";

// Per-day штрафы за тепловой стресс в критические фазы.
const HEAT_PENALTY_PER_DAY_OVER_32 = 0.07;   // -7% за день T>32°C в колошение
const HEAT_PENALTY_PER_DAY_OVER_35 = 0.04;   // -4% за день T>35°C в налив
const HEAT_K_MIN = 0.50;                      // нижний cap

// Заморозок после 1 мая — критичен для яровых.
const FROST_PENALTY_PER_DAY = 0.15;
const FROST_K_MIN = 0.60;

// Ветер > 17 м/с — чёрные бури, потеря влаги + механическое повреждение.
const WIND_PENALTY_PER_DAY = 0.08;
const WIND_K_MIN = 0.70;

// Град: либо был, либо нет. При подтверждении NDVI-drop'ом.
const HAIL_K = 0.85;

// Полегание оценивается отдельно от Ks через NDVI-гетерогенность (см.
// детектор друга), здесь только консервативный нейтрал. Hook на интеграцию.
const LODGING_K_DEFAULT = 1.00;

export function computeKs(input: YieldPredictionInput): KsResult {
  const w = input.weather;
  const reasons: string[] = [];
  const byStressor: Array<{ stressor: string; k: number }> = [];

  // 1) Жара в колошение.
  const kHeatAnthesis = clamp(
    1 - w.daysTmaxOver32 * HEAT_PENALTY_PER_DAY_OVER_32,
    HEAT_K_MIN,
    1.0,
  );
  if (w.daysTmaxOver32 > 0) {
    reasons.push(`${w.daysTmaxOver32} дн. T>32°C в колошение → K_heat_anthesis = ${kHeatAnthesis.toFixed(2)}`);
  }
  byStressor.push({ stressor: "heat_anthesis", k: +kHeatAnthesis.toFixed(3) });

  // 2) Жара в налив.
  const kHeatGrainFill = clamp(
    1 - w.daysTmaxOver35 * HEAT_PENALTY_PER_DAY_OVER_35,
    HEAT_K_MIN,
    1.0,
  );
  if (w.daysTmaxOver35 > 0) {
    reasons.push(`${w.daysTmaxOver35} дн. T>35°C в налив → K_heat_grainfill = ${kHeatGrainFill.toFixed(2)}`);
  }
  byStressor.push({ stressor: "heat_grainfill", k: +kHeatGrainFill.toFixed(3) });

  // 3) Возвратные заморозки.
  const kFrost = clamp(
    1 - w.daysTminBelowMinus2AfterMay1 * FROST_PENALTY_PER_DAY,
    FROST_K_MIN,
    1.0,
  );
  if (w.daysTminBelowMinus2AfterMay1 > 0) {
    reasons.push(`${w.daysTminBelowMinus2AfterMay1} дн. T_min<−2°C после 1 мая → K_frost = ${kFrost.toFixed(2)}`);
  }
  byStressor.push({ stressor: "frost", k: +kFrost.toFixed(3) });

  // 4) Чёрные бури.
  const kWind = clamp(
    1 - w.daysWindOver17 * WIND_PENALTY_PER_DAY,
    WIND_K_MIN,
    1.0,
  );
  if (w.daysWindOver17 > 0) {
    reasons.push(`${w.daysWindOver17} дн. ветра >17 м/с (чёрные бури) → K_wind = ${kWind.toFixed(2)}`);
  }
  byStressor.push({ stressor: "wind", k: +kWind.toFixed(3) });

  // 5) Град.
  const kHail = w.hailReported ? HAIL_K : 1.0;
  if (w.hailReported) {
    reasons.push(`Град подтверждён → K_hail = ${HAIL_K}`);
  }
  byStressor.push({ stressor: "hail", k: kHail });

  // 6) Полегание — пока нейтрал, hook для NDVI-интеграции.
  byStressor.push({ stressor: "lodging", k: LODGING_K_DEFAULT });

  const ks = kHeatAnthesis * kHeatGrainFill * kFrost * kWind * kHail * LODGING_K_DEFAULT;

  if (reasons.length === 0) {
    reasons.push("Абиотических стрессов не зафиксировано");
  }

  // Confidence: high если есть подтверждённые экстремумы; medium если только
  // погодные триггеры из ERA5 без верификации.
  const confidence = byStressor.some((s) => s.k < 0.9) ? "medium" : "high";

  return {
    value: +ks.toFixed(3),
    confidence,
    sigmaRelative: 0.08,
    reasons,
    byStressor,
  };
}
