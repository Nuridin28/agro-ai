import type { SourceRef } from "./sources";

// ────────────────────────────────────────────────────────────────────────────
// Базовый паспорт агрария
// ────────────────────────────────────────────────────────────────────────────

export type Sector = "crop" | "livestock" | "mixed";

export interface Region {
  oblast: string;     // Область
  rayon: string;      // Район
  okrug?: string;     // Сельский округ
  katoCode: string;   // КАТО (9 цифр)
}

export interface Farmer {
  id: string;
  legalName: string;     // ТОО / КХ / ИП
  ownerFio: string;
  bin: string;           // БИН (12 цифр), либо ИИН для КХ/ИП
  sector: Sector;
  region: Region;
  registeredAt: string;  // дата регистрации в Qoldau
  source: SourceRef;
}

// ────────────────────────────────────────────────────────────────────────────
// Земледелие
// ────────────────────────────────────────────────────────────────────────────

export type Crop = "wheat_spring" | "wheat_winter" | "barley" | "oats" | "sunflower" | "rapeseed";

export const CROP_LABEL: Record<Crop, string> = {
  wheat_spring: "Пшеница яровая",
  wheat_winter: "Пшеница озимая",
  barley: "Ячмень",
  oats: "Овёс",
  sunflower: "Подсолнечник",
  rapeseed: "Рапс",
};

// Биологические нормы (ц/га) — потолок при идеальных условиях для каждой области.
// Используются как «эталон» в верификации.
export interface CropNorm {
  crop: Crop;
  baseYieldCentnersHa: number; // эталон при балле 50 и нормальной влагозарядке
}

export interface Field {
  id: string;
  farmerId: string;
  cadastralNumber: string;       // кадастровый номер участка (ЕГКН)
  areaHa: number;                // площадь, га
  bonitet: number;               // балл бонитета (Гипрозем)
  humusPct: number;              // % гумуса в пахотном слое
  nitrogenMgKg: number;          // N мг/кг
  phosphorusMgKg: number;        // P мг/кг
  potassiumMgKg: number;         // K мг/кг
  copperMgKg: number;            // Cu мг/кг (микроэлемент)
  zincMgKg: number;              // Zn мг/кг
  region: Region;
  source: SourceRef;             // ЕГКН (на участок)
  agroSource: SourceRef;         // Гипрозем (на агрохимию)
}

// Метео-сезон по региону (зима + вегетация)
export interface MeteoSeason {
  regionKato: string;
  year: number;
  swEqMm: number;          // снежный покров: водный эквивалент (мм)
  snowMeltDate: string;    // дата схода снега
  soilWarmDate: string;    // дата прогрева до +8°C на глубине посева
  springWindStress: boolean; // «черные бури» апрель-май
  augSepRainfallMm: number;  // осадки август-сентябрь (риск прорастания/ухода под снег)
  minWinterC: number;        // минимум зимней температуры
  maxSnowDepthCm: number;    // максимум высоты снега (для скота)
  source: SourceRef;
  agrodataSource: SourceRef; // ссылка на NDVI/влагозапас
}

// Сезонная заявка по полю
export interface CropSeason {
  id: string;
  fieldId: string;
  farmerId: string;
  year: number;
  crop: Crop;
  declaredYieldCha: number;       // заявленный сбор (ц/га)
  fertilizerKgHa: number;         // факт.закуп удобрений на га (по Qoldau)
  seedKgHa: number;               // нормы высева
  declaredSowingDate: string;
  subsidyTenge: number;           // сумма субсидии за сезон
  declSource: SourceRef;          // Qoldau
  yieldSource: SourceRef;         // stat.gov.kz / Qoldau отчётность
}

// ────────────────────────────────────────────────────────────────────────────
// Скотоводство
// ────────────────────────────────────────────────────────────────────────────

export type Breed = "kazakh_white_head" | "auliekol" | "angus" | "hereford" | "simmental";

export const BREED_LABEL: Record<Breed, string> = {
  kazakh_white_head: "Казахская белоголовая",
  auliekol: "Аулиекольская",
  angus: "Абердин-ангус",
  hereford: "Герефорд",
  simmental: "Симментальская",
};

export interface BreedNorm {
  breed: Breed;
  adgKgDay: { min: number; typical: number; max: number }; // среднесуточный привес
  reproPer100Cows: { min: number; typical: number };       // выход телят на 100 коров
  saleWeightKg: { min: number; max: number };              // живой вес при реализации
}

// Племенной бык
export interface BreedingBull {
  inj: string;
  farmerId: string;
  breed: Breed;
  purchasedAt: string;        // дата покупки
  costTenge: number;
  subsidyTenge: number;
  plemCertId: string;
  source: SourceRef;          // ИСЖ (паспорт)
  plemSource: SourceRef;      // Plem.kz (свидетельство)
}

// Сводный учёт стада (на год)
export interface HerdYear {
  id: string;
  farmerId: string;
  year: number;
  cowsHead: number;             // маточное поголовье
  bullsHead: number;            // быки-производители
  calvesBornHead: number;       // приплод за год
  mortalityHead: number;        // падёж
  soldHead: number;             // реализовано
  avgSaleWeightKg: number;      // средний вес продажи
  declaredAdgKgDay: number;     // заявленный привес (для откорма)
  feedSubsidyKgPerHead: number; // субсидированный корм на голову (год)
  vaccinationCoveragePct: number; // % охвата ящур+бруцеллёз
  pastureFieldId?: string;      // привязка к пастбищу (если есть)
  subsidyTenge: number;         // субсидии за год по направлению
  source: SourceRef;            // ИСЖ
  vetSource: SourceRef;         // VETIS
  qoldauSource: SourceRef;      // Qoldau (выплаты/корма)
}

// Пастбище
export interface Pasture {
  id: string;
  farmerId: string;
  cadastralNumber: string;
  areaHa: number;
  vegetationType: "степь_злаковая" | "полупустыня" | "лугово_степная" | "пустынная";
  bonitet: number;            // балл
  carryingCapacityHeadHa: number; // голов на гектар (эталон Гипрозема для типа)
  region: Region;
  source: SourceRef;          // ЕГКН
  giprozemSource: SourceRef;  // Гипрозем (тип растительности и нагрузка)
}
