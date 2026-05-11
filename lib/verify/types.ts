import type { SourceRef } from "../sources";

export type Severity = "ok" | "info" | "warn" | "high" | "critical";

// Сколько баллов каждая severity добавляет к riskScore. Сумма по всем
// findings капается в 100 (см. verify/index.ts) и используется
// decisionFromRisk() с порогами 15 / 35 / 65.
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  ok: 0, info: 5, warn: 15, high: 35, critical: 60,
};

export type CheckCode =
  // Земледелие
  | "CROP_BIOLOGICAL_CEILING"      // заявлено выше биологического потенциала
  | "CROP_REGIONAL_OUTLIER"        // на 30%+ выше соседей при общем падении
  | "CROP_MOISTURE_INCONSISTENCY"  // высокий урожай при дефиците влаги
  | "CROP_AGROCHEM_DEFICIT"        // P/K/микро дефицит → удобрения «не сработали бы»
  | "CROP_FERTILIZER_GAP"          // субсидия за удобрения, но низкая норма на га
  | "CROP_FAKE_SOWING"             // дата посева до прогрева почвы
  | "CROP_NO_VEGETATION"           // спутник: NDVI max < порога — посева не было
  | "CROP_LATE_GROWTH"             // спутник: рост стартовал заметно позже заявленного
  | "CROP_WEAK_VEGETATION"         // спутник: пик NDVI ниже норматива
  | "CROP_POST_SUBSIDY_INACTIVE"   // спутник: после выдачи субсидии — нет агроактивности
  | "CROP_HETEROGENEOUS_FIELD"     // спутник: высокая σ NDVI — мозаичная пашня
  | "CROP_SLOW_GROWTH"             // спутник: низкая скорость прироста NDVI при субсидии
  | "CROP_YOY_DECLINE"             // спутник: пик NDVI заметно ниже прошлогоднего
  | "CROP_HARVEST_DATE_MISMATCH"   // спутник: заявленная дата уборки расходится с NDVI-событием > 30 дн.
  | "CROP_HARVEST_DATE_DRIFT"      // спутник: расхождение даты уборки 15–30 дн. (мягкое)
  | "CROP_NO_HARVEST_DETECTED"     // спутник: NDVI рос и достиг пика, но падения биомассы в окне не было
  | "CROP_SAR_HARVEST_MISMATCH"    // SAR: дата уборки по падению VH расходится с заявленной > 30 дн.
  | "CROP_SAR_FIELD_INACTIVE"      // SAR: σ VH за сезон < порога — поле спит весь сезон
  | "CROP_SAR_NO_TILLAGE"          // SAR: нет всплеска VV в весеннем окне — не пахали
  | "CROP_HARVEST_CROSS_VALIDATED" // NDVI+SAR согласованно показывают расхождение даты уборки → высокий confidence
  | "CROP_SAR_MULTIPLE_HARVESTS"   // SAR: > 1 события уборки за сезон (многоукос — допустимо, но проверить категорию субсидии)
  | "CROP_SAR_SMALL_FIELD"         // SAR: поле меньше порога надёжности (< 50 пикселей), сигнал шумит
  | "CROP_AREA_MISMATCH"           // расхождение заявленной площади с геодезической из polygon4326 > 30 %
  | "CROP_COHERENCE_FIELD_STABLE"  // CCD: γ стабильно высокая весь сезон — поле точно не работало
  | "CROP_COHERENCE_EVENT"         // CCD: зафиксировано падение γ — изменение поверхности
  | "CROP_TRIPLE_VALIDATED"        // NDVI + SAR + Coherence все согласны — максимальная уверенность
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
