// Детектор событий из ряда coherence-пар.
//
// Логика: caвоисcerent γ ≥ 0.5 = стабильная поверхность. Каждая пара,
// где γ опускается ниже COHERENCE_EVENT_GAMMA (0.30) — кандидат на событие
// изменения поля (вспашка, посев, уборка, проезд техники, наводнение).
//
// Тип события определяется кросс-чеком с backscatter и фенологией:
//   - drop γ + рост VV + sowing/spring окно   → tillage (вспашка)
//   - drop γ + рост VH + поздняя весна        → sowing
//   - drop γ + падение VH + лето/осень        → harvest
//   - drop γ один (без backscatter) + любое   → generic "change"
//
// Cross-check выполняется на уровне выше (verify/satellite.ts).

import type { CoherenceTimeseries, CoherenceEvent } from "./types";

export const COHERENCE_THRESHOLDS = {
  // γ ниже которого событие считается значимым.
  EVENT_GAMMA_MAX: 0.30,
  // γ выше которого поверхность считается стабильной.
  STABLE_GAMMA_MIN: 0.50,
  // Падение γ относительно предыдущей пары (для устойчивости к
  // глобальному сезонному смещению — летом γ всегда чуть ниже).
  EVENT_DROP_MIN: 0.15,
  // Минимум confidence чтобы событие попало в список.
  MIN_CONFIDENCE: 0.4,
  // Поле «не работало» — все пары стабильно высокие (≥ STABLE_GAMMA_MIN),
  // никаких событий за сезон.
  STABLE_PAIRS_RATIO_MIN: 0.85,
} as const;

export interface CoherenceEventsResult {
  events: CoherenceEvent[];
  summary: {
    pairsCount: number;
    meanGamma: number;
    minGamma: number;
    // Поле без событий весь сезон (все пары стабильные).
    fieldStable: boolean;
    // Главное событие изменения (наибольший confidence).
    primaryEvent: CoherenceEvent | null;
  };
}

export function detectCoherenceEvents(series: CoherenceTimeseries | null): CoherenceEventsResult | null {
  if (!series || series.pairs.length < 3) return null;
  const pairs = series.pairs;

  let sum = 0, min = Infinity;
  let stableCount = 0;
  for (const p of pairs) {
    sum += p.coherence;
    if (p.coherence < min) min = p.coherence;
    if (p.coherence >= COHERENCE_THRESHOLDS.STABLE_GAMMA_MIN) stableCount++;
  }
  const meanGamma = sum / pairs.length;
  const fieldStable = stableCount / pairs.length >= COHERENCE_THRESHOLDS.STABLE_PAIRS_RATIO_MIN;

  const events: CoherenceEvent[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.coherence > COHERENCE_THRESHOLDS.EVENT_GAMMA_MAX) continue;

    // Относительный drop — γ ниже предыдущей пары как минимум на EVENT_DROP_MIN.
    // Для i=0 (первая пара) используем абсолютное значение.
    let drop = COHERENCE_THRESHOLDS.EVENT_GAMMA_MAX - p.coherence;
    if (i > 0) {
      const prev = pairs[i - 1];
      drop = Math.max(drop, prev.coherence - p.coherence);
      // Если предыдущая тоже была низкой (поле уже изменено), не дублируем
      // событие на каждую следующую пару — только первое.
      if (prev.coherence <= COHERENCE_THRESHOLDS.EVENT_GAMMA_MAX) continue;
    }

    if (drop < COHERENCE_THRESHOLDS.EVENT_DROP_MIN) continue;
    const confidence = Math.min(1, drop / 0.40);  // drop 0.40 → confidence 1.0
    if (confidence < COHERENCE_THRESHOLDS.MIN_CONFIDENCE) continue;

    events.push({
      date: p.endDate,
      coherence: p.coherence,
      // Тип уточняется снаружи через cross-check с backscatter; здесь —
      // generic "change".
      kind: "change",
      confidence,
      reason: `γ=${p.coherence.toFixed(2)} в окне ${p.startDate}→${p.endDate} (drop ${drop.toFixed(2)})`,
    });
  }

  events.sort((a, b) => b.confidence - a.confidence);
  const primaryEvent = events[0] ?? null;

  return {
    events,
    summary: {
      pairsCount: pairs.length,
      meanGamma: +meanGamma.toFixed(3),
      minGamma: +min.toFixed(3),
      fieldStable,
      primaryEvent,
    },
  };
}
