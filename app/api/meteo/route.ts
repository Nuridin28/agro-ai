import { NextRequest } from "next/server";
import { fetchRealMeteo } from "@/lib/real-meteo";

// Прокси к Open-Meteo. Без ключа. Кешируем 1 час.
// /api/meteo?lat=52.78&lng=64.02&year=2024
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const yearStr = sp.get("year");
  const year = yearStr ? Number(yearStr) : undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat/lng required" }, { status: 400 });
  }
  if (year !== undefined && !Number.isFinite(year)) {
    return Response.json({ error: "bad year" }, { status: 400 });
  }
  try {
    const data = await fetchRealMeteo(lat, lng, year);
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
