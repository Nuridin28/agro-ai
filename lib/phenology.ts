// ────────────────────────────────────────────────────────────────────────────
// Фенологический календарь полевых работ.
// Считает оптимальные даты сева, гербицидной обработки и уборки на основе:
//   - агрономических норм по культуре (DOY-окна для широты 52°N)
//   - сдвига по широте региона (севернее → позже, южнее → раньше)
//   - опционально: даты прогрева почвы +8°C (HistoricalWxSeason.soilWarmDate)
//
// Модель упрощённая — без GDD-аккумуляции и микроклимата. Достаточная для
// первичной планёрки фермера, но НЕ для верификации сроков (для этого нужны
// ежедневные T° за весь сезон).
//
// Связь с правилом FAKE_SOWING (Правила.md, §2): «холодная почва > 5 дней
// раньше нормы» — норма = sowing.from из этого модуля.
// ────────────────────────────────────────────────────────────────────────────

import type { Crop } from "./types";

export type PhenologyPhase = "sowing" | "weeding" | "harvest";

export interface PhenologyWindow {
  phase: PhenologyPhase;
  from: string;     // YYYY-MM-DD — раннее начало окна
  to: string;       // YYYY-MM-DD — поздний конец
  optimal: string;  // YYYY-MM-DD — оптимальная дата
  hint: string;     // короткое пояснение для UI
}

export interface PhenologyForCrop {
  crop: Crop;
  year: number;
  sowing: PhenologyWindow;
  weeding: PhenologyWindow;
  harvest: PhenologyWindow;
  basis: string;    // объяснение, откуда взялись даты
}

interface CropPhenoBase {
  // База — широта 52°N (центральный/северный Казахстан, Костанай-Акмола).
  sowingDoyOpt: number;          // оптимальный DOY сева
  sowingHalfWidthDays: number;   // ± дней от opt (окно сева)
  weedingFromSowingMin: number;  // дней после сева — старт окна гербицидной
  weedingFromSowingMax: number;
  weedingFromSowingOpt: number;
  daysToHarvestMin: number;      // дней от сева до уборки
  daysToHarvestMax: number;
  daysToHarvestOpt: number;
  isWinterCrop?: boolean;        // wheat_winter — особая логика
}

// Агрономические окна (приблизительные, для северного зерносеющего пояса).
// Источники: рекомендации НИИ зернового хозяйства им. Бараева, агрокалендари СКО/Костаная.
const CROP_PHENO: Record<Crop, CropPhenoBase> = {
  // Яровая пшеница: 15–25 мая, гербицидная в кущение, уборка к концу августа
  wheat_spring: { sowingDoyOpt: 140, sowingHalfWidthDays: 5, weedingFromSowingMin: 21, weedingFromSowingMax: 35, weedingFromSowingOpt: 28, daysToHarvestMin: 95, daysToHarvestMax: 110, daysToHarvestOpt: 102 },
  // Ячмень: чуть раньше пшеницы, короче вегетация
  barley:       { sowingDoyOpt: 132, sowingHalfWidthDays: 5, weedingFromSowingMin: 18, weedingFromSowingMax: 30, weedingFromSowingOpt: 24, daysToHarvestMin: 82, daysToHarvestMax: 95,  daysToHarvestOpt: 88 },
  // Овёс: сходно с яровой пшеницей
  oats:         { sowingDoyOpt: 134, sowingHalfWidthDays: 5, weedingFromSowingMin: 20, weedingFromSowingMax: 32, weedingFromSowingOpt: 26, daysToHarvestMin: 90, daysToHarvestMax: 105, daysToHarvestOpt: 96 },
  // Подсолнечник: теплолюбивый, сев когда почва >+10°C, поздняя уборка
  sunflower:    { sowingDoyOpt: 142, sowingHalfWidthDays: 6, weedingFromSowingMin: 25, weedingFromSowingMax: 40, weedingFromSowingOpt: 32, daysToHarvestMin: 110, daysToHarvestMax: 130, daysToHarvestOpt: 118 },
  // Рапс яровой: ранний сев, чувствителен к теплу при цветении
  rapeseed:     { sowingDoyOpt: 128, sowingHalfWidthDays: 6, weedingFromSowingMin: 22, weedingFromSowingMax: 35, weedingFromSowingOpt: 28, daysToHarvestMin: 90, daysToHarvestMax: 105, daysToHarvestOpt: 96 },
  // Озимая пшеница — отдельная ветка вычислений (см. computeWinterWheat)
  wheat_winter: { sowingDoyOpt: 248, sowingHalfWidthDays: 7, weedingFromSowingMin: 0,  weedingFromSowingMax: 0,  weedingFromSowingOpt: 0,  daysToHarvestMin: 0,   daysToHarvestMax: 0,   daysToHarvestOpt: 0,   isWinterCrop: true },
};

// Сдвиг по широте: каждые ~1°N севернее 52° → +2 дня к севу/уборке.
// Грубая аппроксимация — без рельефа и микроклимата, но даёт правильное
// направление (север Казахстана сеет позже Алматинской области).
function latShiftDays(lat: number): number {
  return Math.round((lat - 52) * 2);
}

function doyToDate(year: number, doy: number): Date {
  const d = new Date(Date.UTC(year, 0, 1));
  d.setUTCDate(doy);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export interface PhenologyInput {
  crop: Crop;
  year: number;
  lat: number;                   // широта центра поля/района
  soilWarmDate?: string | null;  // ISO дата прогрева почвы +8°C — приоритет для теплолюбивых
}

export function computePhenology({ crop, year, lat, soilWarmDate }: PhenologyInput): PhenologyForCrop {
  const base = CROP_PHENO[crop];
  const shift = latShiftDays(lat);

  if (base.isWinterCrop) {
    return computeWinterWheat(year, lat, shift);
  }

  // Сев: оптимум по DOY с поправкой на широту. Если фактический soilWarmDate
  // позже календарной нормы — сдвигаем сев к нему (нет смысла сеять в холодную землю).
  let sowingOpt = doyToDate(year, base.sowingDoyOpt + shift);
  let usedSoilWarm = false;
  if (soilWarmDate) {
    const warm = new Date(soilWarmDate + "T00:00:00Z");
    if (Number.isFinite(warm.getTime()) && warm.getUTCFullYear() === year && warm > sowingOpt) {
      sowingOpt = warm;
      usedSoilWarm = true;
    }
  }
  const sowingFrom = addDays(sowingOpt, -base.sowingHalfWidthDays);
  const sowingTo   = addDays(sowingOpt,  base.sowingHalfWidthDays);

  const weedingFrom = addDays(sowingOpt, base.weedingFromSowingMin);
  const weedingTo   = addDays(sowingOpt, base.weedingFromSowingMax);
  const weedingOpt  = addDays(sowingOpt, base.weedingFromSowingOpt);

  const harvestFrom = addDays(sowingOpt, base.daysToHarvestMin);
  const harvestTo   = addDays(sowingOpt, base.daysToHarvestMax);
  const harvestOpt  = addDays(sowingOpt, base.daysToHarvestOpt);

  return {
    crop, year,
    sowing:  { phase: "sowing",  from: fmt(sowingFrom),  to: fmt(sowingTo),  optimal: fmt(sowingOpt),  hint: usedSoilWarm ? "сдвинут к дате прогрева почвы +8°C" : "по агрономической норме" },
    weeding: { phase: "weeding", from: fmt(weedingFrom), to: fmt(weedingTo), optimal: fmt(weedingOpt), hint: weedingHint(crop) },
    harvest: { phase: "harvest", from: fmt(harvestFrom), to: fmt(harvestTo), optimal: fmt(harvestOpt), hint: harvestHint(crop) },
    basis: `Норма для широты ${lat.toFixed(1)}° (сдвиг ${shift >= 0 ? "+" : ""}${shift} дн. от 52°N)${usedSoilWarm ? ` · сев скорректирован по soil-warm ${soilWarmDate}` : ""}`,
  };
}

function computeWinterWheat(year: number, lat: number, shift: number): PhenologyForCrop {
  // Озимая пшеница: сев осенью предыдущего года, уборка в текущем.
  // Гербицидная — весной по возобновлению вегетации (до выхода в трубку).
  const sowingOpt = doyToDate(year - 1, 248 + shift); // ~5 сентября
  const sowingFrom = addDays(sowingOpt, -7);
  const sowingTo   = addDays(sowingOpt,  7);

  const weedingOpt = doyToDate(year, 110 + shift); // ~20 апреля
  const weedingFrom = addDays(weedingOpt, -7);
  const weedingTo   = addDays(weedingOpt, 14);

  const harvestOpt = doyToDate(year, 210 + shift); // ~29 июля
  const harvestFrom = addDays(harvestOpt, -7);
  const harvestTo   = addDays(harvestOpt, 14);

  return {
    crop: "wheat_winter", year,
    sowing:  { phase: "sowing",  from: fmt(sowingFrom),  to: fmt(sowingTo),  optimal: fmt(sowingOpt),  hint: `осень ${year - 1}, до устойчивых -5°C` },
    weeding: { phase: "weeding", from: fmt(weedingFrom), to: fmt(weedingTo), optimal: fmt(weedingOpt), hint: "по возобновлению вегетации" },
    harvest: { phase: "harvest", from: fmt(harvestFrom), to: fmt(harvestTo), optimal: fmt(harvestOpt), hint: "восковая → полная спелость" },
    basis: `Норма для широты ${lat.toFixed(1)}° (сдвиг ${shift >= 0 ? "+" : ""}${shift} дн. от 52°N) · озимая`,
  };
}

function weedingHint(crop: Crop): string {
  switch (crop) {
    case "wheat_spring":
    case "barley":
    case "oats":
      return "фаза кущения, до выхода в трубку";
    case "sunflower":
      return "2–4 настоящих листа";
    case "rapeseed":
      return "розетка 4–6 листьев";
    default:
      return "ранние фазы развития";
  }
}

function harvestHint(crop: Crop): string {
  switch (crop) {
    case "sunflower":
      return "корзинки бурые, влажность семян ~12%";
    case "rapeseed":
      return "стручки тёмно-коричневые, семена твёрдые";
    default:
      return "восковая → полная спелость";
  }
}

// Удобная обёртка: посчитать для всех известных культур одной командой.
export function computePhenologyAll(year: number, lat: number, soilWarmDate?: string | null): PhenologyForCrop[] {
  const order: Crop[] = ["wheat_spring", "wheat_winter", "barley", "oats", "sunflower", "rapeseed"];
  return order.map((crop) => computePhenology({ crop, year, lat, soilWarmDate }));
}

// Форматирование даты для UI: "5 мая".
const MONTHS_RU = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export function fmtRuShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (!Number.isFinite(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]}`;
}
