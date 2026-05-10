import Redis from "ioredis";

const url = process.env.REDIS_URL;

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

function build(): Redis | null {
  if (!url) return null;
  const r = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableOfflineQueue: false,
  });
  r.on("error", (e) => {
    console.warn("[redis] error:", e.message);
  });
  return r;
}

export const redis: Redis | null = globalForRedis.redis ?? build();
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
