import type { Crop, CropNorm, Breed, BreedNorm } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Эталоны урожайности — основа модуля «Региональный эталон» (см. ТЗ §3.2 земледелие).
// Базовые цифры: stat.gov.kz, бюллетени БНС за 2019-2024 по СКО/Костанай/Акмола.
// «base» — потенциал на бонитете 50 при нормальной влагозарядке (200+ мм водный эквивалент снега).
// ────────────────────────────────────────────────────────────────────────────

export const CROP_NORMS: Record<Crop, CropNorm> = {
  wheat_spring: { crop: "wheat_spring", baseYieldCentnersHa: 14 },
  wheat_winter: { crop: "wheat_winter", baseYieldCentnersHa: 22 },
  barley:       { crop: "barley",       baseYieldCentnersHa: 16 },
  oats:         { crop: "oats",         baseYieldCentnersHa: 15 },
  sunflower:    { crop: "sunflower",    baseYieldCentnersHa: 11 },
  rapeseed:     { crop: "rapeseed",     baseYieldCentnersHa: 13 },
};

// Минимально-необходимая агрохимия для реализации потенциала (азотно-фосфорный фон).
// Источник: рекомендации ТОО «КазНИИЗиР» / Гипрозем.
export const SOIL_REQUIREMENTS = {
  humusPctMin: 3.0,
  phosphorusMgKgMin: 15,
  potassiumMgKgMin: 80,
  copperMgKgMin: 0.2,
  zincMgKgMin: 0.5,
};

// ────────────────────────────────────────────────────────────────────────────
// Биологические потолки по породам КРС.
// Источники: справочник «Племенные ресурсы Казахстана», Plem.kz, отчёты ИАС.
// adg — среднесуточный привес откорма; repro — выход телят на 100 маток;
// saleWeight — типичный диапазон живой массы при реализации на убой.
// ────────────────────────────────────────────────────────────────────────────

export const BREED_NORMS: Record<Breed, BreedNorm> = {
  kazakh_white_head: {
    breed: "kazakh_white_head",
    adgKgDay: { min: 0.7, typical: 1.05, max: 1.4 },
    reproPer100Cows: { min: 70, typical: 85 },
    saleWeightKg: { min: 380, max: 520 },
  },
  auliekol: {
    breed: "auliekol",
    adgKgDay: { min: 0.8, typical: 1.15, max: 1.5 },
    reproPer100Cows: { min: 70, typical: 82 },
    saleWeightKg: { min: 420, max: 560 },
  },
  angus: {
    breed: "angus",
    adgKgDay: { min: 0.9, typical: 1.25, max: 1.6 },
    reproPer100Cows: { min: 75, typical: 88 },
    saleWeightKg: { min: 440, max: 600 },
  },
  hereford: {
    breed: "hereford",
    adgKgDay: { min: 0.85, typical: 1.2, max: 1.5 },
    reproPer100Cows: { min: 72, typical: 85 },
    saleWeightKg: { min: 430, max: 580 },
  },
  simmental: {
    breed: "simmental",
    adgKgDay: { min: 0.9, typical: 1.3, max: 1.65 },
    reproPer100Cows: { min: 75, typical: 88 },
    saleWeightKg: { min: 450, max: 620 },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Нормы расхода корма для зимовки (концентраты + грубые в к.ед./голова/сутки).
// Простая аппроксимация: при -20°С → 9 к.ед./сут × 150 дней зимовки → ≈1350 к.ед.
// 1 к.ед. ≈ 1 кг ячменя; конвертим в кг кормов.
// ────────────────────────────────────────────────────────────────────────────

export function expectedWinterFeedKgPerHead(minWinterC: number, maxSnowDepthCm: number): number {
  // База — 7 кг к.ед./сут × 130 дней
  let dailyKEd = 7;
  let days = 130;
  if (minWinterC < -25) dailyKEd += 1.5;
  if (minWinterC < -35) dailyKEd += 1.0;
  if (maxSnowDepthCm > 30) days += 15;
  if (maxSnowDepthCm > 60) days += 15;
  return Math.round(dailyKEd * days);
}
