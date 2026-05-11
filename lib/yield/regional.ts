// ────────────────────────────────────────────────────────────────────────────
// Cregion — региональная калибровка из БНС.
//
// Cregion[oblast, rayon, year] = среднее(Yactual_БНС / Ymodel_predicted)
//                                за последние 3 сезона
//
// CAP: [0.85, 1.15] — Cregion не должен поглощать ошибки модели. Если
// систематически выходит за пределы 3+ года подряд, переделываем модель,
// а не растягиваем cap.
//
// Источник: stat.gov.kz — БНС публикует урожайность по культурам и
// районам ежегодно после уборочной (лаг 6–12 мес).
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  CregionResult,
  RegionalCalibration,
} from "./types";
import {
  CREGION_MIN,
  CREGION_MAX,
  CREGION_FALLBACK,
} from "./norms";
import { clamp } from "./types";

export function computeCregion(input: YieldPredictionInput): CregionResult {
  const cal = input.regional;
  const reasons: string[] = [];

  if (!cal) {
    reasons.push(`БНС-калибровка не передана — используется fallback ${CREGION_FALLBACK} (нейтрал)`);
    return {
      value: CREGION_FALLBACK,
      factor: CREGION_FALLBACK,
      fallback: true,
      confidence: "low",
      sigmaRelative: 0.10,
      reasons,
    };
  }

  // Применяем cap.
  const rawFactor = cal.factor;
  const cappedFactor = clamp(rawFactor, CREGION_MIN, CREGION_MAX);
  const wasCappedHigh = rawFactor > CREGION_MAX;
  const wasCappedLow = rawFactor < CREGION_MIN;

  if (wasCappedHigh) {
    reasons.push(
      `БНС-фактор ${rawFactor.toFixed(2)} превысил cap ${CREGION_MAX} — применено ограничение. Это значит модель СИСТЕМАТИЧЕСКИ занижает урожай в районе ${cal.rayon}, нужна доработка.`,
    );
  } else if (wasCappedLow) {
    reasons.push(
      `БНС-фактор ${rawFactor.toFixed(2)} ниже cap ${CREGION_MIN} — применено ограничение. Модель СИСТЕМАТИЧЕСКИ завышает урожай в районе ${cal.rayon}, нужна доработка.`,
    );
  } else {
    reasons.push(
      `БНС-калибровка ${cal.rayon}, ${cal.oblast}: фактор ${rawFactor.toFixed(2)} (среднее за ${cal.yearsAveraged} сезонов)`,
    );
  }

  // Confidence: high если 3 года данных, medium если 2, low если 1.
  const confidence: "high" | "medium" | "low" =
    cal.yearsAveraged >= 3 ? "high" : cal.yearsAveraged === 2 ? "medium" : "low";

  return {
    value: +cappedFactor.toFixed(3),
    factor: +cappedFactor.toFixed(3),
    fallback: false,
    confidence,
    sigmaRelative: cal.yearsAveraged >= 3 ? 0.04 : 0.08,
    reasons,
  };
}

// Helper для тестов — создать RegionalCalibration напрямую.
export function createCregionMock(
  oblast: string,
  rayon: string,
  factor: number,
  yearsAveraged: number = 3,
): RegionalCalibration {
  return {
    oblast,
    rayon,
    factor,
    yearsAveraged,
    source: {
      source: "STAT",
      docId: `bns-${oblast}-${rayon}-${yearsAveraged}yr`,
      fetchedAt: new Date().toISOString(),
      note: `Mock БНС калибровка за ${yearsAveraged} последних сезонов`,
    },
  };
}
