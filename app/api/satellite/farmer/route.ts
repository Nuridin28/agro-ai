// GET /api/satellite/farmer?farmerId=F-001
//
// Удобная обёртка над /api/satellite/verify для existing-фермеров с моковым
// полигоном. Возвращает spatial-проверку, inactivity-проверку и полный
// verdict с учётом спутниковых findings.

import { NextRequest } from "next/server";
import { polygonForFarmer } from "@/lib/mock/field-polygons";
import { seasonFor } from "@/lib/mock/crop";
import { verifySatellite, checkInactivity } from "@/lib/satellite";
import { verifyFarmerWithSatellite } from "@/lib/verify";

export async function GET(req: NextRequest) {
  const farmerId = req.nextUrl.searchParams.get("farmerId");
  if (!farmerId) return Response.json({ error: "farmerId required" }, { status: 400 });

  const polyRec = polygonForFarmer(farmerId);
  const season = seasonFor(farmerId);
  if (!polyRec || !season) {
    return Response.json({ error: `Нет полигона/сезона для ${farmerId}` }, { status: 404 });
  }

  const startDate = `${season.year}-04-01`;
  const endDate   = `${season.year}-09-30`;

  try {
    const [spatial, inactivity, verdict] = await Promise.all([
      verifySatellite({
        polygon: polyRec.polygon,
        startDate, endDate,
        expectedSowingDate: season.declaredSowingDate,
        includeImages: true,
        includeYoY: true,
      }),
      checkInactivity({ polygon: polyRec.polygon, baselineDate: season.declaredSowingDate, windowDays: 45 }),
      verifyFarmerWithSatellite(farmerId),
    ]);
    return Response.json({
      farmerId,
      fieldId: polyRec.fieldId,
      polygon: polyRec.polygon,
      scenario: polyRec.scenario,
      window: { startDate, endDate },
      baselineDate: season.declaredSowingDate,
      spatial,
      inactivity,
      verdict,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
