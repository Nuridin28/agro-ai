// ────────────────────────────────────────────────────────────────────────────
// Клиент к ArcGIS REST API Гипрозема (portal.giprozem.kz).
// Серверный — позволяет обходить CORS и нормализовать ответ в нашу схему.
//
// Слой 61 «ah_09_107» содержит результаты агрохимобследования участков:
//   n   — азот (мг/кг)
//   p   — фосфор (мг/кг)
//   k   — калий  (мг/кг)
//   gum — гумус (%)
//   ph  — кислотность
//   nazvxoz — название хозяйства (ТОО/КХ)
//   yearob  — год обследования
//   s       — площадь, га
// ────────────────────────────────────────────────────────────────────────────

export const GIPROZEM_BASE = "https://portal.giprozem.kz/Proxy/Map/Ah/MapServer";
// Дефолтный слой (для legacy /api/giprozem без layer)
export const GIPROZEM_LAYER = 61;
export const GIPROZEM_LAYER_NAME = "ah_09_107";

export interface GiprozemFeature {
  attributes: {
    n: number | null;
    p: number | null;
    k: number | null;
    gum: number | null;
    ph: number | null;
    nazvxoz: string | null;
    yearob: number | null;
    s: number | null;
  };
  geometry?: { rings?: number[][][] }; // EPSG:3857
}

export interface GiprozemResponse {
  features: GiprozemFeature[];
  exceededTransferLimit?: boolean;
  layer: string;
  layerId?: number;
  query: Record<string, string>;
  fetchedAt: string;
}

export async function queryGiprozem(
  params: Record<string, string>,
  layerId: number = GIPROZEM_LAYER,
  opts: { timeoutMs?: number } = {},
): Promise<GiprozemResponse> {
  const url = new URL(`${GIPROZEM_BASE}/${layerId}/query`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // Дефолт 25с (было 15с) — Гипрозем ArcGIS на нагруженных слоях с
  // returnGeometry=true иногда отвечает 18-22с. На сервере стабильно даём
  // больше, но клиенту в UI стоит подсветить долгое ожидание.
  const timeoutMs = opts.timeoutMs ?? 25000;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Giprozem ${res.status}: ${await res.text()}`);
  const data = await res.json() as { features?: GiprozemFeature[]; exceededTransferLimit?: boolean };
  return {
    features: data.features ?? [],
    exceededTransferLimit: data.exceededTransferLimit,
    layer: GIPROZEM_LAYER_NAME,
    layerId,
    query: params,
    fetchedAt: new Date().toISOString(),
  };
}

// Все участки слоя (района) — полигоны + агрохимия. Опц. фильтр по году.
export function buildLayerDumpQuery(recordCount = 200, year?: number): Record<string, string> {
  return {
    where: year && Number.isFinite(year) ? `yearob=${year}` : "1=1",
    outFields: "n,p,k,gum,ph,nazvxoz,yearob,s",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: String(recordCount),
    f: "json",
  };
}

// Bbox-запрос (envelope). При наличии year добавляем where=yearob=YYYY поверх spatial-фильтра.
export function buildBboxQuery(
  west: number, south: number, east: number, north: number,
  withGeometry = true, recordCount = 200, year?: number
): Record<string, string> {
  const params: Record<string, string> = {
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "n,p,k,gum,ph,nazvxoz,yearob,s",
    returnGeometry: withGeometry ? "true" : "false",
    outSR: "4326",
    resultRecordCount: String(recordCount),
    f: "json",
  };
  if (year && Number.isFinite(year)) params.where = `yearob=${year}`;
  return params;
}

// Список уникальных годов обследования в слое (returnDistinctValues=true).
// Полезно для UI-селектора годов.
export function buildDistinctYearsQuery(): Record<string, string> {
  return {
    where: "yearob IS NOT NULL",
    outFields: "yearob",
    returnDistinctValues: "true",
    returnGeometry: "false",
    orderByFields: "yearob DESC",
    f: "json",
  };
}

// Поиск по названию хозяйства: nazvxoz LIKE '%X%' (+ опц. yearob = year)
export function buildNameQuery(name: string, recordCount = 50, withGeometry = false, year?: number): Record<string, string> {
  const safe = name.replace(/'/g, "''").trim();
  const where = year && Number.isFinite(year)
    ? `nazvxoz LIKE '%${safe}%' AND yearob=${year}`
    : `nazvxoz LIKE '%${safe}%'`;
  return {
    where,
    outFields: "n,p,k,gum,ph,nazvxoz,yearob,s",
    returnGeometry: withGeometry ? "true" : "false",
    outSR: "4326",
    resultRecordCount: String(recordCount),
    f: "json",
  };
}

// Точечный пространственный запрос (клик по карте, lat/lng)
export function buildPointQuery(lat: number, lng: number, withGeometry = true): Record<string, string> {
  return {
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "n,p,k,gum,ph,nazvxoz,yearob,s",
    returnGeometry: withGeometry ? "true" : "false",
    outSR: "4326",
    f: "json",
  };
}
