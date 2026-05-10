// GET /api/satellite/sar/refresh — батчевый refetch S1 GRD-рядов для всех
// зарегистрированных полигонов (мок + реальные юзеры) за текущий сезон.
// Пишет в field_sar_observations через upsert.
//
// Защита: при заданном env SAT_CRON_SECRET требуется заголовок
// "x-cron-secret: <value>". Без секрета — открыт (для локального dev).
// Полностью no-op, если CDSE_CLIENT_ID/SECRET не настроены.

import { NextRequest } from "next/server";
import { allFieldPolygons } from "@/lib/mock/field-polygons";
import { getAllUsers } from "@/lib/users-store";
import { getS1Series, isSARConfigured } from "@/lib/satellite/sar";
import type { FieldPolygon } from "@/lib/satellite/types";

export const dynamic = "force-dynamic";

interface FieldEntry {
  ownerId: string;
  ownerLabel: string;
  polygon: FieldPolygon;
}

async function collectAllPolygons(): Promise<FieldEntry[]> {
  const out: FieldEntry[] = [];
  // Мок-полигоны (демо-фермеры F-xxx)
  for (const rec of allFieldPolygons()) {
    out.push({ ownerId: rec.farmerId, ownerLabel: rec.farmerId, polygon: rec.polygon });
  }
  // Реальные юзеры U-xxx с сохранёнными контурами полей
  for (const u of await getAllUsers()) {
    for (const f of u.fields ?? []) {
      if (f.polygon4326 && f.polygon4326.length >= 4) {
        out.push({
          ownerId: `U-${u.id}`,
          ownerLabel: `${u.farmName} (${f.nazvxoz})`,
          polygon: f.polygon4326 as FieldPolygon,
        });
      }
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const secret = process.env.SAT_CRON_SECRET;
  if (secret) {
    const got = req.headers.get("x-cron-secret");
    if (got !== secret) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isSARConfigured()) {
    return Response.json({
      ok: false,
      error: "CDSE not configured",
      hint: "Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in .env.local (register at https://dataspace.copernicus.eu/)",
    }, { status: 503 });
  }

  // Год сезона: «последний завершённый» — если сейчас до октября, берём
  // прошлый год, иначе текущий. То же правило, что на инспекторской странице.
  const yearParam = req.nextUrl.searchParams.get("year");
  const now = new Date();
  const defaultYear = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const year = yearParam ? Number(yearParam) : defaultYear;
  const startDate = `${year}-04-01`;
  const endDate   = `${year}-10-15`;

  const entries = await collectAllPolygons();
  const startedAt = Date.now();

  // Идём по полигонам строго последовательно — CDSE/SH-API имеют rate limit
  // и параллельные запросы добавят шум без выигрыша на 10–100 полей.
  const results = [];
  for (const e of entries) {
    const t0 = Date.now();
    const series = await getS1Series(e.polygon, startDate, endDate, { forceRefresh: true }).catch(() => null);
    results.push({
      owner: e.ownerLabel,
      points: series?.points.length ?? 0,
      ms: Date.now() - t0,
      ok: !!series,
    });
  }

  return Response.json({
    ok: true,
    year,
    range: { startDate, endDate },
    totalMs: Date.now() - startedAt,
    totalFields: entries.length,
    refreshedFields: results.filter((r) => r.ok).length,
    failedFields: results.filter((r) => !r.ok).length,
    results,
  });
}
