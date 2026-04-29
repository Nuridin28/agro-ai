// GET /api/satellite/image?p=<base64url-json>&date=YYYY-MM-DD&kind=truecolor|ndvi
//
// Возвращает PNG-снимок поля. Использует провайдер.getImagePNG (для SH —
// Process API, для mock — плейсхолдер). Все вызовы идут через дисковый кэш.

import { NextRequest } from "next/server";
import { getSatelliteProvider } from "@/lib/satellite";
import type { FieldPolygon, SatelliteImageKind } from "@/lib/satellite/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parsePolygon(b64: string | null): FieldPolygon | null {
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const out: FieldPolygon = [];
    for (const pt of arr) {
      if (!Array.isArray(pt) || pt.length < 2) return null;
      const lon = Number(pt[0]), lat = Number(pt[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      out.push([lon, lat]);
    }
    return out;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const polygon = parsePolygon(sp.get("p"));
  const date = sp.get("date") ?? "";
  const kindRaw = sp.get("kind") ?? "ndvi";
  const widthPx = Math.min(640, Math.max(64, Number(sp.get("w") ?? 320) | 0));

  if (!polygon) return Response.json({ error: "p (base64url polygon) required" }, { status: 400 });
  if (!ISO_DATE.test(date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  const kind: SatelliteImageKind = kindRaw === "truecolor" ? "truecolor" : "ndvi";

  const provider = getSatelliteProvider();
  if (!provider.getImagePNG) {
    return Response.json({ error: `provider ${provider.id} does not support images` }, { status: 501 });
  }

  try {
    const png = await provider.getImagePNG(polygon, date, kind, widthPx);
    return new Response(png as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "image/png",
        // Кэшируем агрессивно: PNG за прошлую дату не меняется. Браузер
        // не будет дёргать SH повторно при повторном открытии страницы.
        "cache-control": "public, max-age=2592000, immutable",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
