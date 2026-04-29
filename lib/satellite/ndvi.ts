// Извлечение признаков из временного ряда NDVI и применение правил ТЗ.
//
// Все пороги вынесены в SAT_THRESHOLDS — их можно тюнинговать под
// культуру/регион не трогая остальной код.

import type {
  NDVITimeseries,
  NDVIPoint,
  NDVIFeatures,
  SatelliteVerification,
  VegetationLevel,
  RiskFlag,
  SatelliteStatus,
} from "./types";

export const SAT_THRESHOLDS = {
  // NDVI выше которого мы считаем, что вегетация присутствует.
  VEGETATION_PRESENT_NDVI: 0.30,
  // Порог старта вегетации — точка ряда, после которой мы фиксируем рост.
  GROWTH_START_NDVI: 0.25,
  // Сколько подряд точек роста нужно увидеть, чтобы признать start_growth.
  GROWTH_CONFIRM_POINTS: 2,
  // Облачность, выше которой точку отбрасываем при расчёте признаков.
  MAX_CLOUD_PCT: 70,
  // Минимум валидных точек, чтобы считать результат осмысленным.
  MIN_POINTS_FOR_FEATURES: 4,
  // Уровни растительности по NDVI max
  VEG_WEAK_MAX: 0.30,
  VEG_MEDIUM_MAX: 0.55,
  VEG_STRONG_MIN: 0.70,
  // Поздний посев — насколько growthStartDate может опаздывать от ожидаемой
  // даты, прежде чем мы поднимем флаг (в днях). Берём 30 дн. — это поглощает
  // обычное «запаздывание детекции» из-за облачности и шага 5 дней Sentinel-2:
  // меньший порог даёт ложные срабатывания.
  LATE_GROWTH_DAYS: 30,
  // Пространственная гетерогенность поля: средняя σ NDVI выше — поле
  // мозаичное (частичный посев / заброшенные участки).
  HETEROGENEITY_HIGH_STDEV: 0.16,
  // Скорость прироста NDVI/день в фазе зелёной массы. Для пшеницы пик
  // ~0.020/день; ниже 0.008 — слабая отдача от удобрений.
  GROWTH_RATE_LOW: 0.008,
  // YoY: падение пика NDVI на >0.20 vs. прошлый год без объяснения метео.
  YOY_NDVI_DROP: 0.20,
} as const;

function validPoints(series: NDVITimeseries): NDVIPoint[] {
  return series.points.filter((p) => p.cloudCoverPct <= SAT_THRESHOLDS.MAX_CLOUD_PCT);
}

export function computeFeatures(series: NDVITimeseries): NDVIFeatures | null {
  const valid = validPoints(series);
  const droppedNoise = series.points.length - valid.length;
  const dropped = series.droppedCloudy + Math.max(0, droppedNoise - series.droppedCloudy);
  if (valid.length < SAT_THRESHOLDS.MIN_POINTS_FOR_FEATURES) return null;

  let sum = 0, max = -Infinity, min = Infinity;
  let peakDate: string | null = null;
  let peakIdx = -1;
  for (let i = 0; i < valid.length; i++) {
    const p = valid[i];
    sum += p.ndvi;
    if (p.ndvi > max) { max = p.ndvi; peakDate = p.date; peakIdx = i; }
    if (p.ndvi < min) min = p.ndvi;
  }
  const mean = sum / valid.length;

  // Старт роста: первая точка где NDVI >= GROWTH_START_NDVI и следующие
  // GROWTH_CONFIRM_POINTS точек не падают ниже этого порога.
  let growthStartDate: string | null = null;
  let growthStartIdx = -1;
  for (let i = 0; i < valid.length; i++) {
    if (valid[i].ndvi < SAT_THRESHOLDS.GROWTH_START_NDVI) continue;
    let confirmed = true;
    for (let k = 1; k <= SAT_THRESHOLDS.GROWTH_CONFIRM_POINTS; k++) {
      const next = valid[i + k];
      if (!next) { confirmed = false; break; }
      if (next.ndvi < SAT_THRESHOLDS.GROWTH_START_NDVI - 0.05) { confirmed = false; break; }
    }
    if (confirmed) { growthStartDate = valid[i].date; growthStartIdx = i; break; }
  }

  // Пространственная гетерогенность: усреднённая σ NDVI внутри поля по
  // валидным точкам. Если провайдер не отдаёт stDev (mock или старый ответ)
  // — оставляем null.
  const stdevs = valid.map((p) => p.stDev).filter((x): x is number => typeof x === "number");
  const heterogeneityStdev = stdevs.length >= SAT_THRESHOLDS.MIN_POINTS_FOR_FEATURES
    ? +(stdevs.reduce((s, x) => s + x, 0) / stdevs.length).toFixed(3)
    : null;

  // Скорость прироста NDVI/день: считаем максимальный наклон между двумя
  // соседними точками между growthStart и peak. Это устойчивее к шуму, чем
  // средний наклон.
  let growthRateNdviPerDay: number | null = null;
  if (growthStartIdx >= 0 && peakIdx > growthStartIdx) {
    let bestRate = 0;
    for (let i = growthStartIdx; i < peakIdx; i++) {
      const a = valid[i], b = valid[i + 1];
      const days = daysBetween(a.date, b.date);
      if (days <= 0) continue;
      const rate = (b.ndvi - a.ndvi) / days;
      if (rate > bestRate) bestRate = rate;
    }
    growthRateNdviPerDay = +bestRate.toFixed(4);
  }

  // Дни до пика: growth start → peak.
  let daysToPeak: number | null = null;
  if (growthStartDate && peakDate) {
    daysToPeak = daysBetween(growthStartDate, peakDate);
  }

  // Длина сезона: от growth start до точки, в которой NDVI после пика
  // снова падает ниже GROWTH_START_NDVI - 0.05.
  let seasonLengthDays: number | null = null;
  if (growthStartDate && peakIdx >= 0) {
    let endDate: string | null = null;
    for (let i = peakIdx + 1; i < valid.length; i++) {
      if (valid[i].ndvi < SAT_THRESHOLDS.GROWTH_START_NDVI - 0.05) { endDate = valid[i].date; break; }
    }
    if (endDate) seasonLengthDays = daysBetween(growthStartDate, endDate);
  }

  return {
    ndviMean: +mean.toFixed(3),
    ndviMax: +max.toFixed(3),
    ndviMin: +min.toFixed(3),
    growthStartDate,
    peakDate,
    vegetationPresent: max >= SAT_THRESHOLDS.VEGETATION_PRESENT_NDVI,
    pointsUsed: valid.length,
    pointsDropped: dropped,
    heterogeneityStdev,
    growthRateNdviPerDay,
    daysToPeak,
    seasonLengthDays,
  };
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

function vegetationLevel(ndviMax: number): VegetationLevel {
  if (ndviMax < SAT_THRESHOLDS.VEG_WEAK_MAX) return "none";
  if (ndviMax < SAT_THRESHOLDS.VEG_MEDIUM_MAX) return "weak";
  if (ndviMax < SAT_THRESHOLDS.VEG_STRONG_MIN) return "medium";
  return "strong";
}

export interface VerifyOptions {
  // Если задано — сравниваем growthStartDate с этой датой и считаем «поздний посев».
  expectedSowingDate?: string;
}

export function verifyFromTimeseries(
  series: NDVITimeseries,
  opts: VerifyOptions = {},
): SatelliteVerification {
  const fetchedAt = new Date().toISOString();
  const features = computeFeatures(series);
  const reasons: string[] = [];

  let status: SatelliteStatus = "OK";
  if (!features) {
    status = "INSUFFICIENT_DATA";
    reasons.push(`Недостаточно валидных снимков (отброшено по облачности — ${series.droppedCloudy}). Нужно ≥${SAT_THRESHOLDS.MIN_POINTS_FOR_FEATURES} ясных наблюдений.`);
    return {
      status,
      sowingDetected: false,
      growthStartDate: null,
      vegetationLevel: "none",
      riskFlag: "MEDIUM",
      features: null,
      reasons,
      window: { startDate: series.startDate, endDate: series.endDate },
      provider: series.providerId,
      fetchedAt,
      source: agrodataSourceRef(series, fetchedAt),
    };
  }

  const sowingDetected = features.vegetationPresent && features.growthStartDate !== null;
  const level = vegetationLevel(features.ndviMax);

  // Правила ТЗ §4
  let riskFlag: RiskFlag = "LOW";
  if (!features.vegetationPresent) {
    reasons.push(`Посев не обнаружен: NDVI max ${features.ndviMax} < ${SAT_THRESHOLDS.VEGETATION_PRESENT_NDVI}.`);
    riskFlag = "HIGH";
  } else if (features.ndviMax < SAT_THRESHOLDS.VEG_WEAK_MAX + 0.02) {
    reasons.push(`Слабая вегетация: NDVI max ${features.ndviMax} ниже норматива зерновых.`);
    riskFlag = bumpRisk(riskFlag, "MEDIUM");
  }

  if (opts.expectedSowingDate && features.growthStartDate) {
    const expected = new Date(opts.expectedSowingDate).getTime();
    const actual = new Date(features.growthStartDate).getTime();
    const diffDays = Math.round((actual - expected) / 86_400_000);
    if (diffDays > SAT_THRESHOLDS.LATE_GROWTH_DAYS) {
      reasons.push(`Поздний посев: вегетация стартовала ${features.growthStartDate}, заявлена ${opts.expectedSowingDate} (опоздание ${diffDays} дн.).`);
      riskFlag = bumpRisk(riskFlag, "MEDIUM");
    }
  }

  return {
    status: "OK",
    sowingDetected,
    growthStartDate: features.growthStartDate,
    vegetationLevel: level,
    riskFlag,
    features,
    reasons,
    window: { startDate: series.startDate, endDate: series.endDate },
    provider: series.providerId,
    fetchedAt,
    source: agrodataSourceRef(series, fetchedAt),
  };
}

function bumpRisk(cur: RiskFlag, next: RiskFlag): RiskFlag {
  const order: RiskFlag[] = ["LOW", "MEDIUM", "HIGH"];
  return order.indexOf(next) > order.indexOf(cur) ? next : cur;
}

import type { SourceRef } from "../sources";
function agrodataSourceRef(series: NDVITimeseries, fetchedAt: string): SourceRef {
  return {
    source: "AGRODATA",
    docId: `NDVI-${series.providerId}-${series.startDate}_${series.endDate}`,
    fetchedAt,
    note: `Sentinel-2 NDVI · ${series.points.length} наблюдений (${series.droppedCloudy} облачных)`,
  };
}
