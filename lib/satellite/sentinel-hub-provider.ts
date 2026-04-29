// Sentinel Hub провайдер: Statistical API для NDVI-рядов и Process API
// для рендеринга PNG-снимков (true-color и NDVI-карта).
//
// Конечные точки:
//   1) Sentinel Hub Cloud (платный, trial 30 дней):
//      token   : https://services.sentinel-hub.com/oauth/token
//      stats   : https://services.sentinel-hub.com/api/v1/statistics
//      process : https://services.sentinel-hub.com/api/v1/process
//   2) Copernicus Data Space Ecosystem (бесплатно):
//      token   : https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
//      stats   : https://sh.dataspace.copernicus.eu/api/v1/statistics
//      process : https://sh.dataspace.copernicus.eu/api/v1/process
// Конкретные URL переопределяются через env SH_TOKEN_URL / SH_STATS_URL / SH_PROCESS_URL.

import type {
  FieldPolygon,
  NDVITimeseries,
  NDVIPoint,
  SatelliteProvider,
  SatelliteImageKind,
} from "./types";
import { getOrFetchJSON, getOrFetchBinary } from "./cache";

const DEFAULT_TOKEN_URL   = "https://services.sentinel-hub.com/oauth/token";
const DEFAULT_STATS_URL   = "https://services.sentinel-hub.com/api/v1/statistics";
const DEFAULT_PROCESS_URL = "https://services.sentinel-hub.com/api/v1/process";

// Evalscript для Statistical API: NDVI с маской облаков по SCL.
// Облачные/некачественные пиксели возвращаем NaN — Statistical API учтёт
// в noDataCount, что даст процент облачности интервала.
const NDVI_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const cloudy = s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11;
  const valid = s.dataMask === 1 && !cloudy;
  if (!valid) return { ndvi: [NaN], dataMask: [0] };
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-9);
  return { ndvi: [ndvi], dataMask: [1] };
}`;

// Evalscript для Process API: True-color RGB-снимок (умеренный stretch).
const TRUECOLOR_EVALSCRIPT = `
//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02, s.dataMask];
}`;

// Evalscript для Process API: NDVI-карта (brown → yellow → green) с
// синеватой подсветкой облаков.
const NDVI_RENDER_EVALSCRIPT = `
//VERSION=3
function setup() {
  return { input: ["B04", "B08", "SCL", "dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [0, 0, 0, 0];
  const cloudy = s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10;
  if (cloudy) return [0.78, 0.82, 0.92, 1];
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-9);
  if (ndvi < 0.05) return [0.45, 0.32, 0.22, 1];
  if (ndvi < 0.20) return [0.80, 0.62, 0.30, 1];
  if (ndvi < 0.35) return [0.95, 0.85, 0.35, 1];
  if (ndvi < 0.55) return [0.55, 0.80, 0.35, 1];
  if (ndvi < 0.70) return [0.20, 0.60, 0.20, 1];
  return [0.05, 0.40, 0.10, 1];
}`;

export interface SentinelHubCreds {
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
  statsUrl?: string;
  processUrl?: string;
}

interface OAuthToken {
  value: string;
  expiresAt: number;
}

interface StatsResponse {
  data: Array<{
    interval: { from: string; to: string };
    outputs: Record<string, {
      bands: Record<string, {
        stats: {
          mean?: number | string;
          min?: number | string;
          max?: number | string;
          stDev?: number | string;
          sampleCount?: number;
          noDataCount?: number;
        };
      }>;
    }>;
  }>;
}

export class SentinelHubProvider implements SatelliteProvider {
  readonly id = "sentinel-hub" as const;
  readonly displayName = "Sentinel Hub Statistical + Process API";
  private creds: SentinelHubCreds;
  private token: OAuthToken | null = null;

  constructor(creds: SentinelHubCreds) {
    this.creds = creds;
  }

  private get tokenUrl()   { return this.creds.tokenUrl   ?? process.env.SH_TOKEN_URL   ?? DEFAULT_TOKEN_URL; }
  private get statsUrl()   { return this.creds.statsUrl   ?? process.env.SH_STATS_URL   ?? DEFAULT_STATS_URL; }
  private get processUrl() { return this.creds.processUrl ?? process.env.SH_PROCESS_URL ?? DEFAULT_PROCESS_URL; }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
    });
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body, cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SH OAuth ${res.status}: ${await res.text().catch(() => "")}`);
    const j = await res.json() as { access_token: string; expires_in: number };
    this.token = {
      value: j.access_token,
      expiresAt: Date.now() + Math.max(60, j.expires_in - 60) * 1000,
    };
    return this.token.value;
  }

  async getNDVITimeseries(polygon: FieldPolygon, startDate: string, endDate: string): Promise<NDVITimeseries> {
    const cacheKey = { kind: "ndvi-series-v2", polygon, startDate, endDate };
    return getOrFetchJSON("ndvi", cacheKey, async () => {
      const token = await this.getToken();
      const ring = closeRing(polygon);
      const { spanLat, spanLng } = bboxSpan(ring);
      const targetPx = 256, maxPx = 2500;
      const resx = clamp(spanLng / targetPx, spanLng / maxPx, 0.005);
      const resy = clamp(spanLat / targetPx, spanLat / maxPx, 0.005);

      const reqBody = {
        input: {
          bounds: {
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
          },
          data: [{
            type: "sentinel-2-l2a",
            dataFilter: { maxCloudCoverage: 60, mosaickingOrder: "leastCC" },
          }],
        },
        aggregation: {
          timeRange: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
          aggregationInterval: { of: "P5D" },
          evalscript: NDVI_EVALSCRIPT,
          resx, resy,
        },
      };

      const res = await fetch(this.statsUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify(reqBody), cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`SH Statistical ${res.status}: ${await res.text().catch(() => "")}`);
      const j = await res.json() as StatsResponse;

      const points: NDVIPoint[] = [];
      let droppedCloudy = 0;
      for (const item of j.data ?? []) {
        const ndviStats = item.outputs?.ndvi?.bands?.B0?.stats;
        const mean = numOrNaN(ndviStats?.mean);
        if (!ndviStats || !Number.isFinite(mean)) { droppedCloudy += 1; continue; }
        const sample = ndviStats.sampleCount ?? 0;
        const nodata = ndviStats.noDataCount ?? 0;
        const cloudPct = sample > 0 ? (nodata / sample) * 100 : 0;
        const cloudy = cloudPct > 70;
        if (cloudy) droppedCloudy += 1;
        const stdRaw = numOrNaN(ndviStats.stDev);
        points.push({
          date: item.interval.from.slice(0, 10),
          ndvi: +mean.toFixed(3),
          cloudCoverPct: +cloudPct.toFixed(1),
          stDev: Number.isFinite(stdRaw) ? +stdRaw.toFixed(3) : undefined,
        });
      }

      return { polygon, startDate, endDate, points, droppedCloudy, providerId: "sentinel-hub" };
    });
  }

  async getImagePNG(
    polygon: FieldPolygon,
    date: string,
    kind: SatelliteImageKind,
    widthPx: number = 320,
  ): Promise<Buffer> {
    const cacheKey = { kind: `image-${kind}-v1`, polygon, date, widthPx };
    return getOrFetchBinary(`image-${kind}`, cacheKey, async () => {
      const token = await this.getToken();
      const ring = closeRing(polygon);
      const { spanLat, spanLng } = bboxSpan(ring);
      // Окно ±10 дней вокруг целевой даты, чтобы было из чего выбирать с
      // mosaickingOrder=leastCC. Sentinel-2 revisit ~5 дн., этого достаточно
      // для попадания в одну ясную сцену.
      const from = addDaysISO(date, -10);
      const to   = addDaysISO(date, +10);
      const aspect = spanLat / spanLng;
      const heightPx = Math.max(64, Math.min(1024, Math.round(widthPx * aspect)));

      const evalscript = kind === "truecolor" ? TRUECOLOR_EVALSCRIPT : NDVI_RENDER_EVALSCRIPT;

      const reqBody = {
        input: {
          bounds: {
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
          },
          data: [{
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
              maxCloudCoverage: 80,
              mosaickingOrder: "leastCC",
            },
          }],
        },
        output: {
          width: widthPx,
          height: heightPx,
          responses: [{ identifier: "default", format: { type: "image/png" } }],
        },
        evalscript,
      };

      const res = await fetch(this.processUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "image/png",
          "authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(reqBody),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`SH Process ${res.status}: ${await res.text().catch(() => "")}`);
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    });
  }
}

function closeRing(poly: FieldPolygon): FieldPolygon {
  if (poly.length < 3) return poly;
  const a = poly[0], b = poly[poly.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) return poly;
  return [...poly, [a[0], a[1]]];
}

function bboxSpan(ring: FieldPolygon): { spanLat: number; spanLng: number } {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
  }
  return { spanLat: Math.max(1e-6, maxLat - minLat), spanLng: Math.max(1e-6, maxLng - minLng) };
}

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }

function numOrNaN(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return NaN;
}

function addDaysISO(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
