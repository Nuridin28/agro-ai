// ────────────────────────────────────────────────────────────────────────────
// Peer comparison — сравнение прогноза с урожаями соседей.
//
// ПРАВКА #3 (после анализа симуляции):
//   Это НЕ множитель в формуле, а отдельный сигнал. Назначение — отличить
//   "фермер плохой" от "погода плохая".
//
// Логика:
//   peerAvg известен → сравниваем Y_predicted с peerAvg
//   |Δ| > 30% → significantly above/below — сильный сигнал для инспектора
//   15% < |Δ| < 30% → above/below — повод проверить
//   |Δ| < 15% → in_line — фермер ведёт себя как соседи
//
// Использование в антифроде:
//   - Y_predicted сильно ниже соседей → фермер плохо хозяйствует (не фрод)
//   - Y_declared сильно выше соседей при тех же условиях → возможный фрод
//   - Это уже работает в коде друга: CROP_REGIONAL_OUTLIER. Здесь мы
//     даём более структурированный сигнал.
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  PeerComparisonResult,
} from "./types";

const SIGNIFICANT_THRESHOLD_PCT = 30;
const NOTABLE_THRESHOLD_PCT = 15;

export function computePeerComparison(
  input: YieldPredictionInput,
  yPredicted: number,
): PeerComparisonResult {
  const peer = input.peer;

  if (!peer || (peer.rayonAverage == null && (!peer.peerYields || peer.peerYields.length === 0))) {
    return {
      fieldVsPeerDeltaCha: null,
      fieldVsPeerDeltaPct: null,
      interpretation: "no_peers",
      reasoning: "Данных по соседям нет — peer comparison невозможна.",
    };
  }

  // Если есть и rayonAverage, и peerYields — берём peerYields (более локальные).
  let peerAvg: number;
  let n: number;
  if (peer.peerYields && peer.peerYields.length > 0) {
    peerAvg = peer.peerYields.reduce((s, x) => s + x, 0) / peer.peerYields.length;
    n = peer.peerYields.length;
  } else {
    peerAvg = peer.rayonAverage!;
    n = peer.peerCount ?? 0;
  }

  const delta = yPredicted - peerAvg;
  const deltaPct = peerAvg > 0 ? (delta / peerAvg) * 100 : 0;
  const absPct = Math.abs(deltaPct);

  let interpretation: PeerComparisonResult["interpretation"];
  let reasoning: string;

  if (absPct >= SIGNIFICANT_THRESHOLD_PCT) {
    if (deltaPct > 0) {
      interpretation = "above_peers_significantly";
      reasoning = `Прогноз ${yPredicted.toFixed(1)} ц/га на ${absPct.toFixed(0)}% ВЫШЕ среднего соседей (${peerAvg.toFixed(1)} ц/га, n=${n}). При тех же погодных условиях это аномалия — стоит проверить декларацию.`;
    } else {
      interpretation = "below_peers_significantly";
      reasoning = `Прогноз ${yPredicted.toFixed(1)} ц/га на ${absPct.toFixed(0)}% НИЖЕ среднего соседей (${peerAvg.toFixed(1)} ц/га, n=${n}). Условия у всех одинаковые — проблема в агротехнике конкретного хозяйства.`;
    }
  } else if (absPct >= NOTABLE_THRESHOLD_PCT) {
    if (deltaPct > 0) {
      interpretation = "above_peers";
      reasoning = `Прогноз ${yPredicted.toFixed(1)} ц/га выше соседей (${peerAvg.toFixed(1)} ц/га) на ${absPct.toFixed(0)}%. В пределах допустимой вариации, но повод обратить внимание.`;
    } else {
      interpretation = "below_peers";
      reasoning = `Прогноз ${yPredicted.toFixed(1)} ц/га ниже соседей (${peerAvg.toFixed(1)} ц/га) на ${absPct.toFixed(0)}%. Хозяйство отстаёт — стоит обсудить агротехнологии.`;
    }
  } else {
    interpretation = "in_line_with_peers";
    reasoning = `Прогноз ${yPredicted.toFixed(1)} ц/га соответствует среднему соседей ${peerAvg.toFixed(1)} ц/га (Δ ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}%).`;
  }

  return {
    fieldVsPeerDeltaCha: +delta.toFixed(2),
    fieldVsPeerDeltaPct: +deltaPct.toFixed(1),
    interpretation,
    reasoning,
  };
}
