// ────────────────────────────────────────────────────────────────────────────
// K_harvest — потери при уборке.
//
// УПРОЩЁННАЯ ФОРМУЛА (по решению пользователя):
//   loss_pct = baseline[crop] + max(0, delay_days) × delay_per_day
//   K_harvest = 1 − min(20%, loss_pct) / 100
//
// Не учитываем возраст комбайна (нельзя надёжно измерить). Главное —
// правильная настройка, что для нас — baseline. Задержка уборки — единственный
// модулятор, который мы реально можем измерить (по SAR + фенология).
//
// Источники:
//   - FAO/UN Food Loss Kazakhstan: средние потери 8–15%
//   - Manitoba Phantom Yield Loss: ~0.7%/день после maturity
//   - OSU: задержка > 14 дн = +2–8% к норме
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  KHarvestResult,
} from "./types";
import {
  HARVEST_LOSS_BASELINE_PCT,
  HARVEST_LOSS_MAX_PCT,
  HARVEST_DELAY_PCT_PER_DAY,
} from "./norms";
import { PHASE_PLAN } from "./norms";
import { lookupSort } from "./norms";
import { clamp } from "./types";

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function computeKHarvest(
  input: YieldPredictionInput,
): KHarvestResult {
  const { declaration, season } = input;
  const reasons: string[] = [];

  const baseline = HARVEST_LOSS_BASELINE_PCT[season.crop];

  // Оптимальная дата уборки = посев + daysToMaturity сорта.
  const sort = lookupSort(declaration.sortId, season.crop);
  const optimalHarvestDate = addDays(declaration.sowingDate, sort.daysToMaturity);

  // Фактическая дата уборки: из декларации (или плановая дата).
  // Hook: в реальной системе тут будет сравнение с SAR-датой [lib/satellite/sar-events.ts]
  // и берётся ПОЗДНЯЯ (консервативный сценарий).
  const actualHarvestDate = declaration.harvestDate ?? optimalHarvestDate;

  const delayDays = daysBetween(optimalHarvestDate, actualHarvestDate);
  const effectiveDelay = Math.max(0, delayDays);

  const rawLossPct = baseline + effectiveDelay * HARVEST_DELAY_PCT_PER_DAY;
  const capped = rawLossPct > HARVEST_LOSS_MAX_PCT;
  const lossPct = clamp(rawLossPct, 0, HARVEST_LOSS_MAX_PCT);

  const kHarvest = 1 - lossPct / 100;

  reasons.push(`Базовые потери для культуры «${season.crop}»: ${baseline}%`);
  reasons.push(`Оптимальная дата уборки: ${optimalHarvestDate} (посев ${declaration.sowingDate} + ${sort.daysToMaturity} дн.)`);
  if (effectiveDelay > 0) {
    reasons.push(
      `Задержка уборки: ${effectiveDelay} дн × ${HARVEST_DELAY_PCT_PER_DAY}%/день = +${(effectiveDelay * HARVEST_DELAY_PCT_PER_DAY).toFixed(1)}%`,
    );
  } else {
    reasons.push("Уборка в срок или раньше — задержки нет");
  }
  if (capped) {
    reasons.push(`Cap 20% применён (расчёт дал ${rawLossPct.toFixed(1)}%)`);
  }
  reasons.push(`Итого потери: ${lossPct.toFixed(1)}% → K_harvest = ${kHarvest.toFixed(3)}`);

  return {
    value: +kHarvest.toFixed(3),
    delayDays,
    lossPct: +lossPct.toFixed(1),
    capped,
    confidence: "high",
    sigmaRelative: 0.04,
    reasons,
  };
}
