// Точка входа модуля coherence: оркестрация HyP3 / mock / Postgres-кеш.
//
// Поток:
//   1. readFromDb — есть ли пары в field_sar_observations с source='s1_coherence'?
//   2. fetchCoherenceFromHyP3 — если EARTHDATA-creds настроены, дёргаем
//   3. Если HyP3 вернул null И SAT_PROVIDER=mock — синтезируем mock-ряд
//   4. Если оба null — возвращаем null, coherence-канал отключается

import { and, eq, gte, lte, asc } from "drizzle-orm";
import { db } from "../db";
import { fieldSarObservations } from "../db/schema";
import type { FieldPolygon, CoherenceTimeseries, CoherencePair } from "./types";
import { fetchCoherenceFromHyP3, isHyP3Configured } from "./hyp3-client";
import { mockCoherenceSeries } from "./mock-coherence";
import { lookupScenario, type MockScenario } from "./mock-provider";
import { polygonKey, polygonCentroid } from "./sar";

const CACHE_TTL_CURRENT_MS = 7 * 24 * 60 * 60 * 1000;
function ttlForRange(startDate: string): number {
  const reqYear = Number(startDate.slice(0, 4));
  const nowYear = new Date().getUTCFullYear();
  return reqYear < nowYear ? Infinity : CACHE_TTL_CURRENT_MS;
}

async function readFromDb(fieldKey: string, startDate: string, endDate: string): Promise<{ pairs: CoherencePair[]; fetchedAt: Date | null }> {
  const rows = await db
    .select()
    .from(fieldSarObservations)
    .where(and(
      eq(fieldSarObservations.fieldKey, fieldKey),
      eq(fieldSarObservations.source, "s1_coherence"),
      gte(fieldSarObservations.observationDate, startDate),
      lte(fieldSarObservations.observationDate, endDate),
    ))
    .orderBy(asc(fieldSarObservations.observationDate));

  const pairs: CoherencePair[] = [];
  let maxFetchedAt: Date | null = null;
  for (const r of rows) {
    if (r.coherence == null) continue;
    // Дата ряда — это endDate пары (наш условный «момент изменения»).
    // startDate пары пишем в id-суффикс при upsert (см. ниже).
    const parts = r.id.split("|");
    const startDate = parts.length >= 4 ? parts[3] : r.observationDate;
    pairs.push({
      startDate,
      endDate: r.observationDate,
      coherence: r.coherence,
      sampleCount: r.sampleCount ?? 0,
      source: "hyp3",
    });
    if (!maxFetchedAt || r.fetchedAt > maxFetchedAt) maxFetchedAt = r.fetchedAt;
  }
  return { pairs, fetchedAt: maxFetchedAt };
}

async function writeToDb(fieldKey: string, series: CoherenceTimeseries): Promise<void> {
  if (series.pairs.length === 0) return;
  await db
    .insert(fieldSarObservations)
    .values(series.pairs.map((p) => ({
      // id format: {fieldKey}|{endDate}|s1_coherence|{startDate}
      // startDate в суффиксе нужен чтобы restore'ить пару при чтении.
      id: `${fieldKey}|${p.endDate}|s1_coherence|${p.startDate}`,
      fieldKey,
      observationDate: p.endDate,
      source: "s1_coherence",
      vvDb: null,
      vhDb: null,
      ndvi: null,
      coherence: p.coherence,
      sampleCount: p.sampleCount,
    })))
    .onConflictDoUpdate({
      target: [fieldSarObservations.fieldKey, fieldSarObservations.observationDate, fieldSarObservations.source],
      set: {
        coherence: fieldSarObservations.coherence,
        sampleCount: fieldSarObservations.sampleCount,
        fetchedAt: new Date(),
      },
    });
}

function lookupMockScenario(polygon: FieldPolygon): MockScenario {
  const [lng, lat] = polygonCentroid(polygon);
  return lookupScenario([lat, lng]) ?? "medium";
}

// Главный API. Возвращает null если ни один источник недоступен — наверху
// этот null приведёт к graceful skip coherence-блока.
export async function getCoherenceSeries(
  polygon: FieldPolygon,
  startDate: string,
  endDate: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<CoherenceTimeseries | null> {
  const fieldKey = polygonKey(polygon);

  // 1) Read from cache
  if (!opts.forceRefresh) {
    const cache = await readFromDb(fieldKey, startDate, endDate);
    const ttl = ttlForRange(startDate);
    const fresh = cache.fetchedAt && (ttl === Infinity || Date.now() - cache.fetchedAt.getTime() < ttl);
    if (cache.pairs.length > 0 && fresh) {
      return {
        polygon,
        windowStart: startDate,
        windowEnd: endDate,
        pairs: cache.pairs,
        providerId: "hyp3",
      };
    }
  }

  // 2) Try HyP3 (real)
  const fromHyP3 = await fetchCoherenceFromHyP3(polygon, startDate, endDate);
  if (fromHyP3 && fromHyP3.pairs.length > 0) {
    await writeToDb(fieldKey, fromHyP3).catch((e) =>
      console.warn("[coherence] writeToDb failed:", (e as Error).message),
    );
    return fromHyP3;
  }

  // 3) Mock fallback
  if (process.env.SAT_PROVIDER === "mock") {
    const scenario = lookupMockScenario(polygon);
    return mockCoherenceSeries(polygon, startDate, endDate, scenario);
  }

  return null;
}

// Доступность coherence-канала для UI (true если HyP3 настроен ИЛИ мок).
export function isCoherenceConfigured(): boolean {
  if (isHyP3Configured()) return true;
  if (process.env.SAT_PROVIDER === "mock") return true;
  return false;
}
