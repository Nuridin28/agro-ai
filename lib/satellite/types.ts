// Типы модуля спутниковой верификации (NDVI / Sentinel-2).
//
// Идея: по полигону поля и временнóму окну вытягиваем временной ряд NDVI,
// извлекаем признаки (макс, ср, дата старта вегетации, дата пика) и
// применяем правила для определения посева/вегетации/фрода.
//
// Результат используется в двух режимах:
//  1) Прямая проверка по полигону через POST /api/satellite/verify (ТЗ)
//  2) Пост-субсидийная проверка «нет агроактивности» через
//     /api/satellite/cron (наша надстройка над ТЗ).

import type { SourceRef } from "../sources";

// ────────────────────────────────────────────────────────────────────────────
// Геометрия и временной ряд
// ────────────────────────────────────────────────────────────────────────────

// Полигон поля как массив [lon, lat]. Замыкать кольцо НЕ обязательно — закроем
// сами при необходимости. Поддерживаем только простой outer ring (без дырок).
export type FieldPolygon = Array<[number, number]>;

// Одна точка временного ряда NDVI: дата снимка + усреднённый NDVI по полигону.
// cloudCoverPct — процент облачности на тайле (если облака >70%, точка обычно
// исключается на стороне провайдера, но иногда полезно увидеть «зашумлённые»).
// stDev — пространственная вариация NDVI внутри поля на эту дату; помогает
// детектить «мозаичную» пашню (частичный посев, заброшенные участки).
export interface NDVIPoint {
  date: string;          // YYYY-MM-DD (UTC)
  ndvi: number;          // -1..1, после маски облаков
  cloudCoverPct: number; // 0..100
  stDev?: number;        // 0..1, пространственная σ NDVI внутри поля
}

export interface NDVITimeseries {
  polygon: FieldPolygon;
  startDate: string;
  endDate: string;
  points: NDVIPoint[];
  // Сколько точек отброшено по облакам/качеству (для статуса INSUFFICIENT_DATA).
  droppedCloudy: number;
  // Кто отдал данные — нужно для SourceRef в Findings.
  providerId: SatelliteProviderId;
}

// ────────────────────────────────────────────────────────────────────────────
// Провайдер
// ────────────────────────────────────────────────────────────────────────────

export type SatelliteProviderId = "mock" | "sentinel-hub" | "copernicus" | "gee";

export type SatelliteImageKind = "truecolor" | "ndvi";

export interface SatelliteProvider {
  readonly id: SatelliteProviderId;
  readonly displayName: string;
  // Получить временной ряд NDVI по полигону за окно дат.
  // Реализация должна сама фильтровать облака и возвращать пустой массив,
  // если данных нет (вызывающая сторона выдаст INSUFFICIENT_DATA).
  getNDVITimeseries(
    polygon: FieldPolygon,
    startDate: string,
    endDate: string,
  ): Promise<NDVITimeseries>;
  // Получить рендер одного снимка PNG (true-color RGB или NDVI-карта).
  // Опциональный метод: mock-провайдер не реализует, sentinel-hub — да.
  getImagePNG?(
    polygon: FieldPolygon,
    date: string,
    kind: SatelliteImageKind,
    widthPx?: number,
  ): Promise<Buffer>;
}

// ────────────────────────────────────────────────────────────────────────────
// Признаки и правила
// ────────────────────────────────────────────────────────────────────────────

export type VegetationLevel = "none" | "weak" | "medium" | "strong";
export type RiskFlag = "LOW" | "MEDIUM" | "HIGH";
export type SatelliteStatus = "OK" | "INSUFFICIENT_DATA" | "ERROR";

// Что мы извлекаем из ряда NDVI.
export interface NDVIFeatures {
  ndviMean: number;
  ndviMax: number;
  ndviMin: number;
  // Дата, на которую NDVI впервые превышает GROWTH_NDVI_THRESHOLD после
  // монотонного роста за >= GROWTH_WINDOW_DAYS дней. null, если роста не было.
  growthStartDate: string | null;
  // Дата, в которую достигается максимум.
  peakDate: string | null;
  vegetationPresent: boolean;
  pointsUsed: number;
  pointsDropped: number;
  // Расширенные параметры — для более обоснованных фрод-решений.
  // Средняя пространственная σ NDVI внутри поля по всем валидным точкам:
  // высокая σ = «мозаичное» поле (частичный посев / заросли по краям).
  heterogeneityStdev: number | null;
  // Максимальная скорость прироста NDVI в день за фазу зелёной массы:
  // низкая скорость при субсидии на удобрения = удобрения «не сработали».
  growthRateNdviPerDay: number | null;
  // Сколько дней от старта роста до пика (длина green-up):
  // слишком короткий = ложный сигнал, слишком длинный = слабый старт.
  daysToPeak: number | null;
  // Длина сезона вегетации (дней между датой пересечения порога вверх и вниз):
  // короткий сезон = ранняя засуха или преждевременная уборка.
  seasonLengthDays: number | null;
}

// Один спутниковый снимок (URL для UI и метаинформация).
export interface SatelliteImage {
  date: string;          // YYYY-MM-DD — реальная дата запроса
  url: string;           // /api/satellite/image?...
  kind: SatelliteImageKind;
  label: string;         // что это за снимок: «baseline», «start», «peak»
}

// Year-over-Year сравнение: тот же полигон в прошлом году.
export interface YearOverYear {
  previousYear: number;
  ndviMaxPrev: number | null;
  growthStartPrev: string | null;
  // Текущий пик минус прошлогодний (отрицательное = деградация).
  ndviMaxDelta: number | null;
  // Сколько дней разница в начале вегетации (положительное = опоздание).
  growthStartDeltaDays: number | null;
}

// Результат проверки одного поля по ТЗ.
export interface SatelliteVerification {
  status: SatelliteStatus;
  // Поля по ТЗ
  sowingDetected: boolean;
  growthStartDate: string | null;
  vegetationLevel: VegetationLevel;
  riskFlag: RiskFlag;
  // Детали — для UI и аудита.
  features: NDVIFeatures | null;
  // Текстовые причины срабатывания (для тултипов и инспекторской ленты).
  reasons: string[];
  // Окно и провайдер — для трасс/SourceRef.
  window: { startDate: string; endDate: string };
  provider: SatelliteProviderId;
  fetchedAt: string;
  source: SourceRef;
  // 3 миниатюры для UI (заполняется по запросу — без images карточка работает).
  images?: SatelliteImage[];
  // Сравнение с прошлым годом — null, если данных по предыдущему году нет.
  yoy?: YearOverYear | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Inactivity check (наша надстройка)
// ────────────────────────────────────────────────────────────────────────────

// Уровень тревоги: WATCH = ещё рано, SUSPICIOUS = одно подтверждение,
// ALERT = два подряд снимка подтверждают отсутствие активности.
export type InactivityLevel = "OK" | "WATCH" | "SUSPICIOUS" | "ALERT";

export interface InactivityCheckInput {
  polygon: FieldPolygon;
  // Дата, после которой агроактивность ожидается (заявленный посев / выдача
  // субсидии — что укажет вызывающая сторона).
  baselineDate: string;
  // Окно ожидания в днях после baselineDate, за которое мы считаем алерт.
  windowDays: number;
}

export interface InactivityCheckResult {
  level: InactivityLevel;
  baselineDate: string;
  checkedThrough: string;          // на какую дату мы реально дотянулись
  baselineNDVI: number | null;     // NDVI на/около baselineDate
  recentNDVIMax: number | null;    // максимум NDVI за окно
  deltaNDVI: number | null;        // recentNDVIMax - baselineNDVI
  observationsInWindow: number;
  cloudyDropped: number;
  reasons: string[];
  // Трассы для UI/аудита.
  window: { startDate: string; endDate: string };
  provider: SatelliteProviderId;
  fetchedAt: string;
}
