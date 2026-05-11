// ────────────────────────────────────────────────────────────────────────────
// Нормативная база модели STEPPE-Y:
//   - SORT_PARAMS: RUE, HI, дни созревания, устойчивость к болезням по сортам
//   - PHASE_PLAN: фазы роста и водная чувствительность (ky из FAO-33)
//   - SOIL_OPTIMA: оптимальные уровни N/P/K для Mitscherlich K_nutrition
//   - HARVEST_LOSS_BASELINE: baseline % потерь при уборке по культурам
//
// Источники по каждому числу — в комментариях. При расхождении с реальностью
// РК — править здесь, не в логических модулях.
// ────────────────────────────────────────────────────────────────────────────

import type { Crop } from "../types";
import type { SortParams, PhasePlan } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Сорта — главные носители RUE/HI/устойчивости.
//
// RUE источники:
//   - Monteith 1977: 1.4 г/МДж — стандарт C3 при не-стрессовых условиях
//   - Sinclair & Muchow 1999: 1.0–1.2 для зерновых в семи-аридных зонах
//   - Для степи Сев. Казахстана берём 1.2 как реалистичную нижнюю — высокий
//     VPD летом снижает фактическую RUE.
//
// HI источники:
//   - CIMMYT: 0.40–0.45 для современных сортов в орошении
//   - Казахстанские сорта (Степная, Омская, Саратовская): 0.30–0.38 в полевых
//     условиях. Берём 0.33 как медиану.
//
// Дни созревания — типичные для широты 52°N (СКО/Костанай).
// ────────────────────────────────────────────────────────────────────────────

export const SORT_PARAMS: Record<string, SortParams> = {
  // ───── Пшеница яровая ─────
  "wheat_spring/default": {
    id: "wheat_spring/default",
    crop: "wheat_spring",
    displayName: "Пшеница яровая (среднестатистическая)",
    rueGramsPerMJ: 1.2,
    harvestIndex: 0.33,
    daysToMaturity: 100,
    diseaseResistance: {
      yellow_rust: 0.50,
      stem_rust: 0.50,
      septoria: 0.55,
      tan_spot: 0.55,
      fhb: 0.60,
    },
    notes: "Медианные параметры для калибровки на неизвестный сорт.",
  },
  "wheat_spring/stepnaya_50": {
    id: "wheat_spring/stepnaya_50",
    crop: "wheat_spring",
    displayName: "Степная 50",
    rueGramsPerMJ: 1.25,
    harvestIndex: 0.35,
    daysToMaturity: 100,
    diseaseResistance: { yellow_rust: 0.55, stem_rust: 0.50, septoria: 0.60, tan_spot: 0.55 },
  },
  "wheat_spring/omskaya_36": {
    id: "wheat_spring/omskaya_36",
    crop: "wheat_spring",
    displayName: "Омская 36",
    rueGramsPerMJ: 1.25,
    harvestIndex: 0.34,
    daysToMaturity: 105,
    diseaseResistance: { yellow_rust: 0.45, stem_rust: 0.55, septoria: 0.50 },
  },
  "wheat_spring/astana": {
    id: "wheat_spring/astana",
    crop: "wheat_spring",
    displayName: "Астана",
    rueGramsPerMJ: 1.20,
    harvestIndex: 0.32,
    daysToMaturity: 95,
    diseaseResistance: { yellow_rust: 0.50, septoria: 0.55 },
  },

  // ───── Пшеница озимая ─────
  "wheat_winter/default": {
    id: "wheat_winter/default",
    crop: "wheat_winter",
    displayName: "Пшеница озимая (среднестатистическая)",
    rueGramsPerMJ: 1.35,
    harvestIndex: 0.38,
    daysToMaturity: 280,  // от сева в сентябре до уборки в июле след. года
    diseaseResistance: { yellow_rust: 0.45, stem_rust: 0.45, septoria: 0.50, fhb: 0.55 },
  },

  // ───── Ячмень ─────
  "barley/default": {
    id: "barley/default",
    crop: "barley",
    displayName: "Ячмень (среднестатистический)",
    rueGramsPerMJ: 1.30,
    harvestIndex: 0.40,
    daysToMaturity: 88,
    diseaseResistance: { stem_rust: 0.55, septoria: 0.50, tan_spot: 0.50 },
  },

  // ───── Овёс ─────
  "oats/default": {
    id: "oats/default",
    crop: "oats",
    displayName: "Овёс (среднестатистический)",
    rueGramsPerMJ: 1.25,
    harvestIndex: 0.36,
    daysToMaturity: 96,
    diseaseResistance: { stem_rust: 0.50, septoria: 0.55 },
  },

  // ───── Подсолнечник ─────
  "sunflower/default": {
    id: "sunflower/default",
    crop: "sunflower",
    displayName: "Подсолнечник (среднестатистический)",
    rueGramsPerMJ: 1.50,           // выше у C4-приближённых масличных
    harvestIndex: 0.30,
    daysToMaturity: 118,
    diseaseResistance: { septoria: 0.60 },
  },

  // ───── Рапс ─────
  "rapeseed/default": {
    id: "rapeseed/default",
    crop: "rapeseed",
    displayName: "Рапс яровой (среднестатистический)",
    rueGramsPerMJ: 1.30,
    harvestIndex: 0.30,
    daysToMaturity: 96,
    diseaseResistance: { septoria: 0.50 },
  },
};

// Helper: получить параметры сорта или fallback на default.
export function lookupSort(sortId: string | undefined, crop: Crop): SortParams {
  if (sortId && SORT_PARAMS[sortId]) return SORT_PARAMS[sortId];
  const fallback = SORT_PARAMS[`${crop}/default`];
  if (!fallback) throw new Error(`No sort params for crop ${crop} and no default`);
  return fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Фазы роста и водная чувствительность.
//
// ky источники: FAO-33 (Doorenbos & Kassam 1979), валидированы 40+ лет.
// kc источники: FAO-56 (Allen et al. 1998) — стандарт для ET0 → ETm.
//
// fraction — доля от daysToMaturity. Для зерновых типичная разбивка:
//   germination 0.25, vegetative 0.25, flowering 0.20, grainFill 0.20, maturity 0.10
//
// Для бобовых и масличных пропорции другие (заводятся при добавлении культур).
// ────────────────────────────────────────────────────────────────────────────

const CEREAL_PHASES: PhasePlan[] = [
  { phase: "germination", fraction: 0.25, ky: 0.20, kc: 0.30 },
  { phase: "vegetative",  fraction: 0.25, ky: 0.60, kc: 0.65 },
  { phase: "flowering",   fraction: 0.20, ky: 1.15, kc: 1.15 },  // критическая
  { phase: "grainFill",   fraction: 0.20, ky: 0.50, kc: 0.90 },
  { phase: "maturity",    fraction: 0.10, ky: 0.10, kc: 0.30 },
];

const OILSEED_PHASES: PhasePlan[] = [
  { phase: "germination", fraction: 0.20, ky: 0.20, kc: 0.30 },
  { phase: "vegetative",  fraction: 0.30, ky: 0.50, kc: 0.70 },
  { phase: "flowering",   fraction: 0.20, ky: 1.20, kc: 1.10 },  // подсолнечник чувствителен в цветение
  { phase: "grainFill",   fraction: 0.20, ky: 0.60, kc: 0.85 },
  { phase: "maturity",    fraction: 0.10, ky: 0.10, kc: 0.30 },
];

export const PHASE_PLAN: Record<Crop, PhasePlan[]> = {
  wheat_spring: CEREAL_PHASES,
  wheat_winter: CEREAL_PHASES,
  barley:       CEREAL_PHASES,
  oats:         CEREAL_PHASES,
  sunflower:    OILSEED_PHASES,
  rapeseed:     OILSEED_PHASES,
};

// ────────────────────────────────────────────────────────────────────────────
// Оптимальные уровни питательных веществ в почве (для Mitscherlich K_nutrition).
//
// Источник: рекомендации КазНИИЗиР для степной зоны (приближение). При наличии
// сорт-специфичных рекомендаций — переопределять в SortParams.
//
// Mitscherlich constant `c` подобран так, чтобы при ratio=1.0 (норма)
// K_element ≈ 0.95 (5% дефицит при «норме», 95% потенциала).
//
// При c=3: K(1.0) = 1 − e^−3 ≈ 0.95
// При c=2: K(1.0) = 1 − e^−2 ≈ 0.865
//
// Для P/K используем c=3 (сильно лимитирующие); для N c=2.5 (умеренно).
// ────────────────────────────────────────────────────────────────────────────

export const SOIL_OPTIMA = {
  // мг/кг в почве, для дегмлёных и эрозированных черноземов
  N_mgkg: 90,
  P_mgkg: 15,
  K_mgkg: 80,
  Cu_mgkg: 0.2,
  Zn_mgkg: 0.5,

  // Эффективность фертилизации: какая доля внесённого килограмма по гектару
  // переходит в эффективный уровень почвы (мг/кг). Грубая аппроксимация.
  fertilizerEfficiency: {
    N: 0.42,  // 60 кг/га N → +25 мг/кг эффективно
    P: 0.10,  // 40 кг/га P → +4 мг/кг
    K: 0.12,
  },

  // Mitscherlich c-константы.
  mitscherlichC: {
    N: 2.5,
    P: 3.0,
    K: 3.0,
    micro: 3.5,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Базовые потери при уборке по культурам (K_harvest baseline).
//
// Источник: FAO/UN Food Loss Assessment Kazakhstan, Manitoba Crop Alliance.
// Цифры — это потери при ПРАВИЛЬНО настроенной технике в срок. Дальше
// модулируется задержкой (см. harvest-loss.ts).
// ────────────────────────────────────────────────────────────────────────────

export const HARVEST_LOSS_BASELINE_PCT: Record<Crop, number> = {
  wheat_spring: 8,
  wheat_winter: 8,
  barley:       8,
  oats:         9,
  sunflower:    5,    // меньше осыпания, чем у зерновых
  rapeseed:     10,   // силикулы лопаются — больше потерь
};

export const HARVEST_LOSS_MAX_PCT = 20;       // cap, не хуже даже при сильной задержке
export const HARVEST_DELAY_PCT_PER_DAY = 0.7; // прибавка к потерям за день задержки

// ────────────────────────────────────────────────────────────────────────────
// Калибровочные ограничения.
// ────────────────────────────────────────────────────────────────────────────

export const CREGION_MIN = 0.85;
export const CREGION_MAX = 1.15;
export const CREGION_FALLBACK = 1.00;   // если данных БНС нет

// Y_potential cap множитель к историческому максимуму БНС.
// Зачем нужен запас 1.1: реальный максимум может быть выше зарегистрированного
// (если конкретное поле выше среднего по району).
export const BNS_CAP_HEADROOM = 1.10;

// Если БНС-историка отсутствует — используем эту консервативную оценку как
// долю от сырого Monteith (Y_potential_raw).
export const NO_BNS_FALLBACK_FRACTION = 0.50;  // потолок = 50% Monteith
