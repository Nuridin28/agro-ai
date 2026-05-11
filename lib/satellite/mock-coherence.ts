// Детерминированный мок-генератор Coherence ряда для демо без HyP3.
//
// Принципы модели:
//   - bare soil / стабильная поверхность → высокая γ (0.5-0.7)
//   - в окне tillage / harvest / sowing → γ падает до 0.15-0.30
//   - между событиями γ восстанавливается за 1-2 пары
//   - speckle ~0.05 (γ — более стабильная метрика чем backscatter)

import type { FieldPolygon, CoherenceTimeseries, CoherencePair } from "./types";
import type { MockScenario } from "./mock-provider";

interface CoherenceScenarioParams {
  baseGamma: number;          // фоновое γ для bare/post-harvest
  vegGamma: number;           // γ во время устойчивой вегетации (обычно ниже бара)
  growthStartDoy: number;
  peakDoy: number;
  harvestDoy: number | null;
  tillageDoy: number | null;
}

function paramsFor(scenario: MockScenario): CoherenceScenarioParams {
  switch (scenario) {
    case "medium":
      return { baseGamma: 0.55, vegGamma: 0.42, growthStartDoy: 130, peakDoy: 195, harvestDoy: 240, tillageDoy: 115 };
    case "strong":
      return { baseGamma: 0.58, vegGamma: 0.45, growthStartDoy: 125, peakDoy: 200, harvestDoy: 245, tillageDoy: 110 };
    case "no_sowing":
      // Если поле не работало — γ стабильно высокая весь сезон (нет событий).
      return { baseGamma: 0.65, vegGamma: 0.65, growthStartDoy: 999, peakDoy: 999, harvestDoy: null, tillageDoy: null };
    case "late_growth":
      return { baseGamma: 0.55, vegGamma: 0.42, growthStartDoy: 165, peakDoy: 220, harvestDoy: 260, tillageDoy: 150 };
    case "weak":
      return { baseGamma: 0.55, vegGamma: 0.50, growthStartDoy: 135, peakDoy: 195, harvestDoy: 235, tillageDoy: 115 };
    case "post_subsidy_inactive":
      // Посев был, потом — тишина (нет уборки → γ остаётся стабильной).
      return { baseGamma: 0.55, vegGamma: 0.42, growthStartDoy: 130, peakDoy: 195, harvestDoy: null, tillageDoy: 115 };
  }
}

function doyOf(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const y0 = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - y0) / 86_400_000);
}

function dateFromDoy(year: number, doy: number): string {
  return new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);
}

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xffff) / 0xffff;
  };
}

// γ в момент пары (a, b). Если в окне (a, b) есть событие — γ обвалится.
function gammaForPair(a: number, b: number, p: CoherenceScenarioParams): number {
  // base γ зависит от стадии (bare / veg)
  const stage = (doy: number) => {
    if (p.harvestDoy !== null && doy >= p.harvestDoy + 6) return p.baseGamma; // post-harvest bare
    if (doy >= p.growthStartDoy) return p.vegGamma;                           // веге
    return p.baseGamma;                                                        // pre-sow bare
  };
  let g = (stage(a) + stage(b)) / 2;

  // События между a и b → drop γ.
  // Tillage: γ → 0.15-0.20 (вспашка сильно меняет структуру)
  if (p.tillageDoy !== null && a <= p.tillageDoy && b >= p.tillageDoy) g = 0.18;
  // Sowing: γ → 0.30 (рассеивание зерна + лёгкое заделывание)
  if (a <= p.growthStartDoy && b >= p.growthStartDoy) g = Math.min(g, 0.30);
  // Harvest: γ → 0.22 (комбайн сильно нарушает структуру)
  if (p.harvestDoy !== null && a <= p.harvestDoy && b >= p.harvestDoy) g = 0.22;

  return g;
}

export function mockCoherenceSeries(
  polygon: FieldPolygon,
  startDate: string,
  endDate: string,
  scenario: MockScenario,
): CoherenceTimeseries {
  const p = paramsFor(scenario);
  // Sid по полигону для воспроизводимости.
  let seed = 9876;
  for (const [lng, lat] of polygon) {
    seed = (seed + Math.round(lng * 1e4) + Math.round(lat * 1e4) * 31) >>> 0;
  }
  const rand = seededRand(seed);

  const year = Number(startDate.slice(0, 4));
  const startDoy = doyOf(startDate);
  const endDoy = doyOf(endDate);
  const pairs: CoherencePair[] = [];

  // Шаг 6 дней — нормальный revisit S1A+S1C на priorite треке.
  for (let doy = startDoy; doy + 6 <= endDoy; doy += 6) {
    const a = doy, b = doy + 6;
    let g = gammaForPair(a, b, p);
    // Speckle ~ 0.04 std
    g += (rand() - 0.5) * 0.08;
    g = Math.max(0.05, Math.min(0.95, g));
    pairs.push({
      startDate: dateFromDoy(year, a),
      endDate: dateFromDoy(year, b),
      coherence: +g.toFixed(3),
      sampleCount: 3000 + Math.floor(rand() * 200),
      source: "mock",
    });
  }

  return {
    polygon,
    windowStart: startDate,
    windowEnd: endDate,
    pairs,
    providerId: "mock",
  };
}
