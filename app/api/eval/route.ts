import { NextResponse } from "next/server";
import { computeMetrics } from "@/lib/eval/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = computeMetrics();
  return NextResponse.json(m);
}
