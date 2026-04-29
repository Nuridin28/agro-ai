// Точка входа модуля спутниковой верификации.

import type {
  FieldPolygon,
  SatelliteProvider,
  SatelliteVerification,
  InactivityCheckInput,
  InactivityCheckResult,
  SatelliteImage,
  YearOverYear,
  SatelliteImageKind,
} from "./types";
import { MockSatelliteProvider } from "./mock-provider";
import { SentinelHubProvider } from "./sentinel-hub-provider";
import { verifyFromTimeseries, computeFeatures } from "./ndvi";
import { runInactivityCheck } from "./inactivity";

// Lazy-singleton провайдера — выбирается по env. По умолчанию — mock.
let providerInstance: SatelliteProvider | null = null;

export function getSatelliteProvider(): SatelliteProvider {
  if (providerInstance) return providerInstance;
  const id = process.env.SAT_PROVIDER ?? "mock";
  if (id === "sentinel-hub") {
    const clientId = process.env.SH_CLIENT_ID;
    const clientSecret = process.env.SH_CLIENT_SECRET;
    if (clientId && clientSecret) {
      providerInstance = new SentinelHubProvider({ clientId, clientSecret });
      return providerInstance;
    }
    console.warn("[satellite] SAT_PROVIDER=sentinel-hub but creds missing, falling back to mock");
  }
  providerInstance = new MockSatelliteProvider();
  return providerInstance;
}

// Только для тестов / интеграционных моков.
export function setSatelliteProvider(p: SatelliteProvider | null): void {
  providerInstance = p;
}

export interface VerifySatelliteInput {
  polygon: FieldPolygon;
  startDate: string;
  endDate: string;
  expectedSowingDate?: string;
  // Включить рендер 3 миниатюр через провайдер.getImagePNG (если доступен).
  includeImages?: boolean;
  // Включить запрос ряда NDVI за прошлый сезон для YoY-сравнения.
  includeYoY?: boolean;
}

export async function verifySatellite(input: VerifySatelliteInput): Promise<SatelliteVerification> {
  const provider = getSatelliteProvider();
  const series = await provider.getNDVITimeseries(input.polygon, input.startDate, input.endDate);
  const base = verifyFromTimeseries(series, { expectedSowingDate: input.expectedSowingDate });

  // Параллельно подтягиваем YoY и миниатюры. Любой сбой не валит основной
  // результат — карточка отрисуется без блоков.
  const enrich: Promise<unknown>[] = [];
  let images: SatelliteImage[] | undefined;
  let yoy: YearOverYear | null | undefined;

  if (input.includeImages && base.features) {
    enrich.push(buildImages(provider, input, base.features.growthStartDate, base.features.peakDate)
      .then((arr) => { images = arr; })
      .catch((e) => { console.warn("[verifySatellite] images failed:", e); }));
  }

  if (input.includeYoY && base.features) {
    enrich.push(buildYoY(provider, input, base.features)
      .then((y) => { yoy = y; })
      .catch((e) => { console.warn("[verifySatellite] YoY failed:", e); yoy = null; }));
  }

  if (enrich.length > 0) await Promise.allSettled(enrich);
  return { ...base, images, yoy };
}

async function buildImages(
  provider: SatelliteProvider,
  input: VerifySatelliteInput,
  growthStartDate: string | null,
  peakDate: string | null,
): Promise<SatelliteImage[]> {
  if (!provider.getImagePNG) return [];
  const midOfWindow = midpointDate(input.startDate, input.endDate);
  // Если задана expectedSowingDate И она попадает в окно сезона — используем
  // её как «начало сезона». Иначе — апрель этого сезона (~до посева).
  const baselineInWindow = input.expectedSowingDate
    && input.expectedSowingDate >= input.startDate
    && input.expectedSowingDate <= input.endDate
    ? input.expectedSowingDate
    : input.startDate;

  // Подписи в карточке — простым языком, без жаргона "baseline / NDVI peak".
  const dates: { label: string; date: string; kind: SatelliteImageKind }[] = [
    { label: "До вегетации",   date: baselineInWindow,                kind: "truecolor" },
    { label: "Поле зеленеет",  date: growthStartDate ?? midOfWindow,  kind: "ndvi" },
    { label: "Пик зелени",     date: peakDate ?? input.endDate,       kind: "ndvi" },
  ];
  const out: SatelliteImage[] = [];
  for (const d of dates) {
    out.push({
      date: d.date,
      kind: d.kind,
      label: d.label,
      url: imageUrl(input.polygon, d.date, d.kind),
    });
  }
  return out;
}

async function buildYoY(
  provider: SatelliteProvider,
  input: VerifySatelliteInput,
  current: NonNullable<SatelliteVerification["features"]>,
): Promise<YearOverYear | null> {
  const yearMatch = /^(\d{4})/.exec(input.startDate);
  if (!yearMatch) return null;
  const previousYear = Number(yearMatch[1]) - 1;
  const prevStart = input.startDate.replace(/^\d{4}/, String(previousYear));
  const prevEnd   = input.endDate.replace(/^\d{4}/, String(previousYear));

  const series = await provider.getNDVITimeseries(input.polygon, prevStart, prevEnd);
  const prev = computeFeatures(series);
  if (!prev) {
    return {
      previousYear,
      ndviMaxPrev: null,
      growthStartPrev: null,
      ndviMaxDelta: null,
      growthStartDeltaDays: null,
    };
  }

  const ndviMaxDelta = +(current.ndviMax - prev.ndviMax).toFixed(3);
  let growthStartDeltaDays: number | null = null;
  if (current.growthStartDate && prev.growthStartDate) {
    // Сравниваем по day-of-year, чтобы исключить разницу годов.
    const cur = doy(current.growthStartDate);
    const prv = doy(prev.growthStartDate);
    growthStartDeltaDays = cur - prv;
  }
  return {
    previousYear,
    ndviMaxPrev: prev.ndviMax,
    growthStartPrev: prev.growthStartDate,
    ndviMaxDelta,
    growthStartDeltaDays,
  };
}

function imageUrl(polygon: FieldPolygon, date: string, kind: SatelliteImageKind): string {
  // Сериализуем полигон в base64url, чтобы передать его GET-параметром.
  const json = JSON.stringify(polygon);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  return `/api/satellite/image?p=${b64}&date=${date}&kind=${kind}`;
}

function midpointDate(a: string, b: string): string {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return new Date((ta + tb) / 2).toISOString().slice(0, 10);
}

function doy(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

export async function checkInactivity(input: InactivityCheckInput): Promise<InactivityCheckResult> {
  return runInactivityCheck(getSatelliteProvider(), input);
}

export type {
  FieldPolygon,
  SatelliteVerification,
  InactivityCheckInput,
  InactivityCheckResult,
} from "./types";
export { SAT_THRESHOLDS } from "./ndvi";
export { INACTIVITY_THRESHOLDS } from "./inactivity";
