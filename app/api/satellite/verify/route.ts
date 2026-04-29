// POST /api/satellite/verify — основной эндпоинт по ТЗ.
//
// Body:
//   {
//     "field_polygon": [[lon, lat], ...],
//     "start_date": "YYYY-MM-DD",
//     "end_date":   "YYYY-MM-DD",
//     "expected_sowing_date": "YYYY-MM-DD"   // опционально
//   }
//
// Response (см. types/SatelliteVerification + camelCase):
//   {
//     "status": "OK" | "INSUFFICIENT_DATA" | "ERROR",
//     "sowing_detected": boolean,
//     "growth_start_date": "YYYY-MM-DD" | null,
//     "vegetation_level": "none" | "weak" | "medium" | "strong",
//     "risk_flag": "LOW" | "MEDIUM" | "HIGH",
//     "features": { ndvi_mean, ndvi_max, ... } | null,
//     "reasons": string[],
//     ...
//   }

import { NextRequest } from "next/server";
import { verifySatellite } from "@/lib/satellite";
import type { FieldPolygon, SatelliteVerification } from "@/lib/satellite/types";

interface VerifyBody {
  field_polygon?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  expected_sowing_date?: unknown;
  include_images?: unknown;
  include_yoy?: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parsePolygon(raw: unknown): FieldPolygon | { error: string } {
  if (!Array.isArray(raw) || raw.length < 3) return { error: "field_polygon: нужен массив минимум из 3 точек [lon, lat]" };
  const out: FieldPolygon = [];
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) return { error: "field_polygon: каждая точка — [lon, lat]" };
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { error: "field_polygon: координаты должны быть числами" };
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { error: "field_polygon: координаты вне допустимого диапазона" };
    out.push([lon, lat]);
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Невалидный JSON в теле запроса" }, { status: 400 });
  }

  const polyParsed = parsePolygon(body.field_polygon);
  if ("error" in polyParsed) return Response.json({ error: polyParsed.error }, { status: 400 });
  const startDate = String(body.start_date ?? "");
  const endDate   = String(body.end_date ?? "");
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    return Response.json({ error: "start_date / end_date должны быть в формате YYYY-MM-DD" }, { status: 400 });
  }
  if (endDate < startDate) {
    return Response.json({ error: "end_date должна быть не раньше start_date" }, { status: 400 });
  }
  const expectedSowingDate = body.expected_sowing_date != null ? String(body.expected_sowing_date) : undefined;
  if (expectedSowingDate && !ISO_DATE.test(expectedSowingDate)) {
    return Response.json({ error: "expected_sowing_date должна быть в формате YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const result = await verifySatellite({
      polygon: polyParsed,
      startDate, endDate,
      expectedSowingDate,
      includeImages: !!body.include_images,
      includeYoY: !!body.include_yoy,
    });
    return Response.json(serialize(result));
  } catch (e) {
    return Response.json({ status: "ERROR", error: String(e) }, { status: 502 });
  }
}

// Сериализация в snake_case по ТЗ.
function serialize(v: SatelliteVerification) {
  return {
    status: v.status,
    sowing_detected: v.sowingDetected,
    growth_start_date: v.growthStartDate,
    vegetation_level: v.vegetationLevel,
    risk_flag: v.riskFlag,
    features: v.features ? {
      ndvi_mean: v.features.ndviMean,
      ndvi_max: v.features.ndviMax,
      ndvi_min: v.features.ndviMin,
      growth_start_date: v.features.growthStartDate,
      peak_date: v.features.peakDate,
      vegetation_present: v.features.vegetationPresent,
      points_used: v.features.pointsUsed,
      points_dropped: v.features.pointsDropped,
      heterogeneity_stdev:    v.features.heterogeneityStdev,
      growth_rate_ndvi_day:   v.features.growthRateNdviPerDay,
      days_to_peak:           v.features.daysToPeak,
      season_length_days:     v.features.seasonLengthDays,
    } : null,
    reasons: v.reasons,
    window: v.window,
    provider: v.provider,
    fetched_at: v.fetchedAt,
    source: v.source,
    images: v.images ?? null,
    yoy: v.yoy ? {
      previous_year:           v.yoy.previousYear,
      ndvi_max_prev:           v.yoy.ndviMaxPrev,
      growth_start_prev:       v.yoy.growthStartPrev,
      ndvi_max_delta:          v.yoy.ndviMaxDelta,
      growth_start_delta_days: v.yoy.growthStartDeltaDays,
    } : null,
  };
}
