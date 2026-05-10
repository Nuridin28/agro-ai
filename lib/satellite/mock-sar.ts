// Детерминированный мок-генератор Sentinel-1 GRD рядов для демо без CDSE.
// Использует тот же SCENARIO_REGISTRY, что и mock-NDVI: один и тот же
// "сценарий поля" даёт согласованные NDVI и SAR события.
//
// Кривая VV/VH моделирует жизненный цикл яровых зерновых:
//   bare soil  → tillage spike (VV) → sowing (VH rise) → vegetation peak →
//   maturation → harvest (VH drop) → bare soil
//
// Шум (speckle) — гауссовский, с фиксированным сидом по координатам полигона,
// чтобы повторные вызовы давали одинаковый ряд.

import type { FieldPolygon, SARTimeseries, SARPoint } from "./types";
import type { MockScenario } from "./mock-provider";

interface SARScenarioParams {
  // Базовые уровни VV/VH (дБ) на bare soil.
  vvBase: number;
  vhBase: number;
  // День года старта роста биомассы (с этой даты VH идёт вверх до пика).
  growthStartDoy: number;
  // День года пика биомассы.
  peakDoy: number;
  // День года уборки (резкое падение VH).
  harvestDoy: number | null;
  // Амплитуда подъёма VH от base до пика (дБ).
  vhAmplitude: number;
  // День года события вспашки (всплеск VV) — null если вспашки не было.
  tillageDoy: number | null;
  vvTillageRise: number;
}

function paramsFor(scenario: MockScenario): SARScenarioParams {
  switch (scenario) {
    case "medium":
      return { vvBase: -11, vhBase: -22, growthStartDoy: 130, peakDoy: 195, harvestDoy: 240, vhAmplitude: 9, tillageDoy: 115, vvTillageRise: 3 };
    case "strong":
      return { vvBase: -10, vhBase: -22, growthStartDoy: 125, peakDoy: 200, harvestDoy: 245, vhAmplitude: 11, tillageDoy: 110, vvTillageRise: 4 };
    case "no_sowing":
      // Поле спит весь сезон — VH не растёт, VV не всплескивает. inactivity.
      return { vvBase: -12, vhBase: -22, growthStartDoy: 999, peakDoy: 999, harvestDoy: null, vhAmplitude: 0.4, tillageDoy: null, vvTillageRise: 0 };
    case "late_growth":
      return { vvBase: -11, vhBase: -22, growthStartDoy: 165, peakDoy: 220, harvestDoy: 260, vhAmplitude: 8, tillageDoy: 150, vvTillageRise: 3 };
    case "weak":
      return { vvBase: -11, vhBase: -22, growthStartDoy: 135, peakDoy: 195, harvestDoy: 235, vhAmplitude: 4.5, tillageDoy: 115, vvTillageRise: 2 };
    case "post_subsidy_inactive":
      // Посев был, потом — тишина (VH не падает, остаётся плоским).
      return { vvBase: -11, vhBase: -22, growthStartDoy: 130, peakDoy: 195, harvestDoy: null, vhAmplitude: 7, tillageDoy: 115, vvTillageRise: 3 };
  }
}

function doyOf(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const y0 = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - y0) / 86_400_000);
}

function dateFromDoy(year: number, doy: number): string {
  const ms = Date.UTC(year, 0, doy);
  return new Date(ms).toISOString().slice(0, 10);
}

// Линейная интерполяция между двумя контрольными точками.
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0;
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
}

// Псевдошум на сиде из координат — стабильно для одного полигона.
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xffff) / 0xffff;
  };
}

// Гауссовский шум через Box-Muller на детерминированном rand'е.
function gaussian(rand: () => number, sigma: number): number {
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

// Главный API — генерирует ряд VV/VH по сезонной модели.
export function mockS1Series(
  polygon: FieldPolygon,
  startDate: string,
  endDate: string,
  scenario: MockScenario,
): SARTimeseries {
  const p = paramsFor(scenario);
  // Сид — сумма округлённых координат полигона, чтобы для одного полигона
  // ряд был воспроизводим, а для соседних — отличался.
  let seed = 12345;
  for (const [lng, lat] of polygon) seed = (seed + Math.round(lng * 1e4) + Math.round(lat * 1e4) * 31) >>> 0;
  const rand = seededRand(seed);

  const year = Number(startDate.slice(0, 4));
  const startDoy = doyOf(startDate);
  const endDoy = doyOf(endDate);
  const points: SARPoint[] = [];

  for (let doy = startDoy; doy <= endDoy; doy += 6) {
    // VH модель: bare → grow → peak → harvest drop → bare
    let vh = p.vhBase;
    if (p.harvestDoy !== null && doy >= p.harvestDoy) {
      vh = p.vhBase + 1; // после уборки чуть выше bare (стерня)
    } else if (doy >= p.peakDoy) {
      vh = lerp(doy, p.peakDoy, p.harvestDoy ?? endDoy + 30, p.vhBase + p.vhAmplitude, p.vhBase + p.vhAmplitude * 0.7);
    } else if (doy >= p.growthStartDoy) {
      vh = lerp(doy, p.growthStartDoy, p.peakDoy, p.vhBase, p.vhBase + p.vhAmplitude);
    }

    // VV модель: bare → tillage spike (короткий) → ровно
    let vv = p.vvBase;
    if (p.tillageDoy !== null && doy >= p.tillageDoy && doy <= p.tillageDoy + 12) {
      const t = Math.abs(doy - p.tillageDoy) / 12;
      vv = p.vvBase + p.vvTillageRise * (1 - t);
    }

    // Speckle ~ 0.6–1.2 dB, разное для VV и VH (independent looks).
    vv += gaussian(rand, 0.8);
    vh += gaussian(rand, 0.7);

    points.push({
      date: dateFromDoy(year, doy),
      vvDb: +vv.toFixed(2),
      vhDb: +vh.toFixed(2),
      sampleCount: 3000 + Math.floor(rand() * 200),
    });
  }

  return { polygon, startDate, endDate, points, providerId: "mock" };
}
