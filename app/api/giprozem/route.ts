import { NextRequest } from "next/server";
import {
  queryGiprozem,
  buildNameQuery,
  buildPointQuery,
  buildLayerDumpQuery,
  buildBboxQuery,
  buildDistinctYearsQuery,
  GIPROZEM_LAYER,
  GIPROZEM_LAYER_NAME,
} from "@/lib/giprozem";
import { findLayer } from "@/lib/giprozem-catalog";

// Серверный прокси к ArcGIS REST API Гипрозема — обход CORS, нормализация ответа.
//
// Поддерживаемые режимы:
//   ?layer=12&bbox=W,S,E,N         — участки в видимой области (с опц. ?year=YYYY)
//   ?layer=12                       — все участки района (с опц. ?year=YYYY)
//   ?layer=12&years=1               — уникальные года обследования в слое (для селектора)
//   ?q=Шерубай                      — поиск по названию хозяйства (с опц. ?year=)
//   ?lat=51.12&lng=71.43            — точечный пространственный запрос
//
// year — опционально, фильтр yearob=YYYY поверх любого режима.

export const revalidate = 86400;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q");
  const lat = sp.get("lat");
  const lng = sp.get("lng");
  const layerStr = sp.get("layer");
  const bboxStr = sp.get("bbox");
  const yearsOnly = sp.get("years") === "1";
  const yearStr = sp.get("year");
  const withGeometry = sp.get("geom") !== "0";
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? "200") || 200));

  let layerId = GIPROZEM_LAYER;
  let layerName = GIPROZEM_LAYER_NAME;
  if (layerStr) {
    const lid = Number(layerStr);
    const meta = findLayer(lid);
    if (!meta) return Response.json({ error: `Unknown layer ${layerStr}` }, { status: 400 });
    layerId = meta.id;
    layerName = meta.name;
  }

  const year = yearStr ? Number(yearStr) : undefined;
  if (year !== undefined && !Number.isFinite(year)) {
    return Response.json({ error: "Bad year" }, { status: 400 });
  }

  try {
    let params: Record<string, string>;

    if (yearsOnly) {
      // Возвращаем уникальные года для слоя — для UI-селектора
      params = buildDistinctYearsQuery();
    } else if (bboxStr) {
      const parts = bboxStr.split(",").map(Number);
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        return Response.json({ error: "Bbox must be W,S,E,N (numbers)" }, { status: 400 });
      }
      const [w, s, e, n] = parts as [number, number, number, number];
      params = buildBboxQuery(w, s, e, n, withGeometry, limit, year);
    } else if (layerStr && !q && !lat) {
      params = buildLayerDumpQuery(limit, year);
    } else if (q && q.trim().length >= 2) {
      params = buildNameQuery(q, limit, withGeometry, year);
    } else if (lat && lng) {
      const la = Number(lat); const ln = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) {
        return Response.json({ error: "Bad lat/lng" }, { status: 400 });
      }
      params = buildPointQuery(la, ln, withGeometry);
      if (year) params.where = `yearob=${year}`;
    } else {
      return Response.json({ error: "Pass ?layer= or ?q= or ?lat=&lng=" }, { status: 400 });
    }

    const data = await queryGiprozem(params, layerId);
    return Response.json({ ...data, layer: layerName, layerId }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" },
    });
  } catch (e) {
    // Таймаут на стороне Гипрозема — частая ситуация при большой выборке
    // (район с тысячами участков + returnGeometry=true). Отдаём 504 с пустым
    // features, чтобы клиент мог отрисовать остальные слои и показать toast.
    const isTimeout = (e as Error)?.name === "TimeoutError";
    const status = isTimeout ? 504 : 502;
    return Response.json({
      error: String(e),
      timeout: isTimeout,
      layer: layerName,
      layerId,
      features: [],
    }, { status });
  }
}
