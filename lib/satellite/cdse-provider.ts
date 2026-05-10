// Copernicus Data Space Ecosystem (CDSE) — провайдер Sentinel-1 GRD ряда
// для фрод-чека по событиям. CDSE использует тот же Sentinel Hub API,
// что и SH Cloud, но с другими endpoint-ами и отдельной регистрацией:
//   token: https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
//   stats: https://sh.dataspace.copernicus.eu/api/v1/statistics
//
// Регистрация и креды — на https://dataspace.copernicus.eu/. Бесплатно.
// Положить CDSE_CLIENT_ID и CDSE_CLIENT_SECRET в .env.local.
//
// ВАЖНО: класс ничего не делает, если кредов нет. fetchS1Series возвращает
// null. Так весь SAR-флоу остаётся отключаемым: пока user не подключил
// CDSE, страницы рендерятся как сейчас, без SAR-карточки и findings.

import type { FieldPolygon, SARTimeseries, SARPoint } from "./types";

const CDSE_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const CDSE_STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

// Evalscript: средний Sigma0 → дБ по VV и VH на полигон. dataMask=1 — пиксель
// внутри полигона и снят в этом интервале. Sigma0 уже линейный (мощность);
// log10 даёт дБ. Зажимаем минимум 1e-6 чтобы избежать -Inf.
const S1_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: [
      { id: "vv_db", bands: 1, sampleType: "FLOAT32" },
      { id: "vh_db", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return { vv_db: [NaN], vh_db: [NaN], dataMask: [0] };
  var vv = Math.max(s.VV, 1e-6);
  var vh = Math.max(s.VH, 1e-6);
  return {
    vv_db: [10 * Math.log(vv) / Math.LN10],
    vh_db: [10 * Math.log(vh) / Math.LN10],
    dataMask: [1]
  };
}`;

interface OAuthToken { value: string; expiresAt: number }

interface StatsResponse {
  data: Array<{
    interval: { from: string; to: string };
    outputs: Record<string, {
      bands: Record<string, {
        stats: {
          mean?: number | string;
          sampleCount?: number;
          noDataCount?: number;
        };
      }>;
    }>;
  }>;
}

let cachedToken: OAuthToken | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(CDSE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CDSE OAuth ${res.status}: ${await res.text().catch(() => "")}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: j.access_token,
    expiresAt: Date.now() + Math.max(60, j.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

function closeRing(poly: FieldPolygon): FieldPolygon {
  if (poly.length < 3) return poly;
  const a = poly[0], b = poly[poly.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) return poly;
  return [...poly, [a[0], a[1]]];
}

function numOrNaN(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return NaN;
}

// Главная функция модуля: вернёт SARTimeseries либо null, если CDSE не
// настроен. Никогда не кидает наружу — все ошибки логируются и → null,
// чтобы рендер страниц не блокировался.
export async function fetchS1SeriesFromCDSE(
  polygon: FieldPolygon,
  startDate: string,
  endDate: string,
): Promise<SARTimeseries | null> {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const token = await getToken(clientId, clientSecret);
    const ring = closeRing(polygon);

    const reqBody = {
      input: {
        bounds: {
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
        },
        data: [{
          type: "sentinel-1-grd",
          dataFilter: {
            acquisitionMode: "IW",
            polarization: "DV",
            resolution: "HIGH",
          },
          processing: {
            backCoeff: "GAMMA0_TERRAIN",
            orthorectify: true,
          },
        }],
      },
      aggregation: {
        timeRange: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
        // 6 дней — физический минимум revisit S1 (когда S1A+S1C активны).
        aggregationInterval: { of: "P6D" },
        evalscript: S1_EVALSCRIPT,
        resx: 0.0005,
        resy: 0.0005,
      },
    };

    const res = await fetch(CDSE_STATS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify(reqBody),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn("[cdse-provider] stats failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const j = await res.json() as StatsResponse;
    const points: SARPoint[] = [];
    for (const item of j.data ?? []) {
      const vvStats = item.outputs?.vv_db?.bands?.B0?.stats;
      const vhStats = item.outputs?.vh_db?.bands?.B0?.stats;
      const vv = numOrNaN(vvStats?.mean);
      const vh = numOrNaN(vhStats?.mean);
      if (!Number.isFinite(vv) || !Number.isFinite(vh)) continue;
      points.push({
        date: item.interval.from.slice(0, 10),
        vvDb: +vv.toFixed(2),
        vhDb: +vh.toFixed(2),
        sampleCount: vvStats?.sampleCount ?? 0,
      });
    }
    return { polygon, startDate, endDate, points, providerId: "copernicus" };
  } catch (e) {
    console.warn("[cdse-provider] fetchS1Series error:", (e as Error).message);
    return null;
  }
}
