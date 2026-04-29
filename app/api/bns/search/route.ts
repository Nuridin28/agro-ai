import { NextRequest } from "next/server";
import { searchBns } from "@/lib/bns";

// GET /api/bns/search?q=урожайность пшеницы
// Возвращает {results: [{id, name, code}, ...]} — список показателей Taldau.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return Response.json({ error: "минимум 2 символа в запросе" }, { status: 400 });
  }
  try {
    const results = await searchBns(q);
    return Response.json({ results, query: q });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
