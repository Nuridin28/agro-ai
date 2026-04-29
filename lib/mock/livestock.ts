import type { Pasture, BreedingBull, HerdYear } from "../types";
import { findFarmer } from "./farmers";

const T = "2025-09-25T10:00:00Z";
const region = (id: string) => findFarmer(id)!.region;

// ─── Пастбища (ЕГКН + Гипрозем для нагрузки) ───
export const PASTURES: Pasture[] = [
  {
    id: "PST-007", farmerId: "F-007",
    cadastralNumber: "12-203-201-014", areaHa: 800,
    vegetationType: "лугово_степная", bonitet: 55, carryingCapacityHeadHa: 0.6,
    region: region("F-007"),
    source:         { source: "EGKN",     docId: "EGKN-12-203-201-014", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-12-203-201",   fetchedAt: T, note: "Норма нагрузки по типу растительности" },
  },
  {
    id: "PST-008", farmerId: "F-008",
    cadastralNumber: "16-178-405-008", areaHa: 1500,
    vegetationType: "степь_злаковая", bonitet: 50, carryingCapacityHeadHa: 0.5,
    region: region("F-008"),
    source:         { source: "EGKN",     docId: "EGKN-16-178-405-008", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-16-178-405",   fetchedAt: T },
  },
  {
    id: "PST-009", farmerId: "F-009",
    cadastralNumber: "03-216-310-022", areaHa: 200,
    vegetationType: "полупустыня", bonitet: 35, carryingCapacityHeadHa: 0.4,
    region: region("F-009"),
    source:         { source: "EGKN",     docId: "EGKN-03-216-310-022", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-03-216-310",   fetchedAt: T },
  },
  {
    id: "PST-010", farmerId: "F-010",
    cadastralNumber: "15-189-302-019", areaHa: 600,
    vegetationType: "лугово_степная", bonitet: 45, carryingCapacityHeadHa: 0.5,
    region: region("F-010"),
    source:         { source: "EGKN",     docId: "EGKN-15-189-302-019", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-15-189-302",   fetchedAt: T },
  },
  {
    id: "PST-011", farmerId: "F-011",
    cadastralNumber: "16-178-411-005", areaHa: 100,
    vegetationType: "полупустыня", bonitet: 38, carryingCapacityHeadHa: 0.45,
    region: region("F-011"),
    source:         { source: "EGKN",     docId: "EGKN-16-178-411-005", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-16-178-411",   fetchedAt: T, note: "Эталон 0.45 гол/га для полупустынного типа" },
  },
  {
    id: "PST-012", farmerId: "F-012",
    cadastralNumber: "07-242-208-031", areaHa: 1000,
    vegetationType: "степь_злаковая", bonitet: 42, carryingCapacityHeadHa: 0.5,
    region: region("F-012"),
    source:         { source: "EGKN",     docId: "EGKN-07-242-208-031", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-07-242-208",   fetchedAt: T },
  },
  {
    id: "PST-013", farmerId: "F-013",
    cadastralNumber: "14-197-115-006", areaHa: 750,
    vegetationType: "степь_злаковая", bonitet: 47, carryingCapacityHeadHa: 0.55,
    region: region("F-013"),
    source:         { source: "EGKN",     docId: "EGKN-14-197-115-006", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-14-197-115",   fetchedAt: T },
  },
  {
    id: "PST-014", farmerId: "F-014",
    cadastralNumber: "15-189-308-002", areaHa: 250,
    vegetationType: "лугово_степная", bonitet: 50, carryingCapacityHeadHa: 0.6,
    region: region("F-014"),
    source:         { source: "EGKN",     docId: "EGKN-15-189-308-002", fetchedAt: T },
    giprozemSource: { source: "GIPROZEM", docId: "GZ-PST-15-189-308",   fetchedAt: T },
  },
];

// ─── Племенные быки (Plem.kz) — у Племкора (F-010) куплено 5 быков с большой субсидией ───
export const BULLS: BreedingBull[] = [
  // F-007 — норма
  ...["KZ700001", "KZ700002", "KZ700003", "KZ700004", "KZ700005", "KZ700006", "KZ700007", "KZ700008"].map<BreedingBull>(inj => ({
    inj, farmerId: "F-007", breed: "auliekol",
    purchasedAt: "2022-03-12", costTenge: 2_800_000, subsidyTenge: 1_400_000,
    plemCertId: `PLEM-AK-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,            fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-AK-${inj}`,        fetchedAt: T, note: "Свидетельство о племенной ценности" },
  })),
  // F-008 — норма (ангус, 14 голов)
  ...Array.from({ length: 14 }, (_, i) => `KZ800${String(i + 1).padStart(3, "0")}`).map<BreedingBull>(inj => ({
    inj, farmerId: "F-008", breed: "angus",
    purchasedAt: "2021-08-04", costTenge: 4_500_000, subsidyTenge: 2_250_000,
    plemCertId: `PLEM-AN-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-AN-${inj}`, fetchedAt: T },
  })),
  // F-009 — 2 быка, симменталы
  ...["KZ900101", "KZ900102"].map<BreedingBull>(inj => ({
    inj, farmerId: "F-009", breed: "simmental",
    purchasedAt: "2023-04-10", costTenge: 5_000_000, subsidyTenge: 2_500_000,
    plemCertId: `PLEM-SM-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-SM-${inj}`, fetchedAt: T },
  })),
  // F-010 — 5 быков, казахская белоголовая, всего на 25 млн субсидий
  ...["KZ010201", "KZ010202", "KZ010203", "KZ010204", "KZ010205"].map<BreedingBull>(inj => ({
    inj, farmerId: "F-010", breed: "kazakh_white_head",
    purchasedAt: "2023-05-22", costTenge: 9_500_000, subsidyTenge: 5_000_000,
    plemCertId: `PLEM-KB-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-KB-${inj}`, fetchedAt: T },
  })),
  // F-011 — 7 голов герефорд
  ...Array.from({ length: 7 }, (_, i) => `KZ011${String(i + 1).padStart(3, "0")}`).map<BreedingBull>(inj => ({
    inj, farmerId: "F-011", breed: "hereford",
    purchasedAt: "2022-10-01", costTenge: 4_200_000, subsidyTenge: 2_100_000,
    plemCertId: `PLEM-HF-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-HF-${inj}`, fetchedAt: T },
  })),
  // F-012 — 11 ангусов
  ...Array.from({ length: 11 }, (_, i) => `KZ012${String(i + 1).padStart(3, "0")}`).map<BreedingBull>(inj => ({
    inj, farmerId: "F-012", breed: "angus",
    purchasedAt: "2022-06-18", costTenge: 4_400_000, subsidyTenge: 2_200_000,
    plemCertId: `PLEM-AN-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-AN-${inj}`, fetchedAt: T },
  })),
  // F-013 — 6 герефорд
  ...Array.from({ length: 6 }, (_, i) => `KZ013${String(i + 1).padStart(3, "0")}`).map<BreedingBull>(inj => ({
    inj, farmerId: "F-013", breed: "hereford",
    purchasedAt: "2021-09-09", costTenge: 4_000_000, subsidyTenge: 2_000_000,
    plemCertId: `PLEM-HF-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-HF-${inj}`, fetchedAt: T },
  })),
  // F-014 — 3 казахских
  ...Array.from({ length: 3 }, (_, i) => `KZ014${String(i + 1).padStart(3, "0")}`).map<BreedingBull>(inj => ({
    inj, farmerId: "F-014", breed: "kazakh_white_head",
    purchasedAt: "2022-11-22", costTenge: 3_800_000, subsidyTenge: 1_900_000,
    plemCertId: `PLEM-KB-${inj}`,
    source:     { source: "ISG",  docId: `ISG-${inj}`,     fetchedAt: T },
    plemSource: { source: "PLEM", docId: `PLEM-KB-${inj}`, fetchedAt: T },
  })),
];

// ─── Стадо в разрезе года (год 2024) ───
export const HERDS: HerdYear[] = [
  // F-007 — Аулиекольская, чистый
  {
    id: "HRD-007-2024", farmerId: "F-007", year: 2024,
    cowsHead: 200, bullsHead: 8, calvesBornHead: 170, mortalityHead: 6,
    soldHead: 50, avgSaleWeightKg: 480, declaredAdgKgDay: 1.10,
    feedSubsidyKgPerHead: 320, vaccinationCoveragePct: 100, pastureFieldId: "PST-007",
    subsidyTenge: 12_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F007-2024", fetchedAt: T },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F007-2024", fetchedAt: T, note: "Журнал вакцинаций ящур+бруцеллёз" },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F007-2024", fetchedAt: T },
  },
  // F-008 — Ангус, чистый
  {
    id: "HRD-008-2024", farmerId: "F-008", year: 2024,
    cowsHead: 350, bullsHead: 14, calvesBornHead: 305, mortalityHead: 14,
    soldHead: 90, avgSaleWeightKg: 540, declaredAdgKgDay: 1.25,
    feedSubsidyKgPerHead: 360, vaccinationCoveragePct: 100, pastureFieldId: "PST-008",
    subsidyTenge: 22_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F008-2024", fetchedAt: T },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F008-2024", fetchedAt: T },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F008-2024", fetchedAt: T },
  },
  // F-009 — заявленный ADG 2.8 кг/сут — выше биологического потолка 1.65 у симменталки → фрод
  {
    id: "HRD-009-2024", farmerId: "F-009", year: 2024,
    cowsHead: 60, bullsHead: 2, calvesBornHead: 48, mortalityHead: 3,
    soldHead: 40, avgSaleWeightKg: 580, declaredAdgKgDay: 2.80,
    feedSubsidyKgPerHead: 280, vaccinationCoveragePct: 95, pastureFieldId: "PST-009",
    subsidyTenge: 18_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F009-2024", fetchedAt: T },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F009-2024", fetchedAt: T },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F009-2024", fetchedAt: T },
  },
  // F-010 — куплено 5 быков, выход телят всего 43/100 → фрод
  {
    id: "HRD-010-2024", farmerId: "F-010", year: 2024,
    cowsHead: 220, bullsHead: 5, calvesBornHead: 95, mortalityHead: 8,
    soldHead: 45, avgSaleWeightKg: 460, declaredAdgKgDay: 1.00,
    feedSubsidyKgPerHead: 340, vaccinationCoveragePct: 100, pastureFieldId: "PST-010",
    subsidyTenge: 35_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F010-2024", fetchedAt: T },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F010-2024", fetchedAt: T },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F010-2024", fetchedAt: T },
  },
  // F-011 — 187 голов на пастбище 100га × 0.45 = 45 голов потолок → фрод
  {
    id: "HRD-011-2024", farmerId: "F-011", year: 2024,
    cowsHead: 180, bullsHead: 7, calvesBornHead: 152, mortalityHead: 8,
    soldHead: 35, avgSaleWeightKg: 510, declaredAdgKgDay: 1.15,
    feedSubsidyKgPerHead: 200, vaccinationCoveragePct: 90, pastureFieldId: "PST-011",
    subsidyTenge: 14_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F011-2024", fetchedAt: T },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F011-2024", fetchedAt: T },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F011-2024", fetchedAt: T },
  },
  // F-012 — Vaccination 35% → vet gap, тогда как корм субсидирован
  {
    id: "HRD-012-2024", farmerId: "F-012", year: 2024,
    cowsHead: 280, bullsHead: 11, calvesBornHead: 240, mortalityHead: 10,
    soldHead: 70, avgSaleWeightKg: 530, declaredAdgKgDay: 1.20,
    feedSubsidyKgPerHead: 300, vaccinationCoveragePct: 35, pastureFieldId: "PST-012",
    subsidyTenge: 19_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F012-2024", fetchedAt: T },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F012-2024", fetchedAt: T, note: "Низкий охват вакцинации" },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F012-2024", fetchedAt: T },
  },
  // F-013 — экстремальная зима -42, нулевой падёж, мизерный кормовой бюджет → фрод
  {
    id: "HRD-013-2024", farmerId: "F-013", year: 2024,
    cowsHead: 150, bullsHead: 6, calvesBornHead: 125, mortalityHead: 0,
    soldHead: 40, avgSaleWeightKg: 440, declaredAdgKgDay: 1.05,
    feedSubsidyKgPerHead: 180, vaccinationCoveragePct: 95, pastureFieldId: "PST-013",
    subsidyTenge: 11_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F013-2024", fetchedAt: T, note: "Падеж 0 при зиме -42°C" },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F013-2024", fetchedAt: T },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F013-2024", fetchedAt: T },
  },
  // F-014 — заявил вес продажи 540 кг для субсидии, в ИСЖ зафиксировано 450 → фрод
  {
    id: "HRD-014-2024", farmerId: "F-014", year: 2024,
    cowsHead: 80, bullsHead: 3, calvesBornHead: 62, mortalityHead: 3,
    soldHead: 25, avgSaleWeightKg: 450, declaredAdgKgDay: 1.10,
    feedSubsidyKgPerHead: 310, vaccinationCoveragePct: 100, pastureFieldId: "PST-014",
    subsidyTenge: 15_000_000,
    source:        { source: "ISG",    docId: "ISG-HRD-F014-2024", fetchedAt: T, note: "Факт средний живой вес при реализации" },
    vetSource:     { source: "VETIS",  docId: "VET-HRD-F014-2024", fetchedAt: T },
    qoldauSource:  { source: "QOLDAU", docId: "QO-FEED-F014-2024", fetchedAt: T },
  },
];

// Заявленный для субсидии вес реализации (отдельная заявка через Qoldau).
// Для F-014 он ВЫШЕ фактического в ИСЖ — это и есть фрод-кейс.
export const SALE_DECLARATIONS: { farmerId: string; year: number; declaredWeightKg: number; source: { source: "QOLDAU"; docId: string; fetchedAt: string } }[] = [
  { farmerId: "F-007", year: 2024, declaredWeightKg: 480, source: { source: "QOLDAU", docId: "QO-SALE-F007-2024", fetchedAt: T } },
  { farmerId: "F-008", year: 2024, declaredWeightKg: 540, source: { source: "QOLDAU", docId: "QO-SALE-F008-2024", fetchedAt: T } },
  { farmerId: "F-009", year: 2024, declaredWeightKg: 580, source: { source: "QOLDAU", docId: "QO-SALE-F009-2024", fetchedAt: T } },
  { farmerId: "F-010", year: 2024, declaredWeightKg: 460, source: { source: "QOLDAU", docId: "QO-SALE-F010-2024", fetchedAt: T } },
  { farmerId: "F-011", year: 2024, declaredWeightKg: 510, source: { source: "QOLDAU", docId: "QO-SALE-F011-2024", fetchedAt: T } },
  { farmerId: "F-012", year: 2024, declaredWeightKg: 530, source: { source: "QOLDAU", docId: "QO-SALE-F012-2024", fetchedAt: T } },
  { farmerId: "F-013", year: 2024, declaredWeightKg: 440, source: { source: "QOLDAU", docId: "QO-SALE-F013-2024", fetchedAt: T } },
  { farmerId: "F-014", year: 2024, declaredWeightKg: 540, source: { source: "QOLDAU", docId: "QO-SALE-F014-2024", fetchedAt: T } },
];

export function herdFor(farmerId: string, year = 2024): HerdYear | undefined {
  return HERDS.find((h) => h.farmerId === farmerId && h.year === year);
}

export function pastureFor(farmerId: string): Pasture | undefined {
  return PASTURES.find((p) => p.farmerId === farmerId);
}

export function bullsFor(farmerId: string): BreedingBull[] {
  return BULLS.filter((b) => b.farmerId === farmerId);
}

export function saleDeclarationFor(farmerId: string, year = 2024) {
  return SALE_DECLARATIONS.find((s) => s.farmerId === farmerId && s.year === year);
}
