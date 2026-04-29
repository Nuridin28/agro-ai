import type { SourceRef } from "../sources";

export type Severity = "ok" | "info" | "warn" | "high" | "critical";

export type CheckCode =
  // Земледелие
  | "CROP_BIOLOGICAL_CEILING"      // заявлено выше биологического потенциала
  | "CROP_REGIONAL_OUTLIER"        // на 30%+ выше соседей при общем падении
  | "CROP_MOISTURE_INCONSISTENCY"  // высокий урожай при дефиците влаги
  | "CROP_AGROCHEM_DEFICIT"        // P/K/микро дефицит → удобрения «не сработали бы»
  | "CROP_FERTILIZER_GAP"          // субсидия за удобрения, но низкая норма на га
  | "CROP_FAKE_SOWING"             // дата посева до прогрева почвы
  // Скотоводство
  | "LIV_BULL_REPRO_GAP"           // быки куплены — приплода нет
  | "LIV_GENETIC_NO_GAIN"          // нет прироста привеса от племенных быков
  | "LIV_ADG_OVER_CEILING"         // заявленный привес > биологического
  | "LIV_FEED_TO_GROWTH"           // кормов мало, привес высокий
  | "LIV_PASTURE_OVERLOAD"         // нагрузка на пастбище > нормы Гипрозема
  | "LIV_WINTER_FEED_GAP"          // суровая зима — нулевой падёж и мало кормов
  | "LIV_VET_GAP"                  // нет вакцинации, но есть субсидии на корм
  | "LIV_SALE_WEIGHT_FRAUD";       // субсидия по бóльшему весу, чем реализовано

export interface Evidence {
  label: string;
  value: string;
  source: SourceRef;
}

export interface Finding {
  code: CheckCode;
  severity: Severity;
  title: string;
  detail: string;
  evidence: Evidence[];
  expected?: string;       // ожидаемое значение (норма / эталон)
  actual?: string;         // фактически наблюдаемое
  riskTenge?: number;      // потенциальный объём фрода в тенге
}

export interface FarmerVerdict {
  farmerId: string;
  efficiencyScore: number;          // 0..100, конвертация субсидий в результат
  riskScore: number;                // 0..100, агрегированный риск нарушений
  decision: "clear" | "review" | "audit" | "recovery";
  findings: Finding[];
  totalSubsidyTenge: number;
  totalRiskTenge: number;
  modules: ("crop" | "livestock")[];
}
