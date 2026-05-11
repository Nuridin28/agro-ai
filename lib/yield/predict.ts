// ────────────────────────────────────────────────────────────────────────────
// predictYield — главный оркестратор модели STEPPE-Y v0.1.
//
// Формула:
//   Y_final = Y_potential × Kw × Ks × Kd_adv × K_spray × K_nutrition × K_harvest × Cregion
//
// Поверх:
//   - Monte Carlo (1000 прогонов) для P10/P50/P90 интервала
//   - Peer comparison как отдельный 9-й сигнал (не множитель)
//
// Применяет глобальные cap-ы [Y_FINAL_MIN, Y_FINAL_MAX] на финальный
// результат — sanity-проверка.
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  YieldPrediction,
  Confidence,
} from "./types";
import {
  MODEL_VERSION,
  Y_FINAL_MIN_CHA,
  Y_FINAL_MAX_CHA,
  clamp,
  round1,
} from "./types";
import { lookupSort } from "./norms";
import { computeYPotential } from "./potential";
import { computeKw, type KwTriangulationOptions } from "./water";
import { computeKs } from "./stress";
import { computeKdAdvisory, type DiseaseRiskOptions } from "./disease";
import { computeKSpray } from "./spray";
import { computeKNutrition } from "./nutrition";
import { computeKHarvest } from "./harvest-loss";
import { computeCregion } from "./regional";
import { computePeerComparison } from "./peer";

export interface PredictOptions {
  // Опции для триангуляции Kw (NDVI peak, SMAP).
  kw?: KwTriangulationOptions;
  // Опции для Kd (часы условий по болезням).
  disease?: DiseaseRiskOptions;
  // Число прогонов Monte Carlo. По умолчанию 1000.
  monteCarloIterations?: number;
  // Seed для воспроизводимости.
  seed?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Простой детерминированный RNG (Mulberry32) для воспроизводимого MC.
// ────────────────────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: u1, u2 ∈ (0,1) → нормально распределённое значение.
function gaussian(rng: () => number): number {
  let u1 = rng();
  let u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Сэмпл значения компонента с лог-нормальной вариацией: гарантированно > 0.
function sampleComponent(mean: number, sigmaRelative: number, rng: () => number): number {
  if (sigmaRelative <= 0) return mean;
  // Если sigmaRelative большой — лог-нормальное распределение даёт более
  // адекватные хвосты, чем простое mean × (1 + σ × N).
  const sigmaLog = Math.log(1 + sigmaRelative);
  return mean * Math.exp(gaussian(rng) * sigmaLog - 0.5 * sigmaLog * sigmaLog);
}

// Перцентили из отсортированного массива.
function percentile(sorted: number[], p: number): number {
  const idx = clamp(Math.floor(sorted.length * p), 0, sorted.length - 1);
  return sorted[idx];
}

// Минимум по уровню уверенности.
function minConfidence(values: Confidence[]): Confidence {
  const order: Confidence[] = ["unknown", "low", "medium", "high"];
  let min: Confidence = "high";
  for (const v of values) {
    if (order.indexOf(v) < order.indexOf(min)) min = v;
  }
  return min;
}

// ────────────────────────────────────────────────────────────────────────────
// Главная функция.
// ────────────────────────────────────────────────────────────────────────────

export function predictYield(
  input: YieldPredictionInput,
  opts: PredictOptions = {},
): YieldPrediction {
  // 1) Определяем сорт.
  const sort = input.sortOverride ?? lookupSort(input.declaration.sortId, input.season.crop);

  // 2) Считаем все компоненты.
  const yPotential   = computeYPotential(input, sort);
  const kw           = computeKw(input, sort, opts.kw);
  const ks           = computeKs(input);
  const kd           = computeKdAdvisory(input, sort, opts.disease);
  const kSpray       = computeKSpray(input);
  const kNutrition   = computeKNutrition(input);
  const kHarvest     = computeKHarvest(input);
  const cregion      = computeCregion(input);

  // 3) Финал — детерминированно.
  const yFinalRaw =
    yPotential.value * kw.value * ks.value * kd.value *
    kSpray.value * kNutrition.value * kHarvest.value * cregion.value;
  const yFinal = clamp(yFinalRaw, Y_FINAL_MIN_CHA, Y_FINAL_MAX_CHA);

  // 4) Monte Carlo для P10/P90.
  const iterations = opts.monteCarloIterations ?? 1000;
  const seed = opts.seed ?? 42;
  const rng = makeRng(seed);
  const samples: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const sYp = sampleComponent(yPotential.value, yPotential.sigmaRelative, rng);
    const sKw = clamp(sampleComponent(kw.value, kw.sigmaRelative, rng), 0.05, 1.0);
    const sKs = clamp(sampleComponent(ks.value, ks.sigmaRelative, rng), 0.30, 1.0);
    const sKd = clamp(sampleComponent(kd.value, kd.sigmaRelative, rng), 0.30, 1.0);
    const sKSp = clamp(sampleComponent(kSpray.value, kSpray.sigmaRelative, rng), 0.50, 1.0);
    const sKn = clamp(sampleComponent(kNutrition.value, kNutrition.sigmaRelative, rng), 0.30, 1.0);
    const sKh = clamp(sampleComponent(kHarvest.value, kHarvest.sigmaRelative, rng), 0.50, 1.0);
    const sCr = clamp(sampleComponent(cregion.value, cregion.sigmaRelative, rng), 0.50, 1.5);
    samples[i] = sYp * sKw * sKs * sKd * sKSp * sKn * sKh * sCr;
  }
  samples.sort((a, b) => a - b);

  const p10 = clamp(percentile(samples, 0.10), Y_FINAL_MIN_CHA, Y_FINAL_MAX_CHA);
  const p50 = clamp(percentile(samples, 0.50), Y_FINAL_MIN_CHA, Y_FINAL_MAX_CHA);
  const p90 = clamp(percentile(samples, 0.90), Y_FINAL_MIN_CHA, Y_FINAL_MAX_CHA);

  // 5) Peer comparison.
  const peer = computePeerComparison(input, yFinal);

  // 6) Общая уверенность — минимум по компонентам.
  const overallConfidence = minConfidence([
    yPotential.confidence,
    kw.confidence,
    ks.confidence,
    kd.confidence,
    kSpray.confidence,
    kNutrition.confidence,
    kHarvest.confidence,
    cregion.confidence,
  ]);

  return {
    p10Cha: round1(p10),
    p50Cha: round1(p50),
    p90Cha: round1(p90),
    pointEstimateCha: round1(yFinal),
    overallConfidence,
    components: {
      yPotential,
      kw,
      ks,
      kd,
      kSpray,
      kNutrition,
      kHarvest,
      cregion,
    },
    peer,
    modelVersion: MODEL_VERSION,
    computedAt: new Date().toISOString(),
    sortUsed: sort,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: красивый текстовый разбор для UI / логов.
// ────────────────────────────────────────────────────────────────────────────

export function formatPredictionReport(p: YieldPrediction): string {
  const c = p.components;
  const lines: string[] = [];
  lines.push(`═══════════════════════════════════════════════════════════`);
  lines.push(`Прогноз: ${p.p10Cha} — ${p.p90Cha} ц/га (медиана ${p.p50Cha})`);
  lines.push(`Уверенность: ${p.overallConfidence.toUpperCase()}`);
  lines.push(`Сорт: ${p.sortUsed.displayName}`);
  lines.push(`Модель: ${p.modelVersion}`);
  lines.push(`═══════════════════════════════════════════════════════════`);

  let running = c.yPotential.value;
  lines.push(`  Y_potential                ${pad(c.yPotential.value, 7)}  → ${pad(running, 6)}  ${c.yPotential.capApplied ? "[capped]" : ""}`);

  running *= c.kw.value;
  lines.push(`  × Kw (вода)               ${pad(c.kw.value, 7)}  → ${pad(running, 6)}  [${c.kw.confidence}]`);

  running *= c.ks.value;
  lines.push(`  × Ks (стресс)             ${pad(c.ks.value, 7)}  → ${pad(running, 6)}`);

  running *= c.kd.value;
  lines.push(`  × Kd (болезни)            ${pad(c.kd.value, 7)}  → ${pad(running, 6)}  [${c.kd.mode}]`);

  running *= c.kSpray.value;
  lines.push(`  × K_spray (гербицид)      ${pad(c.kSpray.value, 7)}  → ${pad(running, 6)}  [${c.kSpray.herbicide.status}]`);

  running *= c.kNutrition.value;
  lines.push(`  × K_nutrition (питание)   ${pad(c.kNutrition.value, 7)}  → ${pad(running, 6)}`);

  running *= c.kHarvest.value;
  lines.push(`  × K_harvest               ${pad(c.kHarvest.value, 7)}  → ${pad(running, 6)}  [потери ${c.kHarvest.lossPct}%, задержка ${c.kHarvest.delayDays}д]`);

  running *= c.cregion.value;
  lines.push(`  × Cregion                 ${pad(c.cregion.value, 7)}  → ${pad(running, 6)}  ${c.cregion.fallback ? "[fallback]" : ""}`);

  lines.push(``);
  lines.push(`Peer: ${p.peer.interpretation} — ${p.peer.reasoning}`);
  lines.push(`═══════════════════════════════════════════════════════════`);
  return lines.join("\n");
}

function pad(n: number, width: number): string {
  return n.toFixed(2).padStart(width, " ");
}
