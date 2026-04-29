import { NextRequest } from "next/server";
import { queryGiprozem, buildNameQuery } from "@/lib/giprozem";
import { GIPROZEM_LAYERS, OBLAST_NAMES } from "@/lib/giprozem-catalog";

// Поиск хозяйства в Гипрозем по фрагменту названия. Возвращает агрегированный
// результат: уникальные nazvxoz + сколько у каждого участков и в каком районе.
//
// /api/auth/lookup-farm?q=Шерубай
//
// Поскольку API ArcGIS не делает cross-layer query, мы параллельно сканируем
// все 172 слоя пакетами по 12 одновременных запросов.

interface MatchAgg {
  nazvxoz: string;
  layerId: number;
  layerName: string;
  oblastCode: string;
  oblastName: string;
  parcels: number;
  sample: any;
}

const CONCURRENCY = 12;

async function scanInBatches<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    const slice = items.slice(i, i + n);
    const results = await Promise.allSettled(slice.map(fn));
    for (const r of results) if (r.status === "fulfilled") out.push(r.value);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 3) {
    return Response.json({ error: "минимум 3 символа в названии" }, { status: 400 });
  }
  const params = buildNameQuery(q.trim(), 30, false);

  const matches = new Map<string, MatchAgg>();

  await scanInBatches(GIPROZEM_LAYERS, CONCURRENCY, async (layer) => {
    try {
      const data = await queryGiprozem(params, layer.id);
      for (const f of data.features) {
        const name = f.attributes.nazvxoz;
        if (!name) continue;
        const key = `${name}::${layer.id}`;
        if (!matches.has(key)) {
          matches.set(key, {
            nazvxoz: name,
            layerId: layer.id,
            layerName: layer.name,
            oblastCode: layer.oblastCode,
            oblastName: OBLAST_NAMES[layer.oblastCode] ?? layer.oblastCode,
            parcels: 1,
            sample: f.attributes,
          });
        } else {
          matches.get(key)!.parcels++;
        }
      }
    } catch { /* skip layer */ }
    return true;
  });

  const list = Array.from(matches.values()).sort((a, b) => b.parcels - a.parcels).slice(0, 25);
  return Response.json({
    matches: list,
    totalLayersScanned: GIPROZEM_LAYERS.length,
  });
}
