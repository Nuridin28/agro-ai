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
  // Всплеск VV за ≤ N дней для «вспашки/культивации» (дБ).
  TILLAGE_VV_RISE_DB: 2.0,
  TILLAGE_WINDOW_DAYS: 18,
  // Окно вспашки — конец марта – май (яровые) и сентябрь–октябрь (озимые).
  // Берём широкое: с марта по октябрь.
  TILLAGE_MONTH_MIN: 3,
  TILLAGE_MONTH_MAX: 10,
  // Поле «спит»: σ VH за сезон < этого порога (дБ).
  INACTIVITY_VH_STDEV_MAX_DB: 1.0,
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

export interface SAREventsResult {
  events: SAREvent[];
  // Сводка для UI и для verify-движка.
  summary: {
    pointsUsed: number;
    vhSeasonMedianDb: number | null;
    vhSeasonStdevDb: number | null;
    inactivity: boolean;
    // Главное событие уборки (наибольший confidence среди event.kind === "harvest").
    harvestEvent: SAREvent | null;
    // Все события вспашки (могут быть и весной, и осенью).
    tillageEvents: SAREvent[];
  };
}

export function detectSAREvents(series: SARTimeseries | null): SAREventsResult | null {
  if (!series || series.points.length < SAR_THRESHOLDS.MIN_POINTS) return null;
  const points = smooth(series.points);

  const vhVals = points.map((p) => p.vhDb);
  const vhMedian = median(vhVals);
  const vhStdev = stdev(vhVals);

  const events: SAREvent[] = [];

  // Поле спит — низкое std весь сезон. Это сильный сигнал, выдаём одним
  // событием на дату середины ряда.
  const inactivity = vhStdev < SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB;
  if (inactivity) {
    events.push({
      kind: "inactivity",
      date: points[Math.floor(points.length / 2)].date,
      confidence: Math.min(1, (SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB - vhStdev) / SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB),
      reason: `σ VH за сезон ${vhStdev.toFixed(2)} дБ < ${SAR_THRESHOLDS.INACTIVITY_VH_STDEV_MAX_DB} — биомасса не меняется`,
    });
  }

  // Уборка — резкое падение VH между двумя соседними точками в окне летн.-осен.,
  // плюс пост-событие должно быть ниже сезонной медианы.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const drop = a.vhDb - b.vhDb;
    if (drop < SAR_THRESHOLDS.HARVEST_VH_DROP_DB) continue;
    const m = monthOf(b.date);
    if (m < SAR_THRESHOLDS.HARVEST_MONTH_MIN || m > SAR_THRESHOLDS.HARVEST_MONTH_MAX) continue;
    if (SAR_THRESHOLDS.HARVEST_VH_BELOW_MEDIAN && b.vhDb >= vhMedian) continue;
    events.push({
      kind: "harvest",
      date: b.date,
      confidence: Math.min(1, drop / (SAR_THRESHOLDS.HARVEST_VH_DROP_DB * 1.5)),
      reason: `ΔVH = -${drop.toFixed(1)} дБ за ${daysBetween(a.date, b.date)} дн.; после события VH=${b.vhDb.toFixed(1)} < сезонной медианы ${vhMedian.toFixed(1)}`,
    });
  }

  // Вспашка — всплеск VV в окне ≤ 18 дней без последующего зелёного цикла.
  // Здесь без NDVI мы не можем гарантировать «без зелёнки», но в окне
  // начала сезона / после уборки всплеск VV почти всегда = механическое
  // вмешательство.
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

  // Главное событие уборки — берём с наибольшим confidence.
  const harvestEvent = events
    .filter((e) => e.kind === "harvest")
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  const tillageEvents = events.filter((e) => e.kind === "tillage");

  return {
    events,
    summary: {
      pointsUsed: points.length,
      vhSeasonMedianDb: +vhMedian.toFixed(2),
      vhSeasonStdevDb: +vhStdev.toFixed(2),
      inactivity,
      harvestEvent,
      tillageEvents,
    },
  };
}
