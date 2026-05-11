// CDSE Catalog API — поиск Sentinel-1 SLC сцен, покрывающих полигон.
// Используется для построения списка SLC-пар (start, end), пригодных для
// расчёта interferometric coherence. Реальная часть, не мок: catalog
// возвращает существующие сцены, которые потом подаются в HyP3/SNAP.
//
// Endpoint: https://catalogue.dataspace.copernicus.eu/odata/v1/Products
// Документация: https://documentation.dataspace.copernicus.eu/APIs/OData.html
//
// Что нам нужно от пары для coherence:
//   1. Один путь (path/relativeOrbit) — иначе геометрия разная
//   2. Один пролёт (ASCENDING vs DESCENDING)
//   3. IW SLC mode (для зернового поля в KZ)
//   4. Интервал 6 или 12 дней — physical revisit S1A/S1C

import type { FieldPolygon } from "./types";

const ODATA_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products";

export interface SLCScene {
  id: string;                  // UUID продукта в CDSE
  name: string;                // PRD имя (S1A_IW_SLC__1SDV_2025...)
  startDate: string;           // sensing start (YYYY-MM-DD)
  endDate: string;             // sensing end
  platform: "S1A" | "S1B" | "S1C";
  orbitDirection: "ASCENDING" | "DESCENDING";
  relativeOrbit: number;       // путь, нужен для парности
  cycle: number;               // цикл миссии — для уникализации пар
}

export interface SLCSearchOpts {
  startDate: string;           // YYYY-MM-DD
  endDate: string;
  orbitDirection?: "ASCENDING" | "DESCENDING";
  maxResults?: number;
}

// Поиск SLC-сцен над полигоном. Возвращает упорядоченный по дате список.
// Никогда не кидает — на ошибке возвращает [].
export async function searchS1SLC(
  polygon: FieldPolygon,
  opts: SLCSearchOpts,
): Promise<SLCScene[]> {
  try {
    // OData $filter — собираем условие. Geographic intersect через
    // OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((...)))').
    const wkt = polygonToWkt(polygon);
    const filter = [
      `Collection/Name eq 'SENTINEL-1'`,
      `OData.CSC.Intersects(area=geography'SRID=4326;${wkt}')`,
      `ContentDate/Start gt ${opts.startDate}T00:00:00.000Z`,
      `ContentDate/Start lt ${opts.endDate}T23:59:59.999Z`,
      // Только IW SLC — единственный режим, пригодный для агро-CCD.
      `contains(Name, '_IW_SLC_')`,
      `Online eq true`,
    ].join(" and ");

    const url = `${ODATA_URL}?$filter=${encodeURIComponent(filter)}&$orderby=ContentDate/Start asc&$top=${opts.maxResults ?? 100}&$expand=Attributes`;

    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[cdse-catalog] HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return [];
    }
    const j = await res.json() as { value: Array<Record<string, unknown>> };
    return (j.value ?? [])
      .map(parseScene)
      .filter((s): s is SLCScene => !!s)
      .filter((s) => !opts.orbitDirection || s.orbitDirection === opts.orbitDirection);
  } catch (e) {
    console.warn("[cdse-catalog] search error:", (e as Error).message);
    return [];
  }
}

// Группирует сцены в пары coherence-ready: один путь, одна orbit, разница
// 6 или 12 дней. На входе — отсортированный по дате список сцен. На выходе —
// последовательность пар.
export function buildCoherencePairs(scenes: SLCScene[]): { a: SLCScene; b: SLCScene; intervalDays: number }[] {
  // Группируем по relativeOrbit + orbitDirection — это «один трек».
  const groups = new Map<string, SLCScene[]>();
  for (const s of scenes) {
    const k = `${s.orbitDirection}#${s.relativeOrbit}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  const out: { a: SLCScene; b: SLCScene; intervalDays: number }[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i], b = arr[i + 1];
      const days = Math.round((new Date(b.startDate).getTime() - new Date(a.startDate).getTime()) / 86_400_000);
      // 6 дней — S1A+S1C на этом треке; 12 дней — только S1A или только S1C.
      // Иногда CDSE отдаёт частичные сцены — отсекаем нестандартные интервалы.
      if (days === 6 || days === 12) out.push({ a, b, intervalDays: days });
    }
  }
  return out.sort((a, b) => a.a.startDate.localeCompare(b.a.startDate));
}

// ───────────────────────────────────────────────────────────────────────────
// Internals
// ───────────────────────────────────────────────────────────────────────────

function polygonToWkt(polygon: FieldPolygon): string {
  const closed = polygon[0][0] === polygon[polygon.length - 1][0]
    && polygon[0][1] === polygon[polygon.length - 1][1]
    ? polygon
    : [...polygon, polygon[0]];
  const pts = closed.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${pts}))`;
}

function parseScene(p: Record<string, unknown>): SLCScene | null {
  const name = String(p.Name ?? "");
  if (!name.includes("_IW_SLC_")) return null;
  const platformMatch = /^(S1[ABC])/.exec(name);
  const platform = (platformMatch?.[1] ?? "S1A") as SLCScene["platform"];
  const start = String((p.ContentDate as { Start?: string } | undefined)?.Start ?? "").slice(0, 10);
  const end   = String((p.ContentDate as { End?: string } | undefined)?.End ?? "").slice(0, 10);

  const attrs = (p.Attributes as Array<{ Name?: string; Value?: unknown }> | undefined) ?? [];
  const attr = (n: string): unknown => attrs.find((a) => a?.Name === n)?.Value;
  const orbitDirection = String(attr("orbitDirection") ?? "ASCENDING") as SLCScene["orbitDirection"];
  const relativeOrbit = Number(attr("relativeOrbitNumber") ?? 0) | 0;
  const cycle = Number(attr("cycleNumber") ?? 0) | 0;

  if (!start) return null;
  return {
    id: String(p.Id ?? ""),
    name,
    startDate: start,
    endDate: end || start,
    platform,
    orbitDirection,
    relativeOrbit,
    cycle,
  };
}
