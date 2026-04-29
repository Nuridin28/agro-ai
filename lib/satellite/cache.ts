// Простой дисковый кэш для тяжёлых SH-вызовов.
// Хранилище: process.env.SAT_CACHE_DIR или дефолтная папка под /tmp.
// Ключ: sha1(сериализация input). TTL: бесконечный для прошедших дат
// (Sentinel-2 снимок за 2024-07-15 не меняется), 1 час для дат в будущем.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_DIR = process.env.SAT_CACHE_DIR ?? "/tmp/agro-sat-cache";

let dirReady: Promise<void> | null = null;
async function ensureDir(): Promise<void> {
  if (!dirReady) dirReady = mkdir(DEFAULT_DIR, { recursive: true }).then(() => undefined);
  return dirReady;
}

function keyFor(namespace: string, payload: unknown, ext: string): string {
  const h = createHash("sha1").update(namespace).update(JSON.stringify(payload)).digest("hex");
  return join(DEFAULT_DIR, `${namespace}_${h}.${ext}`);
}

async function isStale(filePath: string, ttlMs: number): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return Date.now() - s.mtimeMs > ttlMs;
  } catch { return true; }
}

// JSON-кэш: используется для Statistical API ответов / NDVI-рядов.
export async function getOrFetchJSON<T>(
  namespace: string,
  payload: unknown,
  fetcher: () => Promise<T>,
  ttlMs: number = 30 * 24 * 60 * 60 * 1000, // 30 дней — снимки прошлого не меняются
): Promise<T> {
  await ensureDir();
  const path = keyFor(namespace, payload, "json");
  if (!(await isStale(path, ttlMs))) {
    try {
      const buf = await readFile(path, "utf8");
      return JSON.parse(buf) as T;
    } catch { /* fall through to fetch */ }
  }
  const result = await fetcher();
  try { await writeFile(path, JSON.stringify(result)); } catch { /* best-effort */ }
  return result;
}

// Бинарный кэш: используется для Process API PNG.
export async function getOrFetchBinary(
  namespace: string,
  payload: unknown,
  fetcher: () => Promise<Buffer>,
  ttlMs: number = 30 * 24 * 60 * 60 * 1000,
): Promise<Buffer> {
  await ensureDir();
  const path = keyFor(namespace, payload, "png");
  if (!(await isStale(path, ttlMs))) {
    try { return await readFile(path); } catch { /* fall through */ }
  }
  const buf = await fetcher();
  try { await writeFile(path, buf); } catch { /* best-effort */ }
  return buf;
}
