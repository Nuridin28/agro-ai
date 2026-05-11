// Регрессионные тесты модели прогноза урожайности STEPPE-Y.
// Запуск: npm run test:yield
//
// Принцип: строим реалистичные сценарии для Сев. Казахстана, прогоняем
// через predictYield(), проверяем что компоненты и финал в ожидаемых
// диапазонах. Простой assert-based runner, как у sar-events.test.ts.

import { predictYield, formatPredictionReport } from "../lib/yield/predict";
import { createCregionMock } from "../lib/yield/regional";
import { computeYPotential, bonitetFactor } from "../lib/yield/potential";
import { lookupSort } from "../lib/yield/norms";
import { computeKw } from "../lib/yield/water";
import { computeKHarvest } from "../lib/yield/harvest-loss";
import { computeKNutrition } from "../lib/yield/nutrition";
import { computeKSpray } from "../lib/yield/spray";
import type { YieldPredictionInput } from "../lib/yield/types";
import type { Field } from "../lib/types";
import type { SourceRef } from "../lib/sources";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    fails.push(detail ? `${name}: ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`);
  }
}

function inRange(name: string, value: number, lo: number, hi: number): void {
  assert(name, value >= lo && value <= hi, `expected ${lo}..${hi}, got ${value}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Хелперы для построения сценариев.
// ────────────────────────────────────────────────────────────────────────────

const mockSource: SourceRef = {
  source: "GIPROZEM",
  docId: "test-mock",
  fetchedAt: new Date().toISOString(),
};

function mockField(overrides: Partial<Field> = {}): Field {
  return {
    id: "F-test",
    farmerId: "FA-test",
    cadastralNumber: "00-000-000-000",
    areaHa: 200,
    bonitet: 52,
    humusPct: 4.2,
    nitrogenMgKg: 85,
    phosphorusMgKg: 14,
    potassiumMgKg: 220,
    copperMgKg: 0.25,
    zincMgKg: 0.6,
    region: { oblast: "СКО", rayon: "Айыртау", katoCode: "591400000" },
    source: mockSource,
    agroSource: mockSource,
    ...overrides,
  };
}

function aiyrtauNormalYear(overrides?: Partial<YieldPredictionInput>): YieldPredictionInput {
  return {
    field: mockField(),
    season: { year: 2025, crop: "wheat_spring" },
    weather: {
      swEqMm: 130,
      snowmeltEfficiency: 0.5,
      soilWarmDate: "2025-04-25",
      // Слегка засушливый год: ~165 мм за май-август.
      monthlyPrecipMm: [
        { month: 5, mm: 35 }, { month: 6, mm: 50 },
        { month: 7, mm: 45 }, { month: 8, mm: 35 },
      ],
      // Типичный ET0 для СКО: ~620 мм за май-август.
      monthlyET0Mm: [
        { month: 5, mm: 124 }, { month: 6, mm: 165 },
        { month: 7, mm: 186 }, { month: 8, mm: 155 },
      ],
      sumIPARMJm2: 1100,
      daysTmaxOver32: 2,
      daysTmaxOver35: 0,
      daysTminBelowMinus2AfterMay1: 0,
      daysWindOver17: 1,
      hailReported: false,
    },
    declaration: {
      sowingDate: "2025-05-10",
      harvestDate: "2025-09-05",
      fertilizerNKgHa: 60,
      fertilizerPKgHa: 40,
      fertilizerKKgHa: 0,
      herbicideApplied: { declared: true, date: "2025-06-05", qoldauVerified: true },
      fungicideApplied: { declared: false, qoldauVerified: false },
      declaredYieldCha: 14,
      sortId: "wheat_spring/stepnaya_50",
    },
    peer: { rayonAverage: 11.5, peerCount: 25 },
    regional: createCregionMock("СКО", "Айыртау", 1.03, 3),
    bnsHistoricalMaxCha: 22,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Test 1: бонитет-функция
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 1: bonitetFactor = √(b/50), capped 1.45");
{
  assert("bonitet=50 → 1.00", Math.abs(bonitetFactor(50) - 1.0) < 0.001);
  inRange("bonitet=25 → ~0.71", bonitetFactor(25), 0.70, 0.72);
  inRange("bonitet=75 → ~1.22", bonitetFactor(75), 1.21, 1.23);
  assert("bonitet=100 → cap 1.41–1.45", bonitetFactor(100) >= 1.40 && bonitetFactor(100) <= 1.45);
  assert("bonitet=null → 1.0", bonitetFactor(null) === 1.0);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 2: Y_potential cap по БНС применяется
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 2: Y_potential capped by БНС historical max");
{
  const input = aiyrtauNormalYear();
  const sort = lookupSort(input.declaration.sortId, input.season.crop);
  const r = computeYPotential(input, sort);
  assert("сырой Monteith > 30 ц/га", r.yPotentialRawCha > 30, `raw=${r.yPotentialRawCha}`);
  assert("capped значение ≤ БНС-max × 1.1", r.yPotentialCappedCha <= 22 * 1.1 + 0.5);
  assert("cap применён", r.capApplied === true);
  inRange("Y_potential ~24.2 ц/га (БНС max=22 × 1.10)", r.value, 23.5, 24.5);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 3: Y_potential fallback когда БНС-данных нет
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 3: Y_potential fallback без БНС-данных");
{
  const input: YieldPredictionInput = { ...aiyrtauNormalYear(), bnsHistoricalMaxCha: undefined };
  const sort = lookupSort(input.declaration.sortId, input.season.crop);
  const r = computeYPotential(input, sort);
  assert("fallback применён", r.capApplied === true);
  assert("confidence low без БНС", r.confidence === "low");
  // raw × 0.50
  inRange("Y_potential ~50% от сырого Monteith", r.value, r.yPotentialRawCha * 0.45, r.yPotentialRawCha * 0.55);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 4: Kw сильно режет в засушливый год
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 4: Kw в засушливом сценарии (165 мм за май-авг)");
{
  const input = aiyrtauNormalYear();
  const sort = lookupSort(input.declaration.sortId, input.season.crop);
  const r = computeKw(input, sort);
  inRange("Kw в диапазоне 0.40–0.75 для СКО при 165 мм", r.value, 0.40, 0.75);
  assert("есть разбивка по фазам", r.phases.length === 5);
  assert("фаза flowering зафиксирована", r.phases.some((p) => p.phase === "flowering"));
  // Триангуляция: только bucket, поэтому low confidence
  assert("confidence low (только bucket-источник)", r.confidence === "low");
}

// ────────────────────────────────────────────────────────────────────────────
// Test 5: Kw триангуляция с NDVI peak
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 5: Kw триангуляция bucket + NDVI peak");
{
  const input = aiyrtauNormalYear();
  const sort = lookupSort(input.declaration.sortId, input.season.crop);
  // NDVI peak 0.50 — соответствует Kw≈0.67 (0.50/0.75)
  const r = computeKw(input, sort, { ndviPeak: 0.50 });
  assert("два источника в triangulation", r.triangulation.bucket != null && r.triangulation.ndviValidation != null);
  assert("confidence medium или high с 2 источниками", r.confidence === "medium" || r.confidence === "high");
}

// ────────────────────────────────────────────────────────────────────────────
// Test 6: Kw fail-safe — bucket жёсткая засуха vs NDVI зелёное поле
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 6: Kw fail-safe (bucket says drought, NDVI says fine)");
{
  // Имитируем драут-сценарий по осадкам
  const input: YieldPredictionInput = {
    ...aiyrtauNormalYear(),
    weather: {
      ...aiyrtauNormalYear().weather,
      swEqMm: 50,
      monthlyPrecipMm: [
        { month: 5, mm: 10 }, { month: 6, mm: 15 },
        { month: 7, mm: 10 }, { month: 8, mm: 10 },
      ],
    },
  };
  const sort = lookupSort(input.declaration.sortId, input.season.crop);
  // NDVI peak 0.75 — поле зелёное вопреки расчёту
  const r = computeKw(input, sort, { ndviPeak: 0.75 });
  // Fail-safe: при таком расхождении confidence должна упасть
  assert("confidence low при противоречии", r.confidence === "low");
  assert("в reasons есть предупреждение", r.reasons.some((s) => s.includes("⚠️") || s.toLowerCase().includes("ошибка")));
}

// ────────────────────────────────────────────────────────────────────────────
// Test 7: K_harvest задержка
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 7: K_harvest при задержке уборки");
{
  const input = aiyrtauNormalYear();
  // Уборка 5 сентября, оптимум = 10 мая + 100 дн = 18 августа → задержка 18 дн.
  const r = computeKHarvest(input);
  assert("delay в районе 18 дней", Math.abs(r.delayDays - 18) <= 2, `got ${r.delayDays}`);
  assert("loss capped на 20%", r.capped === true);
  inRange("K_harvest = 0.80", r.value, 0.78, 0.82);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 8: K_harvest без задержки
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 8: K_harvest без задержки (baseline ~8%)");
{
  const input: YieldPredictionInput = {
    ...aiyrtauNormalYear(),
    declaration: { ...aiyrtauNormalYear().declaration, harvestDate: "2025-08-18" },
  };
  const r = computeKHarvest(input);
  assert("delay = 0", r.delayDays === 0);
  inRange("K_harvest ~0.92 (baseline 8%)", r.value, 0.91, 0.93);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 9: K_spray из декларации
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 9: K_spray варианты");
{
  const base = aiyrtauNormalYear();
  // confirmed
  const r1 = computeKSpray(base);
  assert("declared + Qoldau + окно → K=1.00", r1.value === 1.00 && r1.herbicide.status === "confirmed");

  // missing
  const noSpray: YieldPredictionInput = {
    ...base,
    declaration: { ...base.declaration, herbicideApplied: { declared: false, qoldauVerified: false } },
  };
  const r2 = computeKSpray(noSpray);
  assert("ничего не задекларировано → K=0.85", r2.value === 0.85 && r2.herbicide.status === "missing");

  // partial — только декларация без чека
  const partial: YieldPredictionInput = {
    ...base,
    declaration: { ...base.declaration, herbicideApplied: { declared: true, qoldauVerified: false, date: "2025-06-05" } },
  };
  const r3 = computeKSpray(partial);
  assert("декларация без чека → K=0.95", r3.value === 0.95 && r3.herbicide.status === "partial");
}

// ────────────────────────────────────────────────────────────────────────────
// Test 10: K_nutrition Mitscherlich
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 10: K_nutrition при норме и удобрениях");
{
  const input = aiyrtauNormalYear();
  const r = computeKNutrition(input);
  // P=14 + 40×0.1=4 → 18 мг/кг (выше нормы 15); N=85+60×0.42=110; K насыщен
  inRange("K_nutrition в диапазоне 0.85–0.98 при умеренной фертилизации", r.value, 0.85, 0.98);
  assert("четыре элемента в byElement", r.byElement.length === 4);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 11: главный сценарий — Айыртауский 2025, нормальный фермер
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 11: главный сценарий — реалистичный прогноз");
{
  const input = aiyrtauNormalYear();
  const r = predictYield(input, { seed: 42 });

  console.log("\n" + formatPredictionReport(r));
  console.log("");

  inRange("прогноз медиана в реалистичном диапазоне 4-12 ц/га", r.p50Cha, 4.0, 12.0);
  assert("P10 < P50 < P90", r.p10Cha < r.p50Cha && r.p50Cha < r.p90Cha);
  inRange("P10 > 2 ц/га", r.p10Cha, 2.0, r.p50Cha);
  inRange("P90 < 15 ц/га", r.p90Cha, r.p50Cha, 15.0);
  assert("Kd advisory mode", r.components.kd.mode === "advisory");
  assert("Kd значение = 1.0", r.components.kd.value === 1.0);
  assert("peer interpretation определена", r.peer.interpretation !== "no_peers");
  assert("есть provenance trail в reasons", r.components.yPotential.reasons.length > 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 12: антифрод — заявка 22 ц/га при тех же условиях
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 12: peer-comparison ловит завышенную декларацию");
{
  // Симулируем: фермер заявил 22 ц/га, соседи 11.5
  const input: YieldPredictionInput = {
    ...aiyrtauNormalYear(),
    declaration: { ...aiyrtauNormalYear().declaration, declaredYieldCha: 22 },
  };
  const r = predictYield(input, { seed: 42 });
  // peer comparison сравнивает Y_predicted с peerAvg=11.5
  // Y_predicted будет около 6-7 → значительно НИЖЕ 11.5
  // Это значит: модель предсказывает хуже соседей, что говорит о плохой
  // агротехнике конкретного хозяйства; при этом если задекларировано 22 —
  // явно фрод.
  assert("Y_predicted сильно ниже заявленных 22", r.p50Cha < 12, `p50=${r.p50Cha}`);
  assert("P90 ниже заявленных 22", r.p90Cha < 22, `p90=${r.p90Cha}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 13: хороший год (200мм осадков, без жары, в срок)
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 13: хороший год — выше прогноз");
{
  const input: YieldPredictionInput = {
    ...aiyrtauNormalYear(),
    weather: {
      ...aiyrtauNormalYear().weather,
      monthlyPrecipMm: [
        { month: 5, mm: 50 }, { month: 6, mm: 60 },
        { month: 7, mm: 55 }, { month: 8, mm: 45 },
      ],
      daysTmaxOver32: 0,
      daysWindOver17: 0,
    },
    declaration: { ...aiyrtauNormalYear().declaration, harvestDate: "2025-08-18" },
  };
  const r = predictYield(input, { seed: 42 });
  inRange("хороший год p50 > 8 ц/га", r.p50Cha, 8.0, 22.0);
  assert("хороший год выше засушливого", r.p50Cha > 8.0);
}

// ────────────────────────────────────────────────────────────────────────────
// Test 14: монте-карло intervals make sense
// ────────────────────────────────────────────────────────────────────────────
console.log("\nTest 14: Monte Carlo даёт разумные интервалы");
{
  const input = aiyrtauNormalYear();
  const r = predictYield(input, { seed: 42, monteCarloIterations: 2000 });
  const spread = r.p90Cha - r.p10Cha;
  // Spread должен быть нетривиальный (учитывая неопределённости) но
  // не безумно широкий
  inRange("P90-P10 spread reasonable", spread, 1.5, 12);
  // Воспроизводимость с одним seed
  const r2 = predictYield(input, { seed: 42, monteCarloIterations: 2000 });
  assert("Monte Carlo детерминистичен при том же seed", r.p50Cha === r2.p50Cha);
}

// ────────────────────────────────────────────────────────────────────────────
// Final
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n========================`);
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
process.exit(0);
