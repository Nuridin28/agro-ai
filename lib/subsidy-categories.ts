// Константы и типы по категориям субсидий.
// Этот файл намеренно НЕ импортирует ничего из ./verify или ./mock —
// его подключают и серверные, и клиентские модули (CategoryBadge в ui.tsx).
// Любая логика работы с заявками — в ./subsidies.ts (только серверная).

export type SubsidyCategory =
  | "fertilizer"          // удешевление мин.удобрений
  | "seeds"               // элитные семена / саженцы
  | "pesticides"          // СЗР и биоагенты
  | "irrigation"          // подача поливной воды
  | "insurance"           // агрострахование
  | "transport"           // транспортные расходы
  | "machinery"           // инвестсубсидии: техника, теплицы, хранилища
  | "feed"                // корма для скота
  | "breeding"            // племенной скот
  | "weight_realization"; // фактически набранный вес при реализации

export const SUBSIDY_CATEGORY_LABEL: Record<SubsidyCategory, string> = {
  fertilizer:         "Удобрения",
  seeds:              "Семена/саженцы",
  pesticides:         "СЗР и биоагенты",
  irrigation:         "Поливная вода",
  insurance:          "Агрострахование",
  transport:          "Транспорт",
  machinery:          "Техника/инфраструктура",
  feed:               "Корма",
  breeding:           "Племенной скот",
  weight_realization: "Реализация на убой",
};

export const SUBSIDY_CATEGORY_GROUP: Record<SubsidyCategory, "crop" | "livestock" | "shared"> = {
  fertilizer: "crop", seeds: "crop", pesticides: "crop",
  irrigation: "shared", insurance: "shared", transport: "shared", machinery: "shared",
  feed: "livestock", breeding: "livestock", weight_realization: "livestock",
};

export const SUBSIDY_CATEGORY_BADGE: Record<SubsidyCategory, string> = {
  fertilizer:         "bg-emerald-50 text-emerald-900 border-emerald-200",
  seeds:              "bg-lime-50 text-lime-900 border-lime-200",
  pesticides:         "bg-teal-50 text-teal-900 border-teal-200",
  irrigation:         "bg-sky-50 text-sky-900 border-sky-200",
  insurance:          "bg-indigo-50 text-indigo-900 border-indigo-200",
  transport:          "bg-slate-50 text-slate-900 border-slate-200",
  machinery:          "bg-violet-50 text-violet-900 border-violet-200",
  feed:               "bg-amber-50 text-amber-900 border-amber-200",
  breeding:           "bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200",
  weight_realization: "bg-rose-50 text-rose-900 border-rose-200",
};

export type ApplicationStatus = "Принята" | "На проверке" | "Запрос документов" | "Отклонена";

// Привязка кода правила верификации к категории субсидии (для аналитики «риск по типу»).
export const FINDING_TO_CATEGORY: Record<string, SubsidyCategory> = {
  CROP_BIOLOGICAL_CEILING:     "fertilizer",
  CROP_REGIONAL_OUTLIER:       "fertilizer",
  CROP_MOISTURE_INCONSISTENCY: "fertilizer",
  CROP_AGROCHEM_DEFICIT:       "fertilizer",
  CROP_FERTILIZER_GAP:         "fertilizer",
  CROP_FAKE_SOWING:            "seeds",
  CROP_NO_VEGETATION:          "seeds",
  CROP_LATE_GROWTH:            "seeds",
  CROP_WEAK_VEGETATION:        "fertilizer",
  CROP_POST_SUBSIDY_INACTIVE:  "fertilizer",
  CROP_HETEROGENEOUS_FIELD:    "seeds",
  CROP_SLOW_GROWTH:            "fertilizer",
  CROP_YOY_DECLINE:            "fertilizer",
  LIV_BULL_REPRO_GAP:          "breeding",
  LIV_GENETIC_NO_GAIN:         "breeding",
  LIV_ADG_OVER_CEILING:        "weight_realization",
  LIV_FEED_TO_GROWTH:          "feed",
  LIV_PASTURE_OVERLOAD:        "feed",
  LIV_WINTER_FEED_GAP:         "feed",
  LIV_VET_GAP:                 "feed",
  LIV_SALE_WEIGHT_FRAUD:       "weight_realization",
};

export function categoryForFinding(code: string): SubsidyCategory | undefined {
  return FINDING_TO_CATEGORY[code];
}
