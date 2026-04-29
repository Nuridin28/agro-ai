import type { Field, CropSeason } from "../types";
import { findFarmer } from "./farmers";

const T = "2025-09-25T08:00:00Z";

const region = (id: string) => findFarmer(id)!.region;

// ─── Поля (ЕГКН + Гипрозем) ───
export const FIELDS: Field[] = [
  // F-001 — СКО, чистый, хорошая земля
  {
    id: "FLD-001-1",
    farmerId: "F-001",
    cadastralNumber: "15-189-007-052",
    areaHa: 1200, bonitet: 56, humusPct: 4.1,
    nitrogenMgKg: 120, phosphorusMgKg: 22, potassiumMgKg: 110,
    copperMgKg: 0.4, zincMgKg: 0.7,
    region: region("F-001"),
    source:     { source: "EGKN",     docId: "EGKN-15-189-007-052",   fetchedAt: T, note: "Кадастр участка" },
    agroSource: { source: "GIPROZEM", docId: "GZ-SKO-2024-15189-007", fetchedAt: T, note: "Агрохимобследование 2024" },
  },
  // F-002 — СКО, низкий бонитет, заведомо низкий потенциал (объяснение низкого урожая)
  {
    id: "FLD-002-1",
    farmerId: "F-002",
    cadastralNumber: "15-189-014-038",
    areaHa: 900, bonitet: 35, humusPct: 2.6,
    nitrogenMgKg: 78, phosphorusMgKg: 14, potassiumMgKg: 88,
    copperMgKg: 0.22, zincMgKg: 0.55,
    region: region("F-002"),
    source:     { source: "EGKN",     docId: "EGKN-15-189-014-038",   fetchedAt: T },
    agroSource: { source: "GIPROZEM", docId: "GZ-SKO-2024-15189-014", fetchedAt: T },
  },
  // F-003 — Костанай, нормальное поле НО плохая зима в районе (фрод по влаге)
  {
    id: "FLD-003-1",
    farmerId: "F-003",
    cadastralNumber: "12-203-005-021",
    areaHa: 700, bonitet: 50, humusPct: 3.6,
    nitrogenMgKg: 102, phosphorusMgKg: 19, potassiumMgKg: 102,
    copperMgKg: 0.32, zincMgKg: 0.62,
    region: region("F-003"),
    source:     { source: "EGKN",     docId: "EGKN-12-203-005-021",   fetchedAt: T },
    agroSource: { source: "GIPROZEM", docId: "GZ-KST-2024-12203-005", fetchedAt: T },
  },
  // F-004 — Акмола, поздний прогрев почвы
  {
    id: "FLD-004-1",
    farmerId: "F-004",
    cadastralNumber: "01-126-009-014",
    areaHa: 1500, bonitet: 52, humusPct: 3.8,
    nitrogenMgKg: 110, phosphorusMgKg: 20, potassiumMgKg: 105,
    copperMgKg: 0.36, zincMgKg: 0.66,
    region: region("F-004"),
    source:     { source: "EGKN",     docId: "EGKN-01-126-009-014",   fetchedAt: T },
    agroSource: { source: "GIPROZEM", docId: "GZ-AKM-2024-01126-009", fetchedAt: T },
  },
  // F-005 — Костанай, серьёзный дефицит P и Cu при заявленном высоком урожае
  {
    id: "FLD-005-1",
    farmerId: "F-005",
    cadastralNumber: "12-203-008-007",
    areaHa: 1100, bonitet: 48, humusPct: 3.0,
    nitrogenMgKg: 95, phosphorusMgKg: 8, potassiumMgKg: 75,
    copperMgKg: 0.05, zincMgKg: 0.31,
    region: region("F-005"),
    source:     { source: "EGKN",     docId: "EGKN-12-203-008-007",   fetchedAt: T },
    agroSource: { source: "GIPROZEM", docId: "GZ-KST-2024-12203-008", fetchedAt: T },
  },
  // F-006 — СКО, чистый средний фермер
  {
    id: "FLD-006-1",
    farmerId: "F-006",
    cadastralNumber: "15-189-010-029",
    areaHa: 600, bonitet: 50, humusPct: 3.5,
    nitrogenMgKg: 100, phosphorusMgKg: 18, potassiumMgKg: 95,
    copperMgKg: 0.28, zincMgKg: 0.60,
    region: region("F-006"),
    source:     { source: "EGKN",     docId: "EGKN-15-189-010-029",   fetchedAt: T },
    agroSource: { source: "GIPROZEM", docId: "GZ-SKO-2024-15189-010", fetchedAt: T },
  },
  // F-014 — СКО, mixed
  {
    id: "FLD-014-1",
    farmerId: "F-014",
    cadastralNumber: "15-189-011-044",
    areaHa: 800, bonitet: 51, humusPct: 3.6,
    nitrogenMgKg: 105, phosphorusMgKg: 19, potassiumMgKg: 100,
    copperMgKg: 0.30, zincMgKg: 0.62,
    region: region("F-014"),
    source:     { source: "EGKN",     docId: "EGKN-15-189-011-044",   fetchedAt: T },
    agroSource: { source: "GIPROZEM", docId: "GZ-SKO-2024-15189-011", fetchedAt: T },
  },
];

export const CROP_SEASONS: CropSeason[] = [
  // F-001 — норма
  {
    id: "CS-001-2024", fieldId: "FLD-001-1", farmerId: "F-001", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 13.2, fertilizerKgHa: 48, seedKgHa: 175,
    declaredSowingDate: "2024-05-12",
    subsidyTenge: 28_000_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-001-2024", fetchedAt: T, note: "Заявка на удобрения" },
    yieldSource: { source: "STAT",   docId: "BNS-15-2024-CS-001",  fetchedAt: T, note: "Форма 4-сх" },
  },
  // F-002 — низкий, объяснимо низким бонитетом
  {
    id: "CS-002-2024", fieldId: "FLD-002-1", farmerId: "F-002", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 7.1, fertilizerKgHa: 22, seedKgHa: 170,
    declaredSowingDate: "2024-05-15",
    subsidyTenge: 11_000_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-002-2024", fetchedAt: T },
    yieldSource: { source: "STAT",   docId: "BNS-15-2024-CS-002",  fetchedAt: T },
  },
  // F-003 — Костанай: малоснежная зима + ветры → но фермер заявил 16.5 ц/га (фрод)
  {
    id: "CS-003-2024", fieldId: "FLD-003-1", farmerId: "F-003", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 16.5, fertilizerKgHa: 55, seedKgHa: 180,
    declaredSowingDate: "2024-05-08",
    subsidyTenge: 22_500_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-003-2024", fetchedAt: T },
    yieldSource: { source: "STAT",   docId: "BNS-12-2024-CS-003",  fetchedAt: T },
  },
  // F-004 — Акмола: посев заявлен 28 апреля при прогреве почвы 22 мая → фрод
  {
    id: "CS-004-2024", fieldId: "FLD-004-1", farmerId: "F-004", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 14.8, fertilizerKgHa: 50, seedKgHa: 175,
    declaredSowingDate: "2024-04-28",
    subsidyTenge: 35_000_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-004-2024", fetchedAt: T },
    yieldSource: { source: "STAT",   docId: "BNS-01-2024-CS-004",  fetchedAt: T },
  },
  // F-005 — Костанай: P=8, Cu=0.05 (дефицит), заявил 16.0 ц/га → фрод (и моисчуре, и агрохим)
  {
    id: "CS-005-2024", fieldId: "FLD-005-1", farmerId: "F-005", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 16.0, fertilizerKgHa: 60, seedKgHa: 180,
    declaredSowingDate: "2024-05-04",
    subsidyTenge: 36_500_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-005-2024", fetchedAt: T },
    yieldSource: { source: "STAT",   docId: "BNS-12-2024-CS-005",  fetchedAt: T },
  },
  // F-006 — норма
  {
    id: "CS-006-2024", fieldId: "FLD-006-1", farmerId: "F-006", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 11.6, fertilizerKgHa: 42, seedKgHa: 175,
    declaredSowingDate: "2024-05-10",
    subsidyTenge: 12_000_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-006-2024", fetchedAt: T },
    yieldSource: { source: "STAT",   docId: "BNS-15-2024-CS-006",  fetchedAt: T },
  },
  // F-014 — норма по полю (фрод у этого фермера на стороне скота)
  {
    id: "CS-014-2024", fieldId: "FLD-014-1", farmerId: "F-014", year: 2024,
    crop: "wheat_spring",
    declaredYieldCha: 12.4, fertilizerKgHa: 46, seedKgHa: 175,
    declaredSowingDate: "2024-05-11",
    subsidyTenge: 17_000_000,
    declSource:  { source: "QOLDAU", docId: "QO-FERT-CS-014-2024", fetchedAt: T },
    yieldSource: { source: "STAT",   docId: "BNS-15-2024-CS-014",  fetchedAt: T },
  },
];

export function fieldFor(farmerId: string): Field | undefined {
  return FIELDS.find((f) => f.farmerId === farmerId);
}

export function seasonFor(farmerId: string, year = 2024): CropSeason | undefined {
  return CROP_SEASONS.find((s) => s.farmerId === farmerId && s.year === year);
}
