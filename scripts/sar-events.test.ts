// Регрессионные тесты детектора SAR на синтетических рядах.
// Запуск: npm run test:sar
// Принцип: ряд VV/VH строится руками под конкретный сценарий, проверяем
// что детектор находит ровно те события, которые мы заложили.
//
// Без jest/vitest — простой assert-based runner с понятным выводом.

import { detectSAREvents, type PrecipPoint } from "../lib/satellite/sar-events";
import type { SARTimeseries, SARPoint } from "../lib/satellite/types";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(detail ? `${name}: ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`);
  }
}

function series(_label: string, points: SARPoint[]): SARTimeseries {
  return {
    polygon: [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
    startDate: points[0]?.date ?? "2025-04-01",
    endDate: points[points.length - 1]?.date ?? "2025-10-01",
    points,
    providerId: "mock",
  };
}

function p(date: string, vv: number, vh: number, sample = 3000): SARPoint {
  return { date, vvDb: vv, vhDb: vh, sampleCount: sample };
}

// ──────────── Test 1: clean harvest ────────────
console.log("\nTest 1: harvest event (VH drop -5dB in late August)");
{
  const pts: SARPoint[] = [
    p("2025-04-01", -10, -22), p("2025-04-13", -10, -22), p("2025-04-25", -10, -21),
    p("2025-05-07", -10, -19), p("2025-05-19", -11, -16), p("2025-05-31", -11, -14),
    p("2025-06-12", -11, -13), p("2025-06-24", -11, -12), p("2025-07-06", -11, -12),
    p("2025-07-18", -11, -13), p("2025-07-30", -11, -14),
    // harvest: VH crashes
    p("2025-08-11", -11, -19), p("2025-08-23", -11, -21),
    p("2025-09-04", -11, -22), p("2025-09-16", -11, -22),
  ];
  const r = detectSAREvents(series("harvest", pts));
  assert("ряд распознан", r !== null);
  assert("harvest event found", !!r?.summary.harvestEvent);
  assert("harvest date в августе", r?.summary.harvestEvent?.date.startsWith("2025-08") ?? false,
    `got ${r?.summary.harvestEvent?.date}`);
  assert("inactivity = false", r?.summary.inactivity === false);
  assert("sowing event найден", !!r?.summary.sowingEvent);
}

// ──────────── Test 2: dormant field (inactivity) ────────────
console.log("\nTest 2: dormant field — flat VH around -22dB all season");
{
  const pts: SARPoint[] = [];
  for (let m = 4; m <= 9; m++) {
    for (let d = 1; d <= 25; d += 12) {
      const date = `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      pts.push(p(date, -11 + (Math.random() - 0.5) * 0.6, -22 + (Math.random() - 0.5) * 0.5));
    }
  }
  const r = detectSAREvents(series("dormant", pts));
  assert("inactivity = true", r?.summary.inactivity === true,
    `σVH=${r?.summary.vhSeasonStdevDb}, expected < 1.0`);
  assert("harvest event = null", r?.summary.harvestEvent === null);
}

// ──────────── Test 3: rain filter suppresses fake harvest ────────────
console.log("\nTest 3: rain filter — VH drop coincides with heavy precip");
{
  const pts: SARPoint[] = [
    p("2025-05-01", -10, -22), p("2025-05-13", -10, -19), p("2025-05-25", -10, -16),
    p("2025-06-06", -10, -14), p("2025-06-18", -10, -13), p("2025-06-30", -10, -13),
    p("2025-07-12", -10, -13), p("2025-07-24", -10, -13),
    // дип на двух точках — переживёт сглаживание (1-точечные дипы фильтруются median3)
    p("2025-08-05", -10, -19), p("2025-08-17", -10, -19),
    p("2025-08-29", -10, -14), p("2025-09-10", -10, -19),
    // настоящая поздняя уборка
    p("2025-09-22", -10, -22),
  ];
  const precip: PrecipPoint[] = [
    { date: "2025-08-04", mm: 25 },  // дождь рядом с фейк-уборкой
    { date: "2025-08-05", mm: 12 },
  ];
  const noRainResult = detectSAREvents(series("rain", pts));
  const rainResult = detectSAREvents(series("rain", pts), { precipitation: precip });
  // Без фильтра — ловим август-уборку. С фильтром — confidence для неё режется,
  // и она либо отсеивается (< MIN_CONFIDENCE), либо проигрывает сентябрьской.
  const augHarvestNoFilter = noRainResult?.summary.harvestEvents.find((e) => e.date.startsWith("2025-08")) ?? null;
  const augHarvestWithFilter = rainResult?.summary.harvestEvents.find((e) => e.date.startsWith("2025-08")) ?? null;
  assert("без rain-фильтра август-уборка ловится", !!augHarvestNoFilter);
  assert("rain-фильтр режет confidence или отбрасывает август-уборку",
    !augHarvestWithFilter || (augHarvestNoFilter !== null && augHarvestWithFilter.confidence < augHarvestNoFilter.confidence),
    `withFilter conf=${augHarvestWithFilter?.confidence ?? "—"}, noFilter conf=${augHarvestNoFilter?.confidence ?? "—"}`,
  );
}

// ──────────── Test 4: small field warning ────────────
console.log("\nTest 4: small field — sample count below threshold");
{
  const pts: SARPoint[] = [];
  for (let i = 0; i < 10; i++) {
    const d = `2025-${String(4 + Math.floor(i / 3)).padStart(2, "0")}-${String(1 + (i % 3) * 10).padStart(2, "0")}`;
    pts.push(p(d, -10, -16, 25)); // 25 пикселей < 50
  }
  const r = detectSAREvents(series("small", pts));
  assert("smallField = true", r?.summary.smallField === true);
}

// ──────────── Test 5: multi-harvest (alfalfa) ────────────
console.log("\nTest 5: multi-harvest (alfalfa) — два падения VH за сезон");
{
  // окно зерновых уборок (HARVEST_MONTH_MIN=7) — оба укоса в этом окне:
  // в июле и сентябре. До этого — рост биомассы, между — отрастание.
  const pts: SARPoint[] = [
    p("2025-04-01", -10, -22), p("2025-04-13", -10, -19), p("2025-04-25", -10, -16),
    p("2025-05-07", -10, -13), p("2025-05-19", -10, -12), p("2025-05-31", -10, -12),
    p("2025-06-12", -10, -12), p("2025-06-24", -10, -12),
    // первый укос (июль)
    p("2025-07-06", -10, -19), p("2025-07-18", -10, -22),
    // отрастание
    p("2025-07-30", -10, -16), p("2025-08-11", -10, -13), p("2025-08-23", -10, -12),
    // второй укос (сентябрь)
    p("2025-09-04", -10, -19), p("2025-09-16", -10, -22),
    p("2025-09-28", -10, -22),
  ];
  const r = detectSAREvents(series("multi", pts));
  assert("≥ 2 harvest events", (r?.summary.harvestEvents.length ?? 0) >= 2,
    `got ${r?.summary.harvestEvents.length}, events=${JSON.stringify(r?.summary.harvestEvents.map((e) => `${e.date}/${e.confidence.toFixed(2)}`))}`);
}

// ──────────── Final ────────────
console.log(`\n========================`);
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
process.exit(0);
