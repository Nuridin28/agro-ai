// Mock-провайдер NDVI: генерирует детерминированный временной ряд по полигону
// и окну дат. Используется в Этапе 1 — без внешних ключей.
//
// Кривая NDVI генерируется по фенологической модели для яровых зерновых
// северного Казахстана: bare soil → рост → пик → созревание → послеуборочный
// низкий уровень. Шум, облачность и сценарии («нет посева» / «поздний посев»
// / «слабая вегетация») задаются через реестр сценариев по центроиду полигона.

import type {
  FieldPolygon,
  NDVIPoint,
  NDVITimeseries,
  SatelliteProvider,
  SatelliteImageKind,
} from "./types";

export type MockScenario =
  | "medium"        // нормальное поле, посев в срок, средний пик
  | "strong"        // отличный год / поливной участок
  | "no_sowing"     // bare soil весь сезон → подозрение на фрод
  | "late_growth"   // поздний посев — рост стартует на 30+ дней позже
  | "weak"          // вегетация есть, но пик низкий (<0.4)
  | "post_subsidy_inactive"; // выдали субсидию — на снимках ничего не происходит

// Реестр сценариев по центроидам известных полей (см. mock/field-polygons).
// Ключ — округлённый "lat,lng" центроида. Для неизвестного полигона — "medium".
const SCENARIO_REGISTRY = new Map<string, MockScenario>();

export function registerMockScenario(centroid: [number, number], scenario: MockScenario) {
  SCENARIO_REGISTRY.set(centroidKey(centroid), scenario);
}

function centroidKey([lat, lng]: [number, number]): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function polygonCentroid(poly: FieldPolygon): [number, number] {
  // Если кольцо замкнуто (последняя точка равна первой) — отбрасываем дубль,
  // иначе центроид смещается в сторону первой точки и ломает lookup сценария.
  const last = poly.length - 1;
  const closed = last > 0
    && poly[0][0] === poly[last][0]
    && poly[0][1] === poly[last][1];
  const pts = closed ? poly.slice(0, last) : poly;
  let sumLat = 0, sumLng = 0;
  for (const [lng, lat] of pts) { sumLat += lat; sumLng += lng; }
  return [sumLat / pts.length, sumLng / pts.length];
}

// Псевдослучайный генератор с сидом — чтобы кривая для одного и того же поля
// и окна была повторяемой между запросами.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromPolygon(poly: FieldPolygon): number {
  // Сид = округлённая сумма координат, чтобы небольшой сдвиг полигона не
  // ломал сценарий (мы матчим по центроиду в SCENARIO_REGISTRY).
  let s = 0;
  for (const [lng, lat] of poly) s += Math.round(lat * 100) * 73 + Math.round(lng * 100) * 31;
  return Math.abs(s) || 1;
}

// Фенологическая модель NDVI для яровой пшеницы в северном Казахстане.
// dayOfYear: 1..365. growthStart, peakDay — параметры сценария.
function phenologyNDVI(dayOfYear: number, opts: {
  growthStartDoy: number; peakDoy: number; harvestDoy: number; peakNdvi: number;
}): number {
  const { growthStartDoy, peakDoy, harvestDoy, peakNdvi } = opts;
  const bare = 0.14;
  const postHarvest = 0.20;
  if (dayOfYear < growthStartDoy) return bare;
  if (dayOfYear > harvestDoy) return postHarvest;
  if (dayOfYear <= peakDoy) {
    // Логистический рост от bare к peakNdvi
    const t = (dayOfYear - growthStartDoy) / Math.max(1, peakDoy - growthStartDoy);
    return bare + (peakNdvi - bare) * smoothStep(t);
  }
  // Спад от пика к послеуборочному
  const t = (dayOfYear - peakDoy) / Math.max(1, harvestDoy - peakDoy);
  return peakNdvi - (peakNdvi - postHarvest) * smoothStep(t);
}

function smoothStep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

interface ScenarioParams {
  growthStartDoy: number;
  peakDoy: number;
  harvestDoy: number;
  peakNdvi: number;
  // Базовый шанс облачного снимка (0..1) — Sentinel-2 в северном Казахстане
  // даёт 30–50% облачности летом.
  baseCloudChance: number;
}

function paramsFor(scenario: MockScenario, year: number): ScenarioParams {
  // Эталонные DOY (примерно): посев 15 мая (135), пик 10 июля (191),
  // уборка 25 августа (237).
  const base = { growthStartDoy: 135, peakDoy: 191, harvestDoy: 237, peakNdvi: 0.72, baseCloudChance: 0.35 };
  switch (scenario) {
    case "medium":               return base;
    case "strong":               return { ...base, peakNdvi: 0.85 };
    case "weak":                 return { ...base, peakNdvi: 0.32 };
    case "late_growth":          return { ...base, growthStartDoy: 175, peakDoy: 215, harvestDoy: 250, peakNdvi: 0.55 };
    case "no_sowing":            return { ...base, growthStartDoy: 999, peakNdvi: 0.16 };
    case "post_subsidy_inactive": return { ...base, growthStartDoy: 999, peakNdvi: 0.16 };
  }
  // Неиспользуемая ветка для будущих сценариев — TS exhaustiveness.
  void year;
  return base;
}

// Генерируем точки с шагом ~5 дней (revisit Sentinel-2). Дополнительно
// случайно выбрасываем часть из них как «облачные» — в выход они идут
// с cloudCoverPct > 70 и не учитываются в фичах (см. ndvi.ts).
function generateSeries(
  polygon: FieldPolygon,
  startDate: string,
  endDate: string,
  scenario: MockScenario,
): NDVITimeseries {
  const seed = seedFromPolygon(polygon);
  const rnd = mulberry32(seed);
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end   = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { polygon, startDate, endDate, points: [], droppedCloudy: 0, providerId: "mock" };
  }

  const points: NDVIPoint[] = [];
  let droppedCloudy = 0;
  const stepMs = 5 * 86_400_000; // Sentinel-2 revisit
  let yearForParams = new Date(start).getUTCFullYear();
  let params = paramsFor(scenario, yearForParams);

  for (let t = start; t <= end; t += stepMs) {
    const d = new Date(t);
    if (d.getUTCFullYear() !== yearForParams) {
      yearForParams = d.getUTCFullYear();
      params = paramsFor(scenario, yearForParams);
    }
    const ideal = phenologyNDVI(dayOfYear(d), params);
    // Шум ±0.04, плюс небольшой синусоидальный дребезг
    const noise = (rnd() - 0.5) * 0.08;
    const ndvi = clamp(ideal + noise, -0.1, 0.95);
    // Облачность: базовый шанс + летний бонус
    const month = d.getUTCMonth() + 1;
    const summerBonus = (month >= 6 && month <= 8) ? 0.1 : 0;
    const cloudChance = params.baseCloudChance + summerBonus;
    const cloudy = rnd() < cloudChance;
    const cloudPct = cloudy ? 70 + rnd() * 30 : rnd() * 40;
    if (cloudy) droppedCloudy += 1;
    // Эмулируем пространственную σ NDVI: для устойчивых сценариев — низкая,
    // для weak/no_sowing — повышенная (поле «лоскутное»).
    const baseStd = (scenario === "weak" || scenario === "no_sowing" || scenario === "post_subsidy_inactive")
      ? 0.18 : 0.09;
    const stDev = +(baseStd + (rnd() - 0.5) * 0.04).toFixed(3);
    points.push({
      date: d.toISOString().slice(0, 10),
      ndvi: +ndvi.toFixed(3),
      cloudCoverPct: +cloudPct.toFixed(1),
      stDev,
    });
  }
  return { polygon, startDate, endDate, points, droppedCloudy, providerId: "mock" };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export class MockSatelliteProvider implements SatelliteProvider {
  readonly id = "mock" as const;
  readonly displayName = "Mock Sentinel-2 (NDVI)";

  async getNDVITimeseries(
    polygon: FieldPolygon,
    startDate: string,
    endDate: string,
  ): Promise<NDVITimeseries> {
    const centroid = polygonCentroid(polygon);
    const scenario = SCENARIO_REGISTRY.get(centroidKey(centroid)) ?? "medium";
    return generateSeries(polygon, startDate, endDate, scenario);
  }

  // Mock-плейсхолдер: 1×1 PNG с цветом, зависящим от сценария и kind. Это
  // не реальный спутниковый снимок — но достаточно, чтобы UI рендерил
  // что-то осмысленное в dev-режиме без реальных кредов SH.
  async getImagePNG(
    polygon: FieldPolygon,
    date: string,
    kind: SatelliteImageKind,
    _widthPx?: number,
  ): Promise<Buffer> {
    void date; void _widthPx;
    const centroid = polygonCentroid(polygon);
    const scenario = SCENARIO_REGISTRY.get(centroidKey(centroid)) ?? "medium";
    return solidPng(colorFor(scenario, kind));
  }
}

function colorFor(scenario: MockScenario, kind: SatelliteImageKind): [number, number, number] {
  // Возвращаем псевдо-цвет «карты»: для NDVI-карты используем зелёные тона
  // для здоровой вегетации, коричневые для no_sowing / inactive; для
  // truecolor — нейтральный землистый/зелёный.
  const ndviAt = (s: MockScenario): number => {
    switch (s) {
      case "strong": return 0.78;
      case "medium": return 0.55;
      case "weak":   return 0.30;
      case "late_growth": return 0.45;
      case "no_sowing":
      case "post_subsidy_inactive": return 0.16;
    }
  };
  const v = ndviAt(scenario);
  if (kind === "ndvi") {
    if (v < 0.20) return [115, 81, 56];
    if (v < 0.35) return [204, 158, 76];
    if (v < 0.55) return [242, 217, 89];
    if (v < 0.70) return [140, 204, 89];
    return [51, 153, 51];
  }
  // truecolor: землистый / зелёный пропорционально NDVI
  const r = Math.round(140 - 80 * v);
  const g = Math.round(120 + 60 * v);
  const b = Math.round(80 + 30 * v);
  return [r, g, b];
}

// Минимальный валидный PNG 8×8 одного цвета — собран вручную через ZIP+CRC.
// Используем готовую заранее структуру: PNG signature + IHDR + IDAT + IEND.
function solidPng([r, g, b]: [number, number, number]): Buffer {
  const W = 8, H = 8;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk("IHDR", Buffer.concat([
    u32(W), u32(H),
    Buffer.from([8, 2, 0, 0, 0]), // bit depth 8, RGB, no filter/interlace
  ]));
  // Несжатый PNG-IDAT: на каждую строку заголовок 0x00 (filter none) + W*3 байта RGB.
  const rows: Buffer[] = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    row[0] = 0x00;
    for (let x = 0; x < W; x++) {
      row[1 + x * 3] = r; row[1 + x * 3 + 1] = g; row[1 + x * 3 + 2] = b;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  // zlib stored (deflate без сжатия): 0x78 0x01 + блоки stored + adler32.
  const idat = chunk("IDAT", deflateStored(raw));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = u32(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = u32(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Deflate-block с уровнем 0 (stored) — упаковывает raw bytes без LZ.
function deflateStored(raw: Buffer): Buffer {
  const header = Buffer.from([0x78, 0x01]); // zlib header (deflate, default)
  const blocks: Buffer[] = [];
  const MAX = 0xffff;
  for (let i = 0; i < raw.length; i += MAX) {
    const last = i + MAX >= raw.length;
    const slice = raw.subarray(i, Math.min(raw.length, i + MAX));
    const len = slice.length;
    const block = Buffer.alloc(5 + len);
    block[0] = last ? 0x01 : 0x00;
    block.writeUInt16LE(len, 1);
    block.writeUInt16LE(~len & 0xffff, 3);
    slice.copy(block, 5);
    blocks.push(block);
  }
  const adler = u32(adler32(raw));
  return Buffer.concat([header, ...blocks, adler]);
}

function adler32(buf: Buffer): number {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
