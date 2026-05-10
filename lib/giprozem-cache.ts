// ────────────────────────────────────────────────────────────────────────────
// Двухуровневый кеш ответов Гипрозема (ArcGIS REST).
//
// Уровни:
//   1) In-process LRU (memCache) — мгновенный доступ при панорамировании карты,
//      когда тот же bbox/слой запрашивается несколько раз подряд.
//   2) Диск (DEFAULT_DIR)         — переживает рестарт dev-сервера и cold-start
//      на serverless. Ключ — sha1(layerId + отсортированные params).
//
// Подключение: см. queryGiprozemCached — drop-in замена queryGiprozem.
// Существующие route-handler'ы НЕ переключены сюда специально — модуль
// «лежит сверху», подключаем точечно после ревью.
// ────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { queryGiprozem, type GiprozemResponse } from "@/lib/giprozem";

const DEFAULT_DIR = process.env.GIPROZEM_CACHE_DIR ?? "/tmp/agro-giprozem-cache";

// TTL подобран под характер данных Гипрозема: агрохимобследование
// фиксируется один раз в год, поэтому даже сутки — консервативно.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;       // 24 часа
const PAST_YEAR_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней (год < текущего — данные не меняются)
const YEARS_LIST_TTL_MS = 6 * 60 * 60 * 1000;     // 6 часов (список доступных лет)

// Memory layer
const MEM_TTL_MS = 5 * 60 * 1000; // 5 минут
const MEM_MAX_ENTRIES = 256;

interface MemEntry {
  value: GiprozemResponse;
  expires: number;
}
const memCache = new Map<string, MemEntry>();

function memGet(key: string): GiprozemResponse | null {
  const e = memCache.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) {
    memCache.delete(key);
    return null;
  }
  // LRU: переинсертим — Map сохраняет порядок вставки
  memCache.delete(key);
  memCache.set(key, e);
  return e.value;
}

function memSet(key: string, value: GiprozemResponse, ttlMs: number) {
  if (memCache.has(key)) memCache.delete(key);
  memCache.set(key, { value, expires: Date.now() + ttlMs });
  while (memCache.size > MEM_MAX_ENTRIES) {
    const oldest = memCache.keys().next().value;
    if (oldest === undefined) break;
    memCache.delete(oldest);
  }
}

// Disk layer
let dirReady: Promise<void> | null = null;
async function ensureDir(): Promise<void> {
  if (!dirReady) dirReady = mkdir(DEFAULT_DIR, { recursive: true }).then(() => undefined);
  return dirReady;
}

function buildKey(params: Record<string, string>, layerId: number): { key: string; path: string } {
  // Сортируем ключи, чтобы порядок параметров не давал разные кеш-ключи
  const sortedKeys = Object.keys(params).sort();
  const normalized: Array<[string, string]> = sortedKeys.map((k) => [k, params[k]]);
  const payload = JSON.stringify({ layerId, params: normalized });
  const key = createHash("sha1").update(payload).digest("hex");
  const path = join(DEFAULT_DIR, `gp_${layerId}_${key}.json`);
  return { key, path };
}

async function diskGet(path: string, ttlMs: number): Promise<GiprozemResponse | null> {
  try {
    const s = await stat(path);
    if (Date.now() - s.mtimeMs > ttlMs) return null;
    const buf = await readFile(path, "utf8");
    return JSON.parse(buf) as GiprozemResponse;
  } catch {
    return null;
  }
}

async function diskPut(path: string, value: GiprozemResponse): Promise<void> {
  try {
    await writeFile(path, JSON.stringify(value));
  } catch {
    // best-effort: на read-only fs или при OOM лучше отдать свежий результат
    // и не падать, чем валить запрос
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface GiprozemCacheOpts {
  /** Полный TTL (диск+память). По умолчанию выбирается inferTtlMs(params). */
  ttlMs?: number;
  /** TTL только для memory-уровня. Min(memTtlMs, ttlMs). */
  memTtlMs?: number;
  /** Пропустить кеш и сходить в ArcGIS напрямую (но результат запишется). */
  bypass?: boolean;
  /** Не записывать свежий ответ в кеш (например, при error-recovery). */
  noStore?: boolean;
  /** Прокидывается в queryGiprozem. */
  timeoutMs?: number;
}

/**
 * Drop-in замена queryGiprozem с двухуровневым кешем.
 *
 *   import { queryGiprozemCached } from "@/lib/giprozem-cache";
 *   const data = await queryGiprozemCached(params, layerId);
 *
 * Сигнатура совместима — можно подменять точечно (напр. сначала только в
 * /api/giprozem, оставив /lookup-farm как есть).
 */
export async function queryGiprozemCached(
  params: Record<string, string>,
  layerId: number,
  opts: GiprozemCacheOpts = {},
): Promise<GiprozemResponse> {
  const ttl = opts.ttlMs ?? inferTtlMs(params);
  const memTtl = Math.min(opts.memTtlMs ?? MEM_TTL_MS, ttl);
  const { key, path } = buildKey(params, layerId);

  if (!opts.bypass) {
    const fromMem = memGet(key);
    if (fromMem) return fromMem;
    await ensureDir();
    const fromDisk = await diskGet(path, ttl);
    if (fromDisk) {
      memSet(key, fromDisk, memTtl);
      return fromDisk;
    }
  }

  const fresh = await queryGiprozem(params, layerId, { timeoutMs: opts.timeoutMs });

  if (!opts.noStore) {
    await ensureDir();
    diskPut(path, fresh).catch(() => undefined);
    memSet(key, fresh, memTtl);
  }
  return fresh;
}

/**
 * Подсказка по TTL на основании параметров запроса.
 *  - returnDistinctValues=true (список годов) → 6 часов
 *  - where=yearob=YYYY и YYYY < текущего → 30 дней (данные «закрытого» года не меняются)
 *  - всё остальное → 24 часа
 */
export function inferTtlMs(params: Record<string, string>): number {
  if (params.returnDistinctValues === "true") return YEARS_LIST_TTL_MS;
  const m = params.where?.match(/yearob\s*=\s*(\d{4})/);
  if (m) {
    const y = Number(m[1]);
    const currentYear = new Date().getFullYear();
    if (Number.isFinite(y) && y < currentYear) return PAST_YEAR_TTL_MS;
  }
  return DEFAULT_TTL_MS;
}

// ────────────────────────────────────────────────────────────────────────────
// Diagnostics / admin (полезно для будущей /api/giprozem/cache-stats)
// ────────────────────────────────────────────────────────────────────────────

export function memCacheStats(): { size: number; max: number } {
  return { size: memCache.size, max: MEM_MAX_ENTRIES };
}

export function clearMemCache(): void {
  memCache.clear();
}

export function getCacheDir(): string {
  return DEFAULT_DIR;
}
