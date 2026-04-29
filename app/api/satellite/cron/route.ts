// GET /api/satellite/cron — еженедельный обход всех известных полей с
// субсидиями. Для каждого поля запускает inactivity-check от заявленной
// даты посева и собирает алерты SUSPICIOUS / ALERT в одну ленту.
//
// Защита: если задан env SAT_CRON_SECRET — требуем заголовок
// "x-cron-secret: <value>". Иначе эндпоинт открыт (для локального dev).

import { NextRequest } from "next/server";
import { allFieldPolygons } from "@/lib/mock/field-polygons";
import { seasonFor } from "@/lib/mock/crop";
import { findFarmer } from "@/lib/mock/farmers";
import { checkInactivity } from "@/lib/satellite";

export async function GET(req: NextRequest) {
  const secret = process.env.SAT_CRON_SECRET;
  if (secret) {
    const got = req.headers.get("x-cron-secret");
    if (got !== secret) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const records = allFieldPolygons();
  const checks = await Promise.all(records.map(async (rec) => {
    const season = seasonFor(rec.farmerId);
    const farmer = findFarmer(rec.farmerId);
    if (!season || !farmer) return null;
    try {
      const result = await checkInactivity({
        polygon: rec.polygon,
        baselineDate: season.declaredSowingDate,
        windowDays: 45,
      });
      return {
        farmerId: rec.farmerId,
        farmerName: farmer.legalName,
        fieldId: rec.fieldId,
        baselineDate: season.declaredSowingDate,
        subsidyTenge: season.subsidyTenge,
        result,
      };
    } catch (e) {
      return {
        farmerId: rec.farmerId,
        farmerName: farmer.legalName,
        fieldId: rec.fieldId,
        baselineDate: season.declaredSowingDate,
        subsidyTenge: season.subsidyTenge,
        error: String(e),
      };
    }
  }));

  const items = checks.filter(<T>(x: T | null): x is T => x !== null);
  const alerts = items.filter((i) => i.result && (i.result.level === "ALERT" || i.result.level === "SUSPICIOUS"));
  const watch  = items.filter((i) => i.result && i.result.level === "WATCH");
  const ok     = items.filter((i) => i.result && i.result.level === "OK");

  return Response.json({
    runAt: new Date().toISOString(),
    totals: {
      checked: items.length,
      alerts: alerts.length,
      watch: watch.length,
      ok: ok.length,
    },
    alerts,
    watch,
    ok,
  });
}
