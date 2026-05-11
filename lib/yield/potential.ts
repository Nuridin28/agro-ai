// ────────────────────────────────────────────────────────────────────────────
// Y_potential — потолок урожайности (ц/га) при идеальных условиях.
//
// ПРАВКА #1 (после анализа симуляции):
//   Y_potential НЕ "теоретический потолок по Monteith". Это
//   calibrated potential — capped по БНС-исторической огибающей × headroom.
//   Сырой Monteith используется только как sanity check.
//
// Формула:
//   Y_raw = RUE × Σ(IPAR) × HI × bonitetFactor × terrainFactor   (Monteith)
//   bonitetFactor = √(bonitet / 50)                              ; затухающая отдача
//   Y_capped = min(Y_raw, BNS_historical_max × 1.10)             ; reality cap
//   Если БНС-историки нет → fallback Y_raw × 0.50
//
// Источники:
//   - Monteith 1972/1977 — основа RUE × IPAR × HI
//   - Storie Index 1933 — sqrt(bonitet) дает диминутивную отдачу
//   - GYGA Atlas методология — concept of calibrated Yp
// ────────────────────────────────────────────────────────────────────────────

import type { Field } from "../types";
import type {
  YieldPredictionInput,
  YieldPotentialResult,
  SortParams,
} from "./types";
import { BNS_CAP_HEADROOM, NO_BNS_FALLBACK_FRACTION } from "./norms";
import { BONITET_REFERENCE, BONITET_MAX_FACTOR, clamp, round1 } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Бонитет-коэффициент: √(bonitet/50), capped 1.45 (черноземы).
// При неизвестном бонитете — 1.0 (нейтральный).
// ────────────────────────────────────────────────────────────────────────────

export function bonitetFactor(bonitet: number | null | undefined): number {
  if (bonitet == null || bonitet <= 0) return 1.0;
  const raw = Math.sqrt(bonitet / BONITET_REFERENCE);
  return clamp(raw, 0.4, BONITET_MAX_FACTOR);
}

// ────────────────────────────────────────────────────────────────────────────
// Сырой потолок Monteith.
//   RUE [г/МДж] × Σ IPAR [МДж/м²] × HI = биомасса зерна, г/м²
//   г/м² × 0.01 = ц/га
// ────────────────────────────────────────────────────────────────────────────

export function rawMonteithCha(
  sort: SortParams,
  sumIPARMJm2: number,
): number {
  const grainGperM2 = sort.rueGramsPerMJ * sumIPARMJm2 * sort.harvestIndex;
  // Конверсия г/м² → ц/га:
  //   1 г/м² = (10 000 м²/га) × 1 г = 10 000 г/га = 10 кг/га = 0.1 ц/га
  return grainGperM2 * 0.1;
}

// ────────────────────────────────────────────────────────────────────────────
// Главная функция.
// ────────────────────────────────────────────────────────────────────────────

export function computeYPotential(
  input: YieldPredictionInput,
  sort: SortParams,
): YieldPotentialResult {
  const { field, weather, bnsHistoricalMaxCha } = input;

  const reasons: string[] = [];
  const details: Record<string, unknown> = {};

  // 1) Сырой Monteith.
  const yRaw = rawMonteithCha(sort, weather.sumIPARMJm2);
  reasons.push(
    `Сырой Monteith: RUE ${sort.rueGramsPerMJ} × IPAR ${weather.sumIPARMJm2.toFixed(0)} МДж/м² × HI ${sort.harvestIndex} = ${round1(yRaw)} ц/га`,
  );

  // 2) Бонитет-поправка.
  const bonFactor = bonitetFactor(field.bonitet);
  const yWithBonitet = yRaw * bonFactor;
  reasons.push(
    `Бонитет ${field.bonitet} → коэффициент ${bonFactor.toFixed(2)} (√(b/50))`,
  );

  // 3) Terrain factor — пока 1.0, hook для будущего DEM анализа.
  const terrainFactor = 1.0;
  const yBeforeCap = yWithBonitet * terrainFactor;

  // 4) БНС-cap. КЛЮЧЕВАЯ ПРАВКА #1 — без этого Y_potential нереалистичен.
  let yCapped: number;
  let capApplied = false;
  let confidence: "high" | "medium" | "low" = "medium";

  if (bnsHistoricalMaxCha != null && bnsHistoricalMaxCha > 0) {
    const bnsCap = bnsHistoricalMaxCha * BNS_CAP_HEADROOM;
    if (yBeforeCap > bnsCap) {
      yCapped = bnsCap;
      capApplied = true;
      reasons.push(
        `БНС-cap применён: Monteith ${round1(yBeforeCap)} ц/га выше историч. максимума ${bnsHistoricalMaxCha} × ${BNS_CAP_HEADROOM} = ${round1(bnsCap)} ц/га`,
      );
      confidence = "high"; // БНС-калибровка — самый надёжный сценарий
    } else {
      yCapped = yBeforeCap;
      reasons.push(`БНС-cap не сработал (Monteith ниже исторической огибающей)`);
      confidence = "high";
    }
  } else {
    // Fallback при отсутствии БНС-данных: консервативно срезаем Monteith.
    yCapped = yBeforeCap * NO_BNS_FALLBACK_FRACTION;
    capApplied = true;
    reasons.push(
      `БНС-данных нет, применён консервативный fallback: ${round1(yBeforeCap)} × ${NO_BNS_FALLBACK_FRACTION} = ${round1(yCapped)} ц/га`,
    );
    confidence = "low";
  }

  details.rawMonteith = round1(yRaw);
  details.bonitetFactor = +bonFactor.toFixed(3);
  details.terrainFactor = terrainFactor;
  details.yBeforeCap = round1(yBeforeCap);
  details.bnsHistoricalMax = bnsHistoricalMaxCha ?? null;
  details.sortUsed = sort.id;

  return {
    value: round1(yCapped),
    yPotentialRawCha: round1(yRaw),
    yPotentialCappedCha: round1(yCapped),
    capApplied,
    confidence,
    // ±10% sigma — учитывает неопределённость RUE/HI для сорта + БНС-калибровки.
    sigmaRelative: 0.10,
    reasons,
    details,
  };
}

// Hook для unit-тестов / sanity check — посмотреть только бонитет-коэф.
export function _bonitetFactor(bonitet: number): number {
  return bonitetFactor(bonitet);
}
