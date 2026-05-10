// Детектор агрономических событий из временного ряда Sentinel-1 backscatter.
//
// Из чего считаем события:
//  - VH (cross-pol) хорошо отслеживает биомассу: высокий = зелёное поле,
//    низкий = голая земля. Резкое падение VH → уборка.
//  - VV (co-pol) чувствителен к шероховатости поверхности: всплеск VV без
//    зелёнки → вспашка/культивация.
//  - Низкое std(VH) весь сезон → поле спит, ничего не происходит.
//
// Пороги подобраны под северный Казахстан (яровые); потребуют тюнинга на
// реальных полях с разметкой инспектора (см. план «фаза 0 — backtesting»).

import type { SARTimeseries, SAREvent, SARPoint } from "./types";

export const SAR_THRESHOLDS = {
  // Минимум валидных точек для надёжной детекции (≥ 5 точек ≈ месяц данных).
  MIN_POINTS: 5,
  // Падение VH между двумя соседними точками для срабатывания «уборки» (дБ).
  HARVEST_VH_DROP_DB: 3.5,
  // VH после события должен быть ниже сезонной медианы — иначе это локальный
  // дип, а не уборка.
  HARVEST_VH_BELOW_MEDIAN: true,
  // Окно правдоподобия уборки по месяцам (1..12). Для KZ — июль–октябрь.
  HARVEST_MONTH_MIN: 7,
  HARVEST_MONTH_MAX: 10,
  // Минимальный confidence (0..1), чтобы событие уборки попало в список
  // (фильтрация шума, особенно для многоукосных полей).
  HARVEST_MIN_CONFIDENCE: 0.4,
  // Всплеск VV за ≤ N дней для «вспашки/культивации» (дБ).
  TILLAGE_VV_RISE_DB: 2.0,
  TILLAGE_WINDOW_DAYS: 18,
  // Окно вспашки — конец марта – май (яровые) и сентябрь–октябрь (озимые).
  // Берём широкое: с марта по октябрь.
  TILLAGE_MONTH_MIN: 3,
  TILLAGE_MONTH_MAX: 10,
  // Поле «спит»: σ VH за сезон < этого порога (дБ).
  INACTIVITY_VH_STDEV_MAX_DB: 1.0,
  // Посев в SAR: рост VH над сезонным минимумом + удержание выше порога.
  // Используем относительный порог, т.к. абсолютные дБ зависят от культуры
  // и угла наблюдения.
  SOWING_VH_RISE_DB: 2.0,             // VH должен подняться > min(VH) + этого
  SOWING_HOLD_POINTS: 2,               // и удержаться над порогом столько точек
  SOWING_MONTH_MIN: 4,                 // апрель
  SOWING_MONTH_MAX: 6,                 // июнь
  // Малое поле — < N пикселей в усреднении → speckle забивает сигнал.
  SMALL_FIELD_MIN_PIXELS: 50,
  // Дожди как источник ложных уборок: суммарные осадки в окне ±3 дня выше
  // этого значения (мм) → событие помечается как «возможный дождь».
  RAIN_EVENT_FILTER_MM: 8,
  RAIN_FILTER_WINDOW_DAYS: 3,
} as const;

function median(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

// Сглаживание медианой по окну 3 точек — убирает speckle, сохраняет фронты.
function smooth(points: SARPoint[]): SARPoint[] {
  if (points.length < 3) return points;
  const out: SARPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const c = points[i];
    const b = points[Math.min(points.length - 1, i + 1)];
    const vv = median([a.vvDb, c.vvDb, b.vvDb]);
    const vh = median([a.vhDb, c.vhDb, b.vhDb]);
    out.push({ ...c, vvDb: +vv.toFixed(2), vhDb: +vh.toFixed(2) });
  }
  return out;
}

// Лёгкий ряд осадков для rain-фильтра. Используется только для подавления
// «уборок», которые на самом деле — дождевой дип VH.
export interface PrecipPoint { date: string; mm: number }

export interface SAREventsResult {
  events: SAREvent[];
  // Сводка для UI и для verify-движка.
  summary: {
    pointsUsed: number;
    vhSeasonMedianDb: number | null;
    vhSeasonStdevDb: number | null;
    inactivity: boolean;
    smallField: boolean;       // < SMALL_FIELD_MIN_PIXELS — низкое доверие сигналу
    // Все события уборки (могут быть и сено, и зерно — для многоукосных полей).
    harvestEvents: SAREvent[];
    // Главное событие (наибольший confidence) — для финдингов где нужна одна дата.
    harvestEvent: SAREvent | null;
    // Все события вспашки (могут быть и весной, и осенью).
    tillageEvents: SAREvent[];
    // Событие посева (наиболее уверенный кандидат).
    sowingEvent: SAREvent | null;
  };
}

export interface DetectOptions {
  // Опциональный ряд осадков (например, из Open-Meteo) — даты должны быть в
  // том же сезоне. Если задан, harvest-события рядом с дождём помечаются как
  // ненадёжные (confidence × 0.4 или ниже).
  precipitation?: PrecipPoint[];
}

// Сумма осадков в окне ±N дней вокруг даты события.
function rainSumNear(precip: PrecipPoint[], date: string, windowDays: number): number {
  const t = new Date(`${date}T00:00:00Z`).getTime();
  let sum = 0;
  for (const p of precip) {
    const dt = new Date(`${p.date}T00:00:00Z`).getTime();
    if (Math.abs(dt - t) <= windowDays * 86_400_000) sum += p.mm;
  }
  return sum;
}

export function detectSAREvents(series: SARTimeseries | null, opts: DetectOptions = {}): SAREventsResult | null {
  if (!series || series.points.length < SAR_THRESHOLDS.MIN_POINTS) return null;
  const points = smooth(series.points);

  const vhVals = points.map((p) => p.vhDb);
  const vhMedian = median(vhVals);
  const vhStdev = stdev(vhVals);
  const vhMin = Math.min(...vhVals);
  // Среднее число пикселей в усреднении: малое поле → SAR неустойчив.
  const avgPixels = points.reduce((s, p) => s + p.sampleCount, 0) / points.length;
  const smallField = avgPixels < SAR_THRESHOLDS.SMALL_FIELD_MIN_PIXELS;

  const events: SAREvent[] = [];

  // ──────────── inactivity ────────────
  const inactivity = vhStdev < SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB;
  if (inactivity) {
    events.push({
      kind: "inactivity",
      date: points[Math.floor(points.length / 2)].date,
      confidence: Math.min(1, (SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB - vhStdev) / SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB),
      reason: `σ VH за сезон ${vhStdev.toFixed(2)} дБ < ${SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB} — биомасса не меняется`,
    });
  }

  // ──────────── harvest (все события, не только top-1) ────────────
  const rainFilter = opts.precipitation && opts.precipitation.length > 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const drop = a.vhDb - b.vhDb;
    if (drop < SAR_THRESHOLDS.HARVEST_VH_DROP_DB) continue;
    const m = monthOf(b.date);
    if (m < SAR_THRESHOLDS.HARVEST_MONTH_MIN || m > SAR_THRESHOLDS.HARVEST_MONTH_MAX) continue;
    // Гейт «после события VH ниже сезонной медианы» — с допуском 0.5 дБ,
    // чтобы поля где median проходит ровно через post-harvest уровень
    // (типичная картина для зерновых) не отбрасывались строго.
    if (SAR_THRESHOLDS.HARVEST_VH_BELOW_MEDIAN && b.vhDb > vhMedian + 0.5) continue;

    let confidence = Math.min(1, drop / (SAR_THRESHOLDS.HARVEST_VH_DROP_DB * 1.5));
    let reason = `ΔVH = -${drop.toFixed(1)} дБ за ${daysBetween(a.date, b.date)} дн.; после события VH=${b.vhDb.toFixed(1)} < медианы ${vhMedian.toFixed(1)}`;

    // Rain filter: если рядом был сильный дождь — это, скорее всего, изменение
    // влажности поверхности, а не уборка. Сильно режем confidence и помечаем.
    if (rainFilter) {
      const rainMm = rainSumNear(opts.precipitation!, b.date, SAR_THRESHOLDS.RAIN_FILTER_WINDOW_DAYS);
      if (rainMm > SAR_THRESHOLDS.RAIN_EVENT_FILTER_MM) {
        confidence *= 0.3;
        reason += `. ⚠️ В окне ±${SAR_THRESHOLDS.RAIN_FILTER_WINDOW_DAYS}д выпало ${rainMm.toFixed(0)} мм осадков — возможно дождевой дип, а не уборка`;
      }
    }

    if (confidence < SAR_THRESHOLDS.HARVEST_MIN_CONFIDENCE) continue;
    events.push({ kind: "harvest", date: b.date, confidence, reason });
  }

  // ──────────── tillage ────────────
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const rise = b.vvDb - a.vvDb;
    if (rise < SAR_THRESHOLDS.TILLAGE_VV_RISE_DB) continue;
    const dDays = daysBetween(a.date, b.date);
    if (dDays > SAR_THRESHOLDS.TILLAGE_WINDOW_DAYS) continue;
    const m = monthOf(b.date);
    if (m < SAR_THRESHOLDS.TILLAGE_MONTH_MIN || m > SAR_THRESHOLDS.TILLAGE_MONTH_MAX) continue;
    events.push({
      kind: "tillage",
      date: b.date,
      confidence: Math.min(1, rise / (SAR_THRESHOLDS.TILLAGE_VV_RISE_DB * 2)),
      reason: `ΔVV = +${rise.toFixed(1)} дБ за ${dDays} дн. — рост шероховатости поверхности`,
    });
  }

  // ──────────── sowing ────────────
  // Первая точка в окне апрель-июнь, в которой VH > min(VH) + 2dB и следующие
  // SOWING_HOLD_POINTS точек тоже над этим порогом (стабильный набор биомассы).
  let sowingEvent: SAREvent | null = null;
  const sowingThreshold = vhMin + SAR_THRESHOLDS.SOWING_VH_RISE_DB;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.vhDb < sowingThreshold) continue;
    const m = monthOf(p.date);
    if (m < SAR_THRESHOLDS.SOWING_MONTH_MIN || m > SAR_THRESHOLDS.SOWING_MONTH_MAX) continue;
    let held = 0;
    for (let k = 1; k <= SAR_THRESHOLDS.SOWING_HOLD_POINTS; k++) {
      const nxt = points[i + k];
      if (!nxt) break;
      if (nxt.vhDb >= sowingThreshold) held++;
      else break;
    }
    if (held >= SAR_THRESHOLDS.SOWING_HOLD_POINTS) {
      sowingEvent = {
        kind: "sowing",
        date: p.date,
        confidence: Math.min(1, (p.vhDb - vhMin) / (SAR_THRESHOLDS.SOWING_VH_RISE_DB * 2)),
        reason: `VH ${p.vhDb.toFixed(1)} дБ поднялся выше сезонного min ${vhMin.toFixed(1)}+${SAR_THRESHOLDS.SOWING_VH_RISE_DB}, удержался ${held} точки`,
      };
      events.push(sowingEvent);
      break;
    }
  }

  // Сортированный список уборок (от высокого confidence к низкому).
  const harvestEvents = events
    .filter((e) => e.kind === "harvest")
    .sort((a, b) => b.confidence - a.confidence);
  const harvestEvent = harvestEvents[0] ?? null;
  const tillageEvents = events.filter((e) => e.kind === "tillage");

  return {
    events,
    summary: {
      pointsUsed: points.length,
      vhSeasonMedianDb: +vhMedian.toFixed(2),
      vhSeasonStdevDb: +vhStdev.toFixed(2),
      inactivity,
      smallField,
      harvestEvents,
      harvestEvent,
      tillageEvents,
      sowingEvent,
    },
  };
}
