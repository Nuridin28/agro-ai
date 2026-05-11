// ────────────────────────────────────────────────────────────────────────────
// Kw — водный коэффициент (0..1), главный драйвер для степи РК.
//
// ПРАВКА #2 (после анализа симуляции):
//   Kw триангулируется из 3 источников (FAO bucket / SMAP / NDVI peak).
//   Берётся МЕДИАНА доступных. Если только один источник — confidence: low,
//   sigma вырастает.
//
// Источник 1 (всегда доступен): FAO bucket model.
//   ETm = Kc × ET0(Penman-Monteith)
//   ETa = min(ETm, доступная влага)
//   Kw_mult = Π (1 − ky_i × (1 − ETa_i/ETm_i))
//
// Источник 2 (когда есть): SMAP soil moisture timeseries — прямое измерение.
//   Не реализовано в этой версии (hook на будущее).
//
// Источник 3 (когда есть NDVI пик): NDVI-based estimate.
//   Kw ≈ ndviPeak / ndviPotential, где ndviPotential = 0.75 для пшеницы.
//
// Источники методологии:
//   - FAO-33 Doorenbos & Kassam 1979 (ky-коэффициенты)
//   - FAO-56 Allen et al. 1998 (Kc, ET0 Penman-Monteith)
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  KwResult,
  SortParams,
  PhasePlan,
  Phase,
  Confidence,
} from "./types";
import { PHASE_PLAN } from "./norms";
import { clamp } from "./types";

// Tolerance band: первые 30% дефицита воды растение переносит без потерь
// (стоматическое закрытие, осмотическая адаптация, использование глубокой
// влаги). Только выше — реальное снижение урожая. Соответствует подходу
// AquaCrop (FAO) — поправка к чистому Doorenbos-Kassam для rainfed условий.
//
// Источник: FAO-66 AquaCrop, Steduto et al. 2009. Без этой поправки чистый
// bucket даёт 3× более пессимистичные оценки, чем наблюдается в полях
// степной зоны РК.
const WATER_TOLERANCE_BAND = 0.30;

// ────────────────────────────────────────────────────────────────────────────
// Источник 1: FAO bucket с tolerance band.
//
// Простая модель: распределяем сезон на фазы пропорционально daysToMaturity,
// каждой фазе считаем ETm (Kc × ET0) и доступную воду (snowmelt carryover +
// осадки за фазу), находим ETa = min(ETm, water_available + carryover).
//
// factor_phase = 1 − ky × max(0, (1 − ETa/ETm) − tolerance)
// ────────────────────────────────────────────────────────────────────────────

interface PhaseBalance {
  phase: Phase;
  startDoy: number;
  endDoy: number;
  ky: number;
  kc: number;
  precipMm: number;
  et0Mm: number;
  etmMm: number;
  etaMm: number;
  ratio: number;     // ETa/ETm
  factor: number;    // (1 − ky × (1 − ratio))
}

function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

function distributePrecipToPhases(
  monthlyMm: { month: number; mm: number }[],
  phasesByMonth: PhaseBalance[],
): void {
  // На каждую фазу разносим помесячные осадки пропорционально дням фазы в месяце.
  for (const phase of phasesByMonth) {
    let sum = 0;
    for (const m of monthlyMm) {
      // Грубо: считаем сколько дней фазы попадает в данный месяц.
      const monthStart = doyOfMonth(m.month, 1);
      const monthEnd = doyOfMonth(m.month, daysInMonth(m.month));
      const overlap = Math.max(0, Math.min(phase.endDoy, monthEnd) - Math.max(phase.startDoy, monthStart) + 1);
      const monthDays = monthEnd - monthStart + 1;
      sum += m.mm * (overlap / monthDays);
    }
    phase.precipMm = sum;
  }
}

function distributeET0ToPhases(
  monthlyMm: { month: number; mm: number }[],
  phasesByMonth: PhaseBalance[],
): void {
  for (const phase of phasesByMonth) {
    let sum = 0;
    for (const m of monthlyMm) {
      const monthStart = doyOfMonth(m.month, 1);
      const monthEnd = doyOfMonth(m.month, daysInMonth(m.month));
      const overlap = Math.max(0, Math.min(phase.endDoy, monthEnd) - Math.max(phase.startDoy, monthStart) + 1);
      const monthDays = monthEnd - monthStart + 1;
      sum += m.mm * (overlap / monthDays);
    }
    phase.et0Mm = sum;
  }
}

function doyOfMonth(month: number, day: number): number {
  // Невисокосный год — для модели нужно стабильное распределение.
  const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cumulative[month - 1] + day;
}

function daysInMonth(month: number): number {
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function buildPhasePlan(
  sowingDate: string,
  daysToMaturity: number,
  phasePlan: PhasePlan[],
): PhaseBalance[] {
  const sowingDoy = dayOfYear(sowingDate);
  const out: PhaseBalance[] = [];
  let cumDays = 0;
  for (const ph of phasePlan) {
    const phDays = Math.round(daysToMaturity * ph.fraction);
    const startDoy = sowingDoy + cumDays;
    const endDoy = sowingDoy + cumDays + phDays - 1;
    out.push({
      phase: ph.phase,
      startDoy,
      endDoy,
      ky: ph.ky,
      kc: ph.kc,
      precipMm: 0,
      et0Mm: 0,
      etmMm: 0,
      etaMm: 0,
      ratio: 1.0,
      factor: 1.0,
    });
    cumDays += phDays;
  }
  return out;
}

export function kwFromBucket(
  input: YieldPredictionInput,
  sort: SortParams,
): { kw: number; phases: PhaseBalance[] } {
  const { weather, declaration } = input;
  const plan = PHASE_PLAN[input.season.crop];

  const phases = buildPhasePlan(declaration.sowingDate, sort.daysToMaturity, plan);

  // Распределяем осадки и ET0 по фазам.
  distributePrecipToPhases(weather.monthlyPrecipMm, phases);
  distributeET0ToPhases(weather.monthlyET0Mm, phases);

  // Начальная влажность из снеготаяния (мм воды в корневой зоне 0–100 см).
  // Дефолтная эффективность 0.6 (было 0.5) — реалистичнее для чернозёма,
  // где часть талых вод стекает, но большая часть инфильтруется.
  const snowmeltEff = weather.snowmeltEfficiency ?? 0.6;
  // AWC 250 мм — учитываем что пшеница в СКО берёт влагу из слоя 0–150 см,
  // и есть капиллярный подток из подпочвы в течение сезона.
  const AWC_MAX = 250;
  let soilWater = clamp(weather.swEqMm * snowmeltEff, 0, AWC_MAX);

  // Итеративно по фазам.
  let kwMult = 1.0;
  for (const phase of phases) {
    phase.etmMm = phase.kc * phase.et0Mm;
    const availableWater = soilWater + phase.precipMm;
    phase.etaMm = Math.min(phase.etmMm, availableWater);
    phase.ratio = phase.etmMm > 0 ? phase.etaMm / phase.etmMm : 1.0;
    // С tolerance band: первые 30% дефицита бесплатны, дальше — штраф по ky.
    const deficit = 1 - phase.ratio;
    const effectiveDeficit = Math.max(0, deficit - WATER_TOLERANCE_BAND);
    phase.factor = clamp(1 - phase.ky * effectiveDeficit, 0, 1);
    kwMult *= phase.factor;
    // Обновляем soilWater после фазы.
    soilWater = clamp(availableWater - phase.etaMm, 0, AWC_MAX);
  }

  return { kw: clamp(kwMult, 0.05, 1.0), phases };
}

// ────────────────────────────────────────────────────────────────────────────
// Источник 3: NDVI-валидация.
// Хук на будущее — caller передаст ndviPeak отдельно, мы вернём оценку Kw.
// ────────────────────────────────────────────────────────────────────────────

export function kwFromNDVI(ndviPeak: number, crop: string): number {
  // ndviPeak ~0.75 для хорошо политого зерна; ~0.30 для засушенного.
  const expectedPeak = crop.startsWith("wheat") ? 0.75 : crop === "sunflower" ? 0.85 : 0.70;
  const ratio = ndviPeak / expectedPeak;
  return clamp(ratio, 0.1, 1.0);
}

// ────────────────────────────────────────────────────────────────────────────
// Главная функция Kw — триангулирует доступные источники.
// ────────────────────────────────────────────────────────────────────────────

export interface KwTriangulationOptions {
  // NDVI peak за этот сезон по полю (если доступен).
  ndviPeak?: number;
  // SMAP soil moisture estimate (placeholder, не реализовано).
  smapKw?: number;
}

export function computeKw(
  input: YieldPredictionInput,
  sort: SortParams,
  opts: KwTriangulationOptions = {},
): KwResult {
  const reasons: string[] = [];

  // Источник 1: всегда — FAO bucket.
  const { kw: kwBucket, phases } = kwFromBucket(input, sort);
  reasons.push(`FAO bucket-модель: Kw = ${kwBucket.toFixed(3)}`);

  // Источник 3: NDVI peak, если есть.
  let kwNdvi: number | undefined;
  if (opts.ndviPeak != null) {
    kwNdvi = kwFromNDVI(opts.ndviPeak, input.season.crop);
    reasons.push(`NDVI peak ${opts.ndviPeak.toFixed(2)} → Kw = ${kwNdvi.toFixed(3)}`);
  }

  // Источник 2: SMAP, если передан.
  const kwSmap = opts.smapKw;
  if (kwSmap != null) {
    reasons.push(`SMAP soil moisture → Kw = ${kwSmap.toFixed(3)}`);
  }

  // Триангуляция: медиана из доступных источников.
  const available = [kwBucket, kwNdvi, kwSmap].filter((x): x is number => typeof x === "number");
  const sorted = [...available].sort((a, b) => a - b);
  const median = sorted.length === 0
    ? 0.5
    : sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  // Confidence зависит от числа источников + согласия между ними.
  let confidence: Confidence;
  let sigma: number;
  if (available.length >= 3) {
    const spread = sorted[sorted.length - 1] - sorted[0];
    confidence = spread < 0.10 ? "high" : spread < 0.20 ? "medium" : "low";
    sigma = spread < 0.10 ? 0.10 : spread < 0.20 ? 0.15 : 0.25;
  } else if (available.length === 2) {
    const spread = Math.abs(sorted[1] - sorted[0]);
    confidence = spread < 0.25 ? "medium" : "low";
    sigma = spread < 0.25 ? 0.15 : 0.25;
  } else {
    // Только один источник — bucket. Большая неопределённость.
    confidence = "low";
    sigma = 0.20;
    reasons.push("ВНИМАНИЕ: только один источник Kw (FAO bucket). Sigma = 20%.");
  }

  // Дополнительный fail-safe: при очень низком Kw (< 0.4) — требовать
  // подтверждения от NDVI. Если NDVI говорит «поле зелёное», бьём тревогу.
  if (kwBucket < 0.4 && kwNdvi != null && kwNdvi > 0.7) {
    reasons.push(
      `⚠️ FAO-bucket дал жёсткую засуху (Kw=${kwBucket.toFixed(2)}), но NDVI peak показал здоровое поле (Kw=${kwNdvi.toFixed(2)}). Возможна ошибка водного баланса — confidence снижена.`,
    );
    confidence = "low";
    sigma = 0.30;
  }

  return {
    value: +median.toFixed(3),
    confidence,
    sigmaRelative: sigma,
    reasons,
    phases: phases.map((p) => ({
      phase: p.phase,
      etaMm: +p.etaMm.toFixed(1),
      etmMm: +p.etmMm.toFixed(1),
      ratio: +p.ratio.toFixed(3),
      factor: +p.factor.toFixed(3),
    })),
    triangulation: {
      bucket: +kwBucket.toFixed(3),
      smap: kwSmap != null ? +kwSmap.toFixed(3) : undefined,
      ndviValidation: kwNdvi != null ? +kwNdvi.toFixed(3) : undefined,
      median: +median.toFixed(3),
    },
  };
}
