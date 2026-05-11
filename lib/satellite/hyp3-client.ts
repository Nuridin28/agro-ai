// ASF HyP3 API клиент — бесплатный облачный пайплайн для расчёта
// interferometric coherence из SLC-пар Sentinel-1.
//
// HyP3 (https://hyp3-docs.asf.alaska.edu) — NASA-облако, которое принимает
// пары SLC scene IDs, прогоняет ISCE/GAMMA-обработку и отдаёт coherence
// GeoTIFF + статистику. Бесплатно для академического использования (нужен
// аккаунт на NASA Earthdata).
//
// Архитектура:
//   1. submitInsarJob({ref, sec})       — отправляет INSAR_GAMMA job
//   2. listJobs({status,name})          — листинг существующих/завершённых
//   3. fetchCoherenceMean(job, polygon) — скачивает coherence.tif и
//                                          усредняет по полигону
//
// Этот клиент — **SKELETON**: подключается только при заданных
// EARTHDATA_USER / EARTHDATA_PASS. Если их нет — функции возвращают null,
// и cohrence-канал автоматически фолбэчится на mock или просто отключается.
// Реальная реализация требует:
//   - Earthdata Login OAuth handshake
//   - Polling завершённых джобов (10-30 мин)
//   - GeoTIFF parser (geotiff.js) + clip-stats по полигону
// → План: вынести в отдельный воркер (Modal / EC2), который пишет
//   в `field_sar_observations.coherence` асинхронно. См. docs/coherence.md.

import type { FieldPolygon, CoherenceTimeseries, CoherencePair } from "./types";

interface HyP3Creds {
  username: string;
  password: string;
}

function readCreds(): HyP3Creds | null {
  const u = process.env.EARTHDATA_USER ?? process.env.HYP3_USERNAME;
  const p = process.env.EARTHDATA_PASS ?? process.env.HYP3_PASSWORD;
  if (!u || !p) return null;
  return { username: u, password: p };
}

export function isHyP3Configured(): boolean {
  return !!readCreds();
}

// Основной API — получить ряд coherence через HyP3 (или null если не
// настроен). Высокий уровень, в идеале вернёт сразу из кеша HyP3-джобов.
//
// TODO: реальная имплементация требует асинхронной очереди и persistence
// job-id ↔ polygon. Сейчас — заглушка, которая возвращает null с
// предупреждением, чтобы выше по стеку сработал fallback (mock / skip).
export async function fetchCoherenceFromHyP3(
  polygon: FieldPolygon,
  windowStart: string,
  windowEnd: string,
): Promise<CoherenceTimeseries | null> {
  void polygon; void windowStart; void windowEnd;
  const creds = readCreds();
  if (!creds) return null;

  console.warn(
    "[hyp3-client] EARTHDATA creds присутствуют, но клиент пока не реализован полностью. " +
    "Требуется отдельный воркер для async-обработки SLC-пар. " +
    "См. docs/coherence.md для статуса интеграции.",
  );
  return null;
}

// Stub — для будущей реализации:
//
//   async function submitInsarGammaJob(refId: string, secId: string, creds: HyP3Creds): Promise<{ jobId: string }>;
//   async function pollJobUntilDone(jobId: string, creds: HyP3Creds): Promise<{ status, downloadUrl }>;
//   async function downloadCoherenceTif(url: string): Promise<Buffer>;
//   async function clipCoherenceMean(tifBuffer: Buffer, polygon: FieldPolygon): Promise<{ mean, count }>;
//
// Ровно эти 4 функции — и weekly cron, который пишет CoherencePair-ы
// в field_sar_observations.coherence.

// Стандартизованный пустой результат для совместимости с фолбэками.
export function emptyCoherenceSeries(polygon: FieldPolygon, windowStart: string, windowEnd: string): CoherenceTimeseries {
  return {
    polygon,
    windowStart,
    windowEnd,
    pairs: [] as CoherencePair[],
    providerId: "hyp3",
  };
}
