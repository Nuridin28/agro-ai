// Серверная логика по заявкам/субсидиям. Импортирует verify и mock-данные,
// поэтому НЕ должна попадать в клиентский бандл.
// Чистые константы (типы, лейблы, цвета плашки) — в ./subsidy-categories.ts.

import type { SourceRef } from "./sources";
import { fieldFor, seasonFor } from "./mock/crop";
import { herdFor, bullsFor, saleDeclarationFor } from "./mock/livestock";
import { CROP_LABEL } from "./types";
import { verifyFarmer } from "./verify";
import {
  type SubsidyCategory,
  type ApplicationStatus,
  categoryForFinding,
} from "./subsidy-categories";

// Реэкспорт констант, чтобы старые импорты `from "@/lib/subsidies"` продолжали работать.
export {
  type SubsidyCategory,
  type ApplicationStatus,
  SUBSIDY_CATEGORY_LABEL,
  SUBSIDY_CATEGORY_GROUP,
  SUBSIDY_CATEGORY_BADGE,
  FINDING_TO_CATEGORY,
  categoryForFinding,
} from "./subsidy-categories";

export interface SubsidyApplication {
  id: string;
  category: SubsidyCategory;
  type: string;
  scope: string;
  amount: number;
  // Оценка риска по этой заявке — берётся из движка верификации (риск-тенге, привязанный к коду нарушения)
  riskTenge: number;
  status: ApplicationStatus;
  date: string;
  source?: SourceRef;
  farmerId: string;
}

// Собирает реестр заявок по фермеру из мок-источников.
// Возвращает заявки с категорией и привязанным к ней риском.
export function buildFarmerApplications(farmerId: string): SubsidyApplication[] {
  const field = fieldFor(farmerId);
  const season = seasonFor(farmerId);
  const herd = herdFor(farmerId);
  const bulls = bullsFor(farmerId);
  const sale = saleDeclarationFor(farmerId);
  const verdict = verifyFarmer(farmerId);

  const riskByCategory: Record<string, number> = {};
  for (const f of verdict.findings) {
    const cat = categoryForFinding(f.code);
    if (!cat) continue;
    riskByCategory[cat] = (riskByCategory[cat] ?? 0) + (f.riskTenge ?? 0);
  }

  const apps: SubsidyApplication[] = [];

  if (season && field) {
    const overclaim = verdict.findings.some(
      (f) => f.code === "CROP_BIOLOGICAL_CEILING" || f.code === "CROP_MOISTURE_INCONSISTENCY" || f.code === "CROP_AGROCHEM_DEFICIT",
    );
    apps.push({
      id: `APP-${season.id}`,
      category: "fertilizer",
      type: "Субсидия за удобрения",
      scope: `${CROP_LABEL[season.crop]} · поле ${field.cadastralNumber} · ${field.areaHa} га · ${season.fertilizerKgHa} кг/га`,
      amount: season.subsidyTenge,
      riskTenge: riskByCategory["fertilizer"] ?? 0,
      status: overclaim ? "Запрос документов" : "Принята",
      date: `${season.year}-06-15`,
      source: season.declSource,
      farmerId,
    });
  }
  if (herd) {
    const reproBad = verdict.findings.some((f) => f.code === "LIV_BULL_REPRO_GAP");
    const adgBad = verdict.findings.some((f) => f.code === "LIV_ADG_OVER_CEILING");
    const vetBad = verdict.findings.some((f) => f.code === "LIV_VET_GAP");
    const winterBad = verdict.findings.some((f) => f.code === "LIV_WINTER_FEED_GAP");

    apps.push({
      id: `APP-FEED-${herd.id}`,
      category: "feed",
      type: "Субсидия на корма",
      scope: `Поголовье ${herd.cowsHead + herd.bullsHead} гол. · ${herd.feedSubsidyKgPerHead} кг/гол`,
      amount: Math.round(herd.subsidyTenge * 0.4),
      riskTenge: riskByCategory["feed"] ?? 0,
      status: vetBad ? "Запрос документов" : winterBad ? "На проверке" : "Принята",
      date: `${herd.year}-04-20`,
      source: herd.qoldauSource,
      farmerId,
    });
    if (sale) {
      apps.push({
        id: `APP-WEIGHT-${herd.id}`,
        category: "weight_realization",
        type: "Субсидия за фактически набранный вес",
        scope: `${herd.soldHead} гол. на убой · средний вес ${sale.declaredWeightKg} кг (заявлено)`,
        amount: Math.round(herd.subsidyTenge * 0.4),
        riskTenge: riskByCategory["weight_realization"] ?? 0,
        status: sale.declaredWeightKg > herd.avgSaleWeightKg + 30 ? "Отклонена" : adgBad ? "Запрос документов" : "Принята",
        date: `${herd.year}-11-05`,
        source: sale.source,
        farmerId,
      });
    }
    if (bulls.length > 0) {
      const totalBullSub = bulls.reduce((s, b) => s + b.subsidyTenge, 0);
      apps.push({
        id: `APP-BULLS-${farmerId}`,
        category: "breeding",
        type: "Субсидия за племенных быков",
        scope: `${bulls.length} гол. племенных производителей`,
        amount: totalBullSub,
        riskTenge: riskByCategory["breeding"] ?? 0,
        status: reproBad ? "Запрос документов" : "Принята",
        date: bulls[0].purchasedAt,
        source: bulls[0].plemSource,
        farmerId,
      });
    }
  }

  apps.sort((a, b) => b.date.localeCompare(a.date));
  return apps;
}

export interface CategoryBreakdownRow {
  category: SubsidyCategory;
  applicationsCount: number;
  amount: number;
  riskTenge: number;
  // Сколько заявок в этой категории не «Принята» (на проверке/документы/отклонено)
  pendingCount: number;
}

export function breakdownByCategory(apps: SubsidyApplication[]): CategoryBreakdownRow[] {
  const map = new Map<SubsidyCategory, CategoryBreakdownRow>();
  for (const a of apps) {
    const cur = map.get(a.category) ?? {
      category: a.category, applicationsCount: 0, amount: 0, riskTenge: 0, pendingCount: 0,
    };
    cur.applicationsCount += 1;
    cur.amount += a.amount;
    cur.riskTenge += a.riskTenge;
    if (a.status !== "Принята") cur.pendingCount += 1;
    map.set(a.category, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
