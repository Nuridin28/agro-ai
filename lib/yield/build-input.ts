// ────────────────────────────────────────────────────────────────────────────
// Сборка YieldPredictionInput из данных, доступных в текущем проекте:
//   - Гипрозем (агрохимия + бонитет)
//   - open-meteo / mock-meteo (погода за сезон)
//   - заявка фермера (декларация)
//
// В v0.1 многие источники подменяются разумными дефолтами для Сев. Казахстана.
// При интеграции с реальными API заменяем дефолты на fetched-данные.
// ────────────────────────────────────────────────────────────────────────────

import type { Crop, Field } from "../types";
import type {
  YieldPredictionInput,
  SeasonWeather,
  FieldDeclaration,
  PeerContext,
  SortId,
} from "./types";
import { createCregionMock } from "./regional";

// ────────────────────────────────────────────────────────────────────────────
// Дефолты по агроклимату Сев. Казахстана (СКО, Костанай, Акмола).
// Используются когда нет конкретных данных с API — лучше консервативный
// разумный дефолт, чем падение прогноза.
// ────────────────────────────────────────────────────────────────────────────

// Типичная сумма IPAR за апрель-сентябрь на широте 52°N: ~1100 МДж/м².
// Источник: NASA POWER, расчёты для координат СКО.
export const DEFAULT_IPAR_MJM2_NORTH_KZ = 1100;

// Типичный ET0 (Penman-Monteith) по месяцам для СКО, мм.
// Источник: open-meteo / ERA5, осреднённые за 2015–2024.
export const DEFAULT_MONTHLY_ET0_NORTH_KZ: { month: number; mm: number }[] = [
  { month: 4, mm: 75 },
  { month: 5, mm: 124 },
  { month: 6, mm: 165 },
  { month: 7, mm: 186 },
  { month: 8, mm: 155 },
  { month: 9, mm: 95 },
];

// Норма осадков по месяцам для СКО, мм. Среднее за 2014–2023.
export const DEFAULT_MONTHLY_PRECIP_NORTH_KZ: { month: number; mm: number }[] = [
  { month: 4, mm: 20 },
  { month: 5, mm: 35 },
  { month: 6, mm: 50 },
  { month: 7, mm: 55 },
  { month: 8, mm: 40 },
  { month: 9, mm: 30 },
];

// Историч. максимум урожая по культурам в Сев. КЗ (БНС, 2014–2024).
// При интеграции с реальным API БНС — это будет lookup по oblast/rayon/crop/year.
export const DEFAULT_BNS_HISTORICAL_MAX: Record<Crop, number> = {
  wheat_spring: 22,
  wheat_winter: 34,
  barley:       24,
  oats:         22,
  sunflower:    18,
  rapeseed:     20,
};

// Региональное среднее по культуре (для peer comparison).
export const DEFAULT_RAYON_AVG: Record<Crop, number> = {
  wheat_spring: 11.5,
  wheat_winter: 18.0,
  barley:       13.0,
  oats:         12.5,
  sunflower:    10.5,
  rapeseed:     11.0,
};

// ────────────────────────────────────────────────────────────────────────────
// Builder input.
// ────────────────────────────────────────────────────────────────────────────

export interface BuildInputArgs {
  field: Field;
  year: number;
  crop: Crop;
  sortId?: SortId;
  // Декларация фермера (минимальная — culculator подставляет дефолты).
  sowingDate?: string;
  harvestDate?: string;
  fertilizerNKgHa?: number;
  fertilizerPKgHa?: number;
  fertilizerKKgHa?: number;
  herbicideDeclared?: boolean;
  fungicideDeclared?: boolean;
  declaredYieldCha?: number;
  // Реальные погодные данные (если уже подтянуты с open-meteo).
  // Если не переданы — используем DEFAULT_MONTHLY_*.
  monthlyPrecipMm?: { month: number; mm: number }[];
  monthlyET0Mm?: { month: number; mm: number }[];
  swEqMm?: number;
  soilWarmDate?: string;
  sumIPARMJm2?: number;
  // Экстремумы за сезон.
  daysTmaxOver32?: number;
  daysTmaxOver35?: number;
  daysTminBelowMinus2AfterMay1?: number;
  daysWindOver17?: number;
  hailReported?: boolean;
  // Перенесённые региональные данные.
  bnsHistoricalMaxCha?: number;
  rayonAverageCha?: number;
  cregionFactor?: number;
}

/**
 * Строит YieldPredictionInput с разумными дефолтами там, где данные не переданы.
 * Подходит для интерактивного калькулятора: фермер не обязан указывать всё.
 */
export function buildYieldPredictionInput(args: BuildInputArgs): YieldPredictionInput {
  const { field, year, crop } = args;

  // Дата посева — если не передана, берём типичную оптимальную для культуры.
  const defaultSowingByCrop: Record<Crop, string> = {
    wheat_spring: `${year}-05-15`,
    wheat_winter: `${year - 1}-09-05`,
    barley:       `${year}-05-12`,
    oats:         `${year}-05-13`,
    sunflower:    `${year}-05-20`,
    rapeseed:     `${year}-05-10`,
  };
  const sowingDate = args.sowingDate ?? defaultSowingByCrop[crop];

  const weather: SeasonWeather = {
    swEqMm: args.swEqMm ?? 130,
    snowmeltEfficiency: 0.6,
    soilWarmDate: args.soilWarmDate,
    monthlyPrecipMm: args.monthlyPrecipMm ?? DEFAULT_MONTHLY_PRECIP_NORTH_KZ,
    monthlyET0Mm: args.monthlyET0Mm ?? DEFAULT_MONTHLY_ET0_NORTH_KZ,
    sumIPARMJm2: args.sumIPARMJm2 ?? DEFAULT_IPAR_MJM2_NORTH_KZ,
    daysTmaxOver32: args.daysTmaxOver32 ?? 0,
    daysTmaxOver35: args.daysTmaxOver35 ?? 0,
    daysTminBelowMinus2AfterMay1: args.daysTminBelowMinus2AfterMay1 ?? 0,
    daysWindOver17: args.daysWindOver17 ?? 0,
    hailReported: args.hailReported ?? false,
  };

  const declaration: FieldDeclaration = {
    sowingDate,
    harvestDate: args.harvestDate,
    fertilizerNKgHa: args.fertilizerNKgHa ?? 0,
    fertilizerPKgHa: args.fertilizerPKgHa ?? 0,
    fertilizerKKgHa: args.fertilizerKKgHa ?? 0,
    herbicideApplied: {
      declared: args.herbicideDeclared ?? false,
      // Дата декларации — типичная середина окна (sowing + 28 дней).
      date: args.herbicideDeclared ? addDays(sowingDate, 28) : undefined,
      qoldauVerified: args.herbicideDeclared ?? false,
    },
    fungicideApplied: {
      declared: args.fungicideDeclared ?? false,
      qoldauVerified: args.fungicideDeclared ?? false,
    },
    declaredYieldCha: args.declaredYieldCha,
    sortId: args.sortId,
  };

  const peer: PeerContext = {
    rayonAverage: args.rayonAverageCha ?? DEFAULT_RAYON_AVG[crop],
    peerCount: 25,
  };

  const regional = createCregionMock(
    field.region.oblast,
    field.region.rayon,
    args.cregionFactor ?? 1.00,
    3,
  );

  return {
    field,
    season: { year, crop },
    weather,
    declaration,
    peer,
    regional,
    bnsHistoricalMaxCha: args.bnsHistoricalMaxCha ?? DEFAULT_BNS_HISTORICAL_MAX[crop],
  };
}

function addDays(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
