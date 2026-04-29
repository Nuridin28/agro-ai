// Пост-субсидийная проверка: после baselineDate прошло windowDays —
// есть ли на спутниках следы агроактивности?
//
// Логика 3-уровневая (чтобы не давать ложных one-shot фрод-обвинений):
//   - WATCH       — окно ещё открыто или мало точек: ждём ещё снимков.
//   - SUSPICIOUS  — за окно ΔNDVI < threshold по одному наблюдению.
//   - ALERT       — два подряд снимка после baseline подтверждают отсутствие
//                   активности (NDVI не превысил threshold).
//
// Используется в /api/satellite/cron еженедельно по всем активным субсидиям.

import type {
  InactivityCheckInput,
  InactivityCheckResult,
  NDVIPoint,
  SatelliteProvider,
} from "./types";
import { SAT_THRESHOLDS } from "./ndvi";

export const INACTIVITY_THRESHOLDS = {
  // Прирост NDVI, при котором считаем, что агроактивность была.
  MIN_DELTA_NDVI: 0.10,
  // Абсолютный NDVI, выше которого считаем, что вегетация состоялась
  // даже без явной дельты от baseline (поле могло быть зелёным изначально).
  MIN_RECENT_NDVI: 0.30,
  // Сколько дней ДО baselineDate тянем для baseline-снимка.
  BASELINE_LOOKBACK_DAYS: 14,
  // Минимум снимков в окне после baseline, ниже которого ставим WATCH.
  MIN_POINTS_IN_WINDOW: 2,
} as const;

function clouds(p: NDVIPoint): boolean {
  return p.cloudCoverPct > SAT_THRESHOLDS.MAX_CLOUD_PCT;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return isoDay(new Date(t));
}

export async function runInactivityCheck(
  provider: SatelliteProvider,
  input: InactivityCheckInput,
): Promise<InactivityCheckResult> {
  const baseline = input.baselineDate;
  const startDate = addDaysISO(baseline, -INACTIVITY_THRESHOLDS.BASELINE_LOOKBACK_DAYS);
  const endDate   = addDaysISO(baseline, input.windowDays);
  const today = isoDay(new Date());
  const checkedThrough = today < endDate ? today : endDate;

  const series = await provider.getNDVITimeseries(input.polygon, startDate, checkedThrough);
  const valid = series.points.filter((p) => !clouds(p));
  const reasons: string[] = [];
  const fetchedAt = new Date().toISOString();
  const trace = {
    window: { startDate, endDate },
    provider: series.providerId,
    fetchedAt,
  };

  if (valid.length === 0) {
    reasons.push("За окно проверки нет ясных снимков.");
    return {
      level: "WATCH",
      baselineDate: baseline,
      checkedThrough,
      baselineNDVI: null,
      recentNDVIMax: null,
      deltaNDVI: null,
      observationsInWindow: 0,
      cloudyDropped: series.droppedCloudy,
      reasons,
      ...trace,
    };
  }

  // Baseline = ближайший валидный снимок к baselineDate (в окне ±lookback).
  const baselineMs = new Date(`${baseline}T00:00:00Z`).getTime();
  let baselinePoint: NDVIPoint | null = null;
  let baselineDist = Infinity;
  for (const p of valid) {
    const dist = Math.abs(new Date(`${p.date}T00:00:00Z`).getTime() - baselineMs);
    if (dist < baselineDist) { baselineDist = dist; baselinePoint = p; }
  }

  // Точки после baseline.
  const after = valid.filter((p) => p.date >= baseline);
  const recentMax = after.length > 0
    ? after.reduce((m, p) => Math.max(m, p.ndvi), -Infinity)
    : null;
  const baselineNDVI = baselinePoint?.ndvi ?? null;
  const delta = (recentMax !== null && baselineNDVI !== null)
    ? +(recentMax - baselineNDVI).toFixed(3)
    : null;

  // Окно ещё не дозрело?
  if (today < endDate && after.length < INACTIVITY_THRESHOLDS.MIN_POINTS_IN_WINDOW) {
    reasons.push(`Окно ещё открыто: до ${endDate}, наблюдений после ${baseline} — ${after.length}.`);
    return {
      level: "WATCH",
      baselineDate: baseline,
      checkedThrough,
      baselineNDVI,
      recentNDVIMax: recentMax,
      deltaNDVI: delta,
      observationsInWindow: after.length,
      cloudyDropped: series.droppedCloudy,
      reasons,
      ...trace,
    };
  }

  // Активность подтверждена?
  const hasActivity = (
    (recentMax !== null && recentMax >= INACTIVITY_THRESHOLDS.MIN_RECENT_NDVI) ||
    (delta !== null && delta >= INACTIVITY_THRESHOLDS.MIN_DELTA_NDVI)
  );
  if (hasActivity) {
    reasons.push(`Агроактивность зафиксирована: NDVI max ${recentMax}, ΔNDVI ${delta}.`);
    return {
      level: "OK",
      baselineDate: baseline,
      checkedThrough,
      baselineNDVI,
      recentNDVIMax: recentMax,
      deltaNDVI: delta,
      observationsInWindow: after.length,
      cloudyDropped: series.droppedCloudy,
      reasons,
      ...trace,
    };
  }

  // Сколько снимков подряд после baseline остаются ниже порогов?
  let lowStreak = 0;
  for (const p of after) {
    const lowAbs = p.ndvi < INACTIVITY_THRESHOLDS.MIN_RECENT_NDVI;
    const lowDelta = baselineNDVI !== null
      ? (p.ndvi - baselineNDVI) < INACTIVITY_THRESHOLDS.MIN_DELTA_NDVI
      : true;
    if (lowAbs && lowDelta) lowStreak += 1; else lowStreak = 0;
  }

  if (lowStreak >= 2) {
    reasons.push(`Два и более снимка подряд после ${baseline} без признаков агроактивности (NDVI max ${recentMax}, ΔNDVI ${delta}).`);
    return {
      level: "ALERT",
      baselineDate: baseline,
      checkedThrough,
      baselineNDVI,
      recentNDVIMax: recentMax,
      deltaNDVI: delta,
      observationsInWindow: after.length,
      cloudyDropped: series.droppedCloudy,
      reasons,
      ...trace,
    };
  }

  reasons.push(`Один снимок без признаков агроактивности (NDVI max ${recentMax}). Нужно подтверждение следующего наблюдения.`);
  return {
    level: "SUSPICIOUS",
    baselineDate: baseline,
    checkedThrough,
    baselineNDVI,
    recentNDVIMax: recentMax,
    deltaNDVI: delta,
    observationsInWindow: after.length,
    cloudyDropped: series.droppedCloudy,
    reasons,
    ...trace,
  };
}
