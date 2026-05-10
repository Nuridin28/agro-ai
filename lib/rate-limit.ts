import type { NextRequest } from "next/server";
import { redis } from "./redis";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSec: number;
}

// Fixed-window counter via Redis INCR/EXPIRE.
// If Redis недоступен (REDIS_URL пуст или сервис лежит), пропускаем (fail-open).
// Это сознательный компромисс: лучше не блокировать прод, если Redis упал.
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (!redis) return { ok: true, remaining: limit, resetSec: windowSec };

  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${bucket}:${identifier}:${window}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, windowSec);
    const res = await pipeline.exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const remaining = Math.max(0, limit - count);
    const resetSec = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
    return { ok: count <= limit, remaining, resetSec };
  } catch (e) {
    console.warn("[rate-limit] redis error, allowing:", (e as Error).message);
    return { ok: true, remaining: limit, resetSec: windowSec };
  }
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    { error: "Слишком много запросов. Попробуйте позже." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.resetSec),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    }
  );
}
