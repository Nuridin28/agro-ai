// GET /api/satellite/coherence/refresh — async-конвейер расчёта coherence
// через ASF HyP3 для всех зарегистрированных полигонов.
//
// За один вызов делает 3 фазы:
//   PHASE 1: для каждого полигона + каждой свежей SLC-пары из CDSE,
//            которой ещё нет в field_coherence_jobs → submit в HyP3
//   PHASE 2: для всех RUNNING/PENDING джобов → опросить статус, обновить
//   PHASE 3: для всех только что SUCCEEDED → скачать coherence.tif,
//            clip mean по полигону, записать в field_sar_observations,
//            пометить status='DONE'
//
// Все фазы идемпотентны — можно дёргать сколько угодно раз. Cron раз в час
// будет постепенно подтягивать результаты по мере готовности HyP3-джобов.

import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldCoherenceJobs, fieldSarObservations } from "@/lib/db/schema";
import { allFieldPolygons } from "@/lib/mock/field-polygons";
import { getAllUsers } from "@/lib/users-store";
import { searchS1SLC } from "@/lib/satellite/cdse-catalog";
import {
  isHyP3Configured,
  submitInsarJob,
  getJob,
  downloadCoherenceTif,
} from "@/lib/satellite/hyp3-client";
import { clipMeanGeoTIFF } from "@/lib/satellite/geotiff-clip";
import { polygonKey } from "@/lib/satellite/sar";
import type { FieldPolygon } from "@/lib/satellite/types";

export const dynamic = "force-dynamic";

interface PolygonEntry {
  fieldKey: string;
  ownerLabel: string;
  polygon: FieldPolygon;
}

async function collectAllPolygons(): Promise<PolygonEntry[]> {
  const out: PolygonEntry[] = [];
  for (const rec of allFieldPolygons()) {
    out.push({ fieldKey: polygonKey(rec.polygon), ownerLabel: rec.farmerId, polygon: rec.polygon });
  }
  for (const u of await getAllUsers()) {
    for (const f of u.fields ?? []) {
      const parcels = f.parcels ?? [];
      for (let pi = 0; pi < parcels.length; pi++) {
        const p = parcels[pi];
        if (p.polygon4326 && p.polygon4326.length >= 4) {
          out.push({
            fieldKey: polygonKey(p.polygon4326 as FieldPolygon),
            ownerLabel: `${u.farmName} (${f.nazvxoz} #${pi + 1})`,
            polygon: p.polygon4326 as FieldPolygon,
          });
        }
      }
      // Legacy fallback
      if (parcels.length === 0 && f.polygon4326 && f.polygon4326.length >= 4) {
        out.push({
          fieldKey: polygonKey(f.polygon4326 as FieldPolygon),
          ownerLabel: `${u.farmName} (${f.nazvxoz})`,
          polygon: f.polygon4326 as FieldPolygon,
        });
      }
    }
  }
  // Уникализируем по fieldKey — одно и то же поле может встретиться у разных
  // юзеров (если они зарегали один контур).
  const uniq = new Map<string, PolygonEntry>();
  for (const e of out) if (!uniq.has(e.fieldKey)) uniq.set(e.fieldKey, e);
  return [...uniq.values()];
}

export async function GET(req: NextRequest) {
  const secret = process.env.SAT_CRON_SECRET;
  if (secret) {
    const got = req.headers.get("x-cron-secret");
    if (got !== secret) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isHyP3Configured()) {
    return Response.json({
      ok: false,
      error: "HyP3 not configured",
      hint: "Регистрация на urs.earthdata.nasa.gov + EARTHDATA_USER/EARTHDATA_PASS в .env.local",
    }, { status: 503 });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const now = new Date();
  const defaultYear = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const year = yearParam ? Number(yearParam) : defaultYear;
  const startDate = `${year}-04-01`;
  const endDate   = `${year}-10-15`;

  const startedAt = Date.now();
  const stats = {
    polygonsScanned: 0,
    pairsFound: 0,
    jobsSubmitted: 0,
    jobsSkipped: 0,
    jobsPolled: 0,
    jobsFinalized: 0,
    jobsFailed: 0,
    errors: [] as string[],
  };

  const polygons = await collectAllPolygons();

  // ─── PHASE 1: submit new jobs ─────────────────────────────────────────
  // Ограничение: HyP3 принимает до 10 пар на полигон-сезон, чтобы не
  // забить квоту аккаунта. Берём первые 10 свежих пар по 12-дневному ритму.
  const MAX_PAIRS_PER_POLYGON = 10;
  for (const entry of polygons) {
    stats.polygonsScanned++;
    try {
      const scenes = await searchS1SLC(entry.polygon, { startDate, endDate, maxResults: 200 });
      if (scenes.length < 2) continue;
      const pairs = scenesToPairs(scenes).slice(0, MAX_PAIRS_PER_POLYGON);
      stats.pairsFound += pairs.length;

      // Узнаём какие пары уже есть в БД (по fieldKey + pairEndDate)
      const existing = await db
        .select({ pairEndDate: fieldCoherenceJobs.pairEndDate })
        .from(fieldCoherenceJobs)
        .where(eq(fieldCoherenceJobs.fieldKey, entry.fieldKey));
      const knownDates = new Set(existing.map((e) => e.pairEndDate));

      for (const { a, b } of pairs) {
        if (knownDates.has(b.startDate)) { stats.jobsSkipped++; continue; }
        try {
          const job = await submitInsarJob({
            granuleRef: a.name,
            granuleSec: b.name,
            label: `agro-${entry.fieldKey.slice(0, 8)}-${b.startDate}`,
          });
          await db.insert(fieldCoherenceJobs).values({
            id: job.jobId,
            fieldKey: entry.fieldKey,
            pairStartDate: a.startDate,
            pairEndDate: b.startDate,
            granuleRef: a.name,
            granuleSec: b.name,
            status: job.status,
          });
          stats.jobsSubmitted++;
        } catch (e) {
          stats.errors.push(`submit ${entry.ownerLabel} ${a.startDate}→${b.startDate}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      stats.errors.push(`polygon ${entry.ownerLabel}: ${(e as Error).message}`);
    }
  }

  // ─── PHASE 2: poll running/pending jobs ───────────────────────────────
  const inProgress = await db
    .select()
    .from(fieldCoherenceJobs)
    .where(inArray(fieldCoherenceJobs.status, ["PENDING", "RUNNING"]));
  for (const row of inProgress) {
    try {
      const j = await getJob(row.id);
      stats.jobsPolled++;
      if (j.status === row.status) continue;
      const update: Partial<typeof fieldCoherenceJobs.$inferInsert> = { status: j.status };
      if (j.status === "SUCCEEDED" && j.productUrls?.length) {
        // Выбираем .zip-product url — HyP3 INSAR_ISCE_BURST даёт один основной .zip
        const zipUrl = j.productUrls.find((u) => u.endsWith(".zip")) ?? j.productUrls[0];
        update.coherenceProductUrl = zipUrl;
      }
      if (j.status === "FAILED") {
        update.errorMessage = (j.errorMessages ?? []).join("; ").slice(0, 500);
        update.completedAt = new Date();
        stats.jobsFailed++;
      }
      await db.update(fieldCoherenceJobs).set(update).where(eq(fieldCoherenceJobs.id, row.id));
    } catch (e) {
      stats.errors.push(`poll ${row.id}: ${(e as Error).message}`);
    }
  }

  // ─── PHASE 3: finalize SUCCEEDED jobs (download + clip + write) ───────
  const succeeded = await db
    .select()
    .from(fieldCoherenceJobs)
    .where(and(
      eq(fieldCoherenceJobs.status, "SUCCEEDED"),
    ));
  for (const row of succeeded) {
    if (!row.coherenceProductUrl) continue;
    try {
      // Перечитываем полигон по fieldKey — мы храним hash, не сами координаты.
      // Самый простой путь: найти entry в списке выше.
      const entry = polygons.find((p) => p.fieldKey === row.fieldKey);
      if (!entry) continue;

      const tif = await downloadCoherenceTif(row.coherenceProductUrl);
      if (!tif) {
        stats.errors.push(`download ${row.id}: no tif`);
        continue;
      }
      const result = await clipMeanGeoTIFF(tif, entry.polygon);
      if (!result) {
        stats.errors.push(`clip ${row.id}: no pixels inside polygon`);
        continue;
      }

      // Записать в field_sar_observations как s1_coherence
      await db
        .insert(fieldSarObservations)
        .values({
          id: `${row.fieldKey}|${row.pairEndDate}|s1_coherence|${row.pairStartDate}`,
          fieldKey: row.fieldKey,
          observationDate: row.pairEndDate,
          source: "s1_coherence",
          vvDb: null,
          vhDb: null,
          ndvi: null,
          coherence: +result.mean.toFixed(3),
          sampleCount: result.count,
        })
        .onConflictDoUpdate({
          target: [
            fieldSarObservations.fieldKey,
            fieldSarObservations.observationDate,
            fieldSarObservations.source,
          ],
          set: {
            coherence: +result.mean.toFixed(3),
            sampleCount: result.count,
            fetchedAt: new Date(),
          },
        });

      // Пометить job как DONE
      await db.update(fieldCoherenceJobs)
        .set({ status: "DONE", completedAt: new Date() })
        .where(eq(fieldCoherenceJobs.id, row.id));
      stats.jobsFinalized++;
    } catch (e) {
      stats.errors.push(`finalize ${row.id}: ${(e as Error).message}`);
    }
  }

  return Response.json({
    ok: true,
    year,
    range: { startDate, endDate },
    totalMs: Date.now() - startedAt,
    ...stats,
    note: "HyP3 — async; повторяйте refresh раз в час, пока inProgress != 0",
  });
}

// SLC-пары: вместо `buildCoherencePairs` из cdse-catalog здесь нам нужны
// burst-имена для INSAR_ISCE_BURST. Но `searchS1SLC` возвращает SLC granule
// (полные сцены). HyP3 для INSAR_ISCE_BURST требует burst-granule.
//
// Поэтому здесь упрощаем: используем INSAR_GAMMA (полные SLC). Это менее
// эффективно по PU, но не требует burst-search через ASF Search API.
// Для INSAR_GAMMA уровень обработки тот же — coherence получаем.
//
// Альтернатива (TODO): подключить ASF Search API (vertex.daac.asf.alaska.edu)
// для разрезания SLC на burst-имена и переключиться на INSAR_ISCE_BURST.
function scenesToPairs(scenes: Awaited<ReturnType<typeof searchS1SLC>>): { a: typeof scenes[number]; b: typeof scenes[number] }[] {
  const groups = new Map<string, typeof scenes>();
  for (const s of scenes) {
    const k = `${s.orbitDirection}#${s.relativeOrbit}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  const pairs: { a: typeof scenes[number]; b: typeof scenes[number] }[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i], b = arr[i + 1];
      const days = Math.round(
        (new Date(b.startDate).getTime() - new Date(a.startDate).getTime()) / 86_400_000,
      );
      if (days === 6 || days === 12) pairs.push({ a, b });
    }
  }
  return pairs;
}
