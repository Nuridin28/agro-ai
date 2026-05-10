// Главная точка входа SAR-модуля. Над CDSE-провайдером — слой кеша в
// Postgres (таблица field_sar_observations). Поток:
//
//   getS1Series(polygon, year)
//     ├ если в БД есть свежий ряд за этот сезон → отдаём из БД
//     ├ иначе → fetchS1SeriesFromCDSE → upsert каждой точки → отдаём
//     └ если CDSE не настроен → null (всё SAR-флоу отключается)
//
// Зачем БД (а не дисковый кэш как у NDVI): SAR-точек 30+ за сезон,
// несколько полей, плюс будет cron-prefetch — нам нужна одна точка истины,
// которую может писать batch-воркер и читать рендер. fs-кэш плохо подходит
// для concurrent доступа.

import { createHash } from "node:crypto";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { db } from "../db";
import { fieldSarObservations } from "../db/schema";
import type { FieldPolygon, SARTimeseries, SARPoint } from "./types";
import { fetchS1SeriesFromCDSE } from "./cdse-provider";

// Стабильный ключ полигона: округляем координаты до 5 знаков (~1 м точности
// для широт KZ) и хешируем. Если фермер перерегистрируется и присылает тот
// же контур — попадаем в существующий кэш.
export function polygonKey(polygon: FieldPolygon): string {
  const rounded = polygon.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
  return createHash("sha1").update(rounded).digest("hex").slice(0, 16);
}

interface CacheReadResult {
  points: SARPoint[];
  fetchedAt: Date | null;     // макс fetchedAt по диапазону, null если кеш пустой
}

async function readFromDb(fieldKey: string, startDate: string, endDate: string): Promise<CacheReadResult> {
  const rows = await db
    .select()
    .from(fieldSarObservations)
    .where(and(
      eq(fieldSarObservations.fieldKey, fieldKey),
      eq(fieldSarObservations.source, "s1_grd"),
      gte(fieldSarObservations.observationDate, startDate),
      lte(fieldSarObservations.observationDate, endDate),
    ))
    .orderBy(asc(fieldSarObservations.observationDate));

  const points: SARPoint[] = [];
  let maxFetchedAt: Date | null = null;
  for (const r of rows) {
    if (r.vvDb == null || r.vhDb == null) continue;
    points.push({
      date: r.observationDate,
      vvDb: +r.vvDb.toFixed(2),
      vhDb: +r.vhDb.toFixed(2),
      sampleCount: r.sampleCount ?? 0,
    });
    if (!maxFetchedAt || r.fetchedAt > maxFetchedAt) maxFetchedAt = r.fetchedAt;
  }
  return { points, fetchedAt: maxFetchedAt };
}

async function writeToDb(fieldKey: string, polygon: FieldPolygon, series: SARTimeseries): Promise<void> {
  void polygon;
  if (series.points.length === 0) return;
  // upsert по уникальному индексу (fieldKey, observationDate, source).
  // Используем onConflictDoUpdate, чтобы при повторных refresh-ах перезаписать
  // значения (полезно если на CDSE появились новые snapshot).
  await db
    .insert(fieldSarObservations)
    .values(series.points.map((p) => ({
      id: `${fieldKey}|${p.date}|s1_grd`,
      fieldKey,
      observationDate: p.date,
      source: "s1_grd",
      vvDb: p.vvDb,
      vhDb: p.vhDb,
      ndvi: null,
      sampleCount: p.sampleCount,
    })))
    .onConflictDoUpdate({
      target: [fieldSarObservations.fieldKey, fieldSarObservations.observationDate, fieldSarObservations.source],
      set: {
        vvDb: fieldSarObservations.vvDb,
        vhDb: fieldSarObservations.vhDb,
        sampleCount: fieldSarObservations.sampleCount,
        fetchedAt: new Date(),
      },
    });
}

// TTL свежести кеша в БД. Если максимальный fetchedAt по диапазону старше
// этого срока — refetch-аем (S1 публикует снимок с лагом 2–4 дня).
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Главный API модуля. Используется рендером инспекторской страницы и
// SAR-cron эндпоинтом. forceRefresh=true пропускает кэш (для /api/satellite/sar/refresh).
export async function getS1Series(
  polygon: FieldPolygon,
  startDate: string,
  endDate: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<SARTimeseries | null> {
  const fieldKey = polygonKey(polygon);

  // 1) Попытка из БД — отдаём, если кеш свежий и не было forceRefresh.
  if (!opts.forceRefresh) {
    const cache = await readFromDb(fieldKey, startDate, endDate);
    if (cache.points.length > 0 && cache.fetchedAt && Date.now() - cache.fetchedAt.getTime() < CACHE_TTL_MS) {
      return {
        polygon, startDate, endDate,
        points: cache.points,
        providerId: "copernicus",
      };
    }
  }

  // 2) Запрос к CDSE. Если кредов нет → null, ничего не пишем.
  const fresh = await fetchS1SeriesFromCDSE(polygon, startDate, endDate);
  if (!fresh) return null;

  // 3) Пишем в БД для следующих запросов и возвращаем как есть.
  await writeToDb(fieldKey, polygon, fresh).catch((e) => {
    console.warn("[sar] writeToDb failed:", (e as Error).message);
  });
  return fresh;
}

// Проверка «настроен ли вообще SAR» — используется UI, чтобы не показывать
// пустую SAR-секцию когда фермер не подключил CDSE. Дешёвая проверка env.
export function isSARConfigured(): boolean {
  return !!(process.env.CDSE_CLIENT_ID && process.env.CDSE_CLIENT_SECRET);
}
