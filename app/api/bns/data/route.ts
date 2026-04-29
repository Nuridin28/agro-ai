import { NextRequest } from "next/server";
import { fetchRegionYearTable } from "@/lib/bns";

// GET /api/bns/data?indexId=2709379
// Возвращает таблицу регион × год для показателя.
// Для прототипа без серверного кэша — каждый запрос идёт в Taldau.

export async function GET(req: NextRequest) {
  const indexIdRaw = req.nextUrl.searchParams.get("indexId");
  const periodIdRaw = req.nextUrl.searchParams.get("periodId");
  if (!indexIdRaw) {
    return Response.json({ error: "indexId обязателен" }, { status: 400 });
  }
  const indexId = +indexIdRaw;
  if (!Number.isFinite(indexId)) {
    return Response.json({ error: "indexId должен быть числом" }, { status: 400 });
  }
  const periodId = periodIdRaw ? +periodIdRaw : undefined;

  try {
    const table = await fetchRegionYearTable(indexId, periodId ? { periodId } : undefined);
    return Response.json(table);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
