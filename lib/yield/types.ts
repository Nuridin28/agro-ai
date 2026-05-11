// ────────────────────────────────────────────────────────────────────────────
// Типы модели прогноза урожайности STEPPE-Y v0.1
//
// Формула:
//   Y_final = Y_potential × Kw × Ks × Kd_adv × K_spray × K_nutrition × K_harvest × Cregion
//
// Поверх — Monte Carlo для P10/P50/P90 + peer-comparison для отличия
// «фермер плохой» от «погода плохая».
//
// Принципы (из проектных требований):
//  - Y_potential capped по БНС-исторической огибающей (не сырой Monteith).
//  - Kw триангулируется из 3+ источников (FAO bucket, SMAP, NDVI-валидация).
//  - Kd в первый сезон = advisory (=1.0), активируется после scout-валидации.
//  - K_spray из декларации + Qoldau, НЕ из спутника.
//  - Cregion жёсткий cap [0.85, 1.15].
//  - Везде provenance trail до источника.
// ────────────────────────────────────────────────────────────────────────────

import type { Crop, Field, CropSeason, MeteoSeason } from "../types";
import type { SourceRef } from "../sources";

// ────────────────────────────────────────────────────────────────────────────
// Сорт внутри культуры — главный носитель параметров RUE/HI/устойчивости.
// Для одной культуры может быть много сортов. При неизвестном сорте — берём
// "default_<crop>" с медианными параметрами и широким интервалом.
// ────────────────────────────────────────────────────────────────────────────

export type SortId = string;  // напр. "wheat_spring/stepnaya_50", "lentil/red_chief"

export interface SortParams {
  id: SortId;
  crop: Crop;
  displayName: string;
  // RUE — Radiation Use Efficiency, г сухой биомассы / МДж PAR.
  // Для C3-зерновых типично 1.1–1.5; для бобовых 0.9–1.2.
  rueGramsPerMJ: number;
  // HI — Harvest Index, доля зерна в общей биомассе. 0..1.
  harvestIndex: number;
  // Срок созревания — средний для сорта в днях от посева до зрелости.
  daysToMaturity: number;
  // Устойчивость к ключевым болезням, 0..1 (1 = иммунный).
  diseaseResistance: Partial<{
    yellow_rust: number;
    stem_rust: number;
    septoria: number;
    tan_spot: number;
    fhb: number;
    ascochyta: number;          // для бобовых
    lentil_rust: number;
  }>;
  // Опционально — обоснование цифр (для provenance).
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Фазы роста и водная чувствительность (Doorenbos-Kassam ky).
// Доли — фракции от полного цикла "сев → созревание".
// ────────────────────────────────────────────────────────────────────────────

export type Phase = "germination" | "vegetative" | "flowering" | "grainFill" | "maturity";

export interface PhasePlan {
  phase: Phase;
  fraction: number;  // доля от daysToMaturity, 0..1; сумма всех = 1.0
  ky: number;        // Doorenbos-Kassam коэффициент чувствительности к воде
  kc: number;        // crop coefficient для ET0 → ETm (FAO-56)
}

// ────────────────────────────────────────────────────────────────────────────
// Вход модели — что должен собрать caller перед вызовом predictYield().
// ────────────────────────────────────────────────────────────────────────────

export interface SeasonWeather {
  // Снежный экв. в марте, мм (water equivalent).
  swEqMm: number;
  // Эффективность снеготаяния (доля воды попавшей в почву). 0.3–0.7 для степи.
  snowmeltEfficiency?: number;
  // Дата прогрева почвы +8°C на глубину заделки.
  soilWarmDate?: string;
  // Помесячные осадки за апрель..сентябрь, мм.
  monthlyPrecipMm: { month: number; mm: number }[];
  // Помесячное ET0 (Penman-Monteith из t°, RH, ветра, радиации), мм.
  monthlyET0Mm: { month: number; mm: number }[];
  // Σ IPAR за вегетационный сезон, МДж/м² — для расчёта Y_potential.
  sumIPARMJm2: number;
  // События экстремумов (для Ks).
  daysTmaxOver32: number;   // в фазу колошения
  daysTmaxOver35: number;   // в фазу налива
  daysTminBelowMinus2AfterMay1: number;  // возвратные заморозки
  daysWindOver17: number;   // чёрные бури
  hailReported: boolean;    // декларация + NDVI верификация
}

export interface FieldDeclaration {
  sowingDate: string;             // фактическая дата посева
  harvestDate?: string;           // если уже убрано (или плановая)
  fertilizerNKgHa: number;        // внесено N
  fertilizerPKgHa: number;        // внесено P
  fertilizerKKgHa: number;        // внесено K
  herbicideApplied: {
    declared: boolean;
    date?: string;
    qoldauVerified: boolean;       // есть ли чек в Qoldau
  };
  fungicideApplied: {
    declared: boolean;
    date?: string;
    qoldauVerified: boolean;
  };
  declaredYieldCha?: number;       // если фермер уже заявил
  sortId?: SortId;                 // выбранный сорт
}

// Соседи для peer-comparison: их фактические урожаи в этом сезоне.
// Берутся из БНС-агрегата района или из реестра ближайших полей того же
// сезона с похожими условиями.
export interface PeerContext {
  rayonAverage?: number;           // ц/га, средняя по району в этом сезоне
  peerYields?: number[];           // массив urожайностей соседних полей
  peerCount?: number;              // сколько полей в выборке
}

// Региональная калибровка из БНС.
export interface RegionalCalibration {
  oblast: string;
  rayon: string;
  // Среднее (Yactual_БНС / Ymodel) за последние 3 сезона. Cap [0.85, 1.15].
  factor: number;
  // Сколько сезонов вошло в среднее (1–3). При < 3 — выдавать как low confidence.
  yearsAveraged: number;
  source: SourceRef;
}

// Главный вход.
export interface YieldPredictionInput {
  field: Field;
  season: { year: number; crop: Crop };
  weather: SeasonWeather;
  declaration: FieldDeclaration;
  peer?: PeerContext;
  regional?: RegionalCalibration;
  // Историческая огибающая для cap-а Y_potential.
  bnsHistoricalMaxCha?: number;
  // Перекрытие сортовых параметров (если решили задать вручную).
  sortOverride?: SortParams;
}

// ────────────────────────────────────────────────────────────────────────────
// Выходы — отдельные компоненты и финальное число.
// Каждый компонент включает: значение, confidence (0..1), reasons[],
// и опционально range (min..max) для Monte Carlo.
// ────────────────────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low" | "unknown";

export interface ComponentResult {
  value: number;        // итоговый коэффициент
  confidence: Confidence;
  // ±σ для Monte Carlo, доля от value. Для известных формул ~0.05; для
  // шатких сигналов (Kw без триангуляции) ~0.20.
  sigmaRelative: number;
  reasons: string[];     // человеческое объяснение, попадает в provenance
  details?: Record<string, unknown>; // структурные детали для UI
}

export interface YieldPotentialResult extends ComponentResult {
  yPotentialRawCha: number;     // сырой Monteith до cap
  yPotentialCappedCha: number;  // финальное число (используется дальше)
  capApplied: boolean;
}

export interface KwResult extends ComponentResult {
  // Разбивка по фазам: ETa, ETm, доля стресса.
  phases: Array<{ phase: Phase; etaMm: number; etmMm: number; ratio: number; factor: number }>;
  // Триангуляция: значения из 3 источников и итог.
  triangulation: {
    bucket: number;             // FAO bucket-модель
    smap?: number;              // SMAP soil moisture (если доступно)
    ndviValidation?: number;    // оценка по пиковому NDVI
    median: number;             // что мы взяли (медиана из доступных)
  };
}

export interface KdResult extends ComponentResult {
  mode: "advisory" | "active";   // advisory — не режет урожай, только flag
  diseaseRisks: Array<{
    disease: string;
    riskScore: number;           // 0..1
    triggered: boolean;
  }>;
  recommendation?: string;       // что делать фермеру
}

export interface KSprayResult extends ComponentResult {
  herbicide: { status: "confirmed" | "partial" | "missing"; reasoning: string };
}

export interface KNutritionResult extends ComponentResult {
  byElement: Array<{ element: "N" | "P" | "K" | "micro"; effective: number; ratio: number; k: number }>;
}

export interface KHarvestResult extends ComponentResult {
  delayDays: number;
  lossPct: number;
  capped: boolean;
}

export interface KsResult extends ComponentResult {
  byStressor: Array<{ stressor: string; k: number }>;
}

export interface CregionResult extends ComponentResult {
  factor: number;
  fallback: boolean;             // true если БНС-данных нет, используем 1.0
}

export interface PeerComparisonResult {
  // Сравнительная картина — НЕ множитель в формуле, отдельный сигнал.
  fieldVsPeerDeltaCha: number | null;  // Y_predicted − Y_peer; null если peer нет
  fieldVsPeerDeltaPct: number | null;
  interpretation:
    | "no_peers"
    | "below_peers_significantly"   // > 20% хуже соседей при тех же условиях
    | "below_peers"
    | "in_line_with_peers"
    | "above_peers"
    | "above_peers_significantly";
  reasoning: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Итоговый результат — то, что отдаём в UI и в верификацию.
// ────────────────────────────────────────────────────────────────────────────

export interface YieldPrediction {
  // Финальные числа (ц/га).
  p10Cha: number;
  p50Cha: number;
  p90Cha: number;
  // Точечное значение (= p50, дублируется для удобства).
  pointEstimateCha: number;
  // Уверенность общая — минимум по компонентам.
  overallConfidence: Confidence;
  // Все 8 компонентов.
  components: {
    yPotential: YieldPotentialResult;
    kw: KwResult;
    ks: KsResult;
    kd: KdResult;
    kSpray: KSprayResult;
    kNutrition: KNutritionResult;
    kHarvest: KHarvestResult;
    cregion: CregionResult;
  };
  // 9-й сигнал — сравнение с соседями (НЕ в формуле, для интерпретации).
  peer: PeerComparisonResult;
  // Метаданные.
  modelVersion: string;
  computedAt: string;             // ISO timestamp
  sortUsed: SortParams;
}

// ────────────────────────────────────────────────────────────────────────────
// Утилиты, общие для всех модулей.
// ────────────────────────────────────────────────────────────────────────────

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export const MODEL_VERSION = "STEPPE-Y v0.1.0";

// Глобальные cap-ы для финального результата (sanity bounds).
export const Y_FINAL_MIN_CHA = 1.0;    // меньше — это уже точно не урожай
export const Y_FINAL_MAX_CHA = 80.0;   // больше — за пределами реальности РК

// Сезонные границы для степи РК (используются в Monte Carlo).
export const SEASON_START_DOY = 90;    // ~1 апреля
export const SEASON_END_DOY = 280;     // ~7 октября

// Reference-параметры для нормирования.
export const BONITET_REFERENCE = 50;
export const BONITET_MAX_FACTOR = 1.45;  // cap при черноземах (бонитет 100)
