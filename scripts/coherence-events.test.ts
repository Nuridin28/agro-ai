// Регрессионные тесты coherence-детектора на синтетических рядах.
// Запуск: npm run test:coherence

import { detectCoherenceEvents } from "../lib/satellite/coherence-events";
import type { CoherenceTimeseries, CoherencePair } from "../lib/satellite/types";

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

function series(pairs: CoherencePair[]): CoherenceTimeseries {
  return {
    polygon: [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
    windowStart: pairs[0]?.startDate ?? "2025-04-01",
    windowEnd: pairs[pairs.length - 1]?.endDate ?? "2025-10-01",
    pairs,
    providerId: "mock",
  };
}

function pair(start: string, end: string, gamma: number): CoherencePair {
  return { startDate: start, endDate: end, coherence: gamma, sampleCount: 3000, source: "mock" };
}

// ──────────── Test 1: stable field — no events ────────────
console.log("\nTest 1: stable field — γ stays high all season");
{
  const ps: CoherencePair[] = [];
  for (let m = 4; m <= 9; m++) {
    for (let d = 1; d <= 25; d += 6) {
      const start = `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const end = `2025-${String(m).padStart(2, "0")}-${String(d + 6).padStart(2, "0")}`;
      ps.push(pair(start, end, 0.55 + (Math.random() - 0.5) * 0.04));
    }
  }
  const r = detectCoherenceEvents(series(ps));
  assert("detected", r !== null);
  assert("fieldStable = true", r?.summary.fieldStable === true);
  assert("0 events", r?.events.length === 0);
}

// ──────────── Test 2: tillage event — single drop ────────────
console.log("\nTest 2: tillage event — γ drops to 0.20 in May");
{
  const ps: CoherencePair[] = [
    pair("2025-04-01", "2025-04-07", 0.55),
    pair("2025-04-13", "2025-04-19", 0.58),
    pair("2025-04-25", "2025-05-01", 0.56),
    // tillage event
    pair("2025-05-07", "2025-05-13", 0.20),
    pair("2025-05-19", "2025-05-25", 0.35),
    pair("2025-05-31", "2025-06-06", 0.40),
    pair("2025-06-12", "2025-06-18", 0.42),
  ];
  const r = detectCoherenceEvents(series(ps));
  assert("primary event found", !!r?.summary.primaryEvent);
  assert("event date в мае", r?.summary.primaryEvent?.date.startsWith("2025-05") ?? false,
    `got ${r?.summary.primaryEvent?.date}`);
  assert("fieldStable = false", r?.summary.fieldStable === false);
}

// ──────────── Test 3: two events (tillage + harvest) ────────────
console.log("\nTest 3: tillage + harvest in same season");
{
  const ps: CoherencePair[] = [
    pair("2025-04-01", "2025-04-07", 0.55),
    pair("2025-04-13", "2025-04-19", 0.58),
    // event 1: tillage
    pair("2025-04-25", "2025-05-01", 0.18),
    pair("2025-05-07", "2025-05-13", 0.45),
    pair("2025-05-19", "2025-05-25", 0.42),
    pair("2025-05-31", "2025-06-06", 0.40),
    pair("2025-06-12", "2025-06-18", 0.40),
    pair("2025-06-24", "2025-06-30", 0.40),
    pair("2025-07-06", "2025-07-12", 0.42),
    pair("2025-07-18", "2025-07-24", 0.40),
    // event 2: harvest
    pair("2025-08-05", "2025-08-11", 0.22),
    pair("2025-08-17", "2025-08-23", 0.48),
  ];
  const r = detectCoherenceEvents(series(ps));
  assert("≥ 2 events", (r?.events.length ?? 0) >= 2,
    `got ${r?.events.length}, dates=${JSON.stringify(r?.events.map((e) => e.date))}`);
}

// ──────────── Test 4: tiny series — minimum points ────────────
console.log("\nTest 4: too few pairs → null");
{
  const ps: CoherencePair[] = [
    pair("2025-04-01", "2025-04-07", 0.55),
    pair("2025-04-13", "2025-04-19", 0.58),
  ];
  const r = detectCoherenceEvents(series(ps));
  assert("returns null for <3 pairs", r === null);
}

// ──────────── Final ────────────
console.log(`\n========================`);
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
process.exit(0);
