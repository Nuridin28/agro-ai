// ASF HyP3 API клиент: реальная имплементация.
//
// Архитектура:
//   1. Earthdata Login (urs.earthdata.nasa.gov) выдаёт OAuth-token, который
//      нужен для всех вызовов в hyp3-api.asf.alaska.edu.
//   2. HyP3 jobs/INSAR_ISCE_BURST принимают пару SLC-burst granule-имён,
//      обрабатывают через ISCE и возвращают .zip с coherence.tif.
//   3. Job асинхронный (10-30 мин). Клиент только submit + poll + download —
//      высокоуровневая оркестрация (что когда submit-ить, polling-loop) в
//      api/satellite/coherence/refresh/route.ts.
//
// Доки: https://hyp3-docs.asf.alaska.edu/using/sdk/

import type { FieldPolygon } from "./types";

const HYP3_API = "https://hyp3-api.asf.alaska.edu";
// Earthdata Login OAuth для HyP3. HyP3 expectations: Basic auth с
// Earthdata user/pass на /jobs endpoint; HyP3 сам передаёт credentials в
// ESA/ASF. Альтернативно — bearer token через urs.earthdata.nasa.gov, но
// Basic — самый прямой путь для server-side.

export interface HyP3Creds {
  // Bearer-token для HyP3 jobs API. Получается на urs.earthdata.nasa.gov
  // → Profile → Generate Token. Действует ~60 дней.
  token: string;
  // Username/password — опционально, для download product-files через
  // earthdata-redirect chain (некоторые серверы ASF требуют Basic).
  username?: string;
  password?: string;
}

function readCreds(): HyP3Creds | null {
  const token = process.env.EARTHDATA_TOKEN ?? process.env.HYP3_TOKEN;
  if (!token) return null;
  return {
    token,
    username: process.env.EARTHDATA_USER ?? process.env.HYP3_USERNAME,
    password: process.env.EARTHDATA_PASS ?? process.env.HYP3_PASSWORD,
  };
}

export function isHyP3Configured(): boolean {
  return !!readCreds();
}

function bearerAuth(creds: HyP3Creds): string {
  return `Bearer ${creds.token}`;
}

function basicAuth(creds: HyP3Creds): string | null {
  if (!creds.username || !creds.password) return null;
  return "Basic " + Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
}

// ─────────────────────────────────────────────────────────────────────────
// Job submission
// ─────────────────────────────────────────────────────────────────────────

export interface SubmitJobInput {
  granuleRef: string;     // primary SLC granule name (S1A_IW_SLC__...)
  granuleSec: string;     // secondary SLC granule name
  label?: string;         // отображаемое имя джоба
}

export interface HyP3Job {
  jobId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  name: string;
  jobType: string;
  // Заполнится когда status === SUCCEEDED:
  productUrls?: string[];
  // Заполнится при FAILED:
  errorMessages?: string[];
}

// Отправляет один INSAR_ISCE_BURST job. Возвращает jobId, по которому потом
// можно опрашивать состояние.
//
// Используем INSAR_GAMMA — этот job-type принимает полные SLC granule-имена
// (без .SAFE), в отличие от INSAR_ISCE_BURST, который требует burst-фрагменты
// (для них нужен отдельный ASF Search для определения IW + burst-номера).
// Coherence на выходе та же; GAMMA legacy, но HyP3 продолжает поддерживать.
export async function submitInsarJob(input: SubmitJobInput): Promise<HyP3Job> {
  const creds = readCreds();
  if (!creds) throw new Error("HyP3 не настроен (EARTHDATA_TOKEN не задан)");

  // HyP3 ожидает имена без расширения .SAFE
  const stripSafe = (g: string) => g.replace(/\.SAFE$/i, "");
  const ref = stripSafe(input.granuleRef);
  const sec = stripSafe(input.granuleSec);

  // Name validation в HyP3: до 100 символов, [A-Za-z0-9_-]
  const safeName = (input.label ?? `agro-${ref.slice(-30)}-${sec.slice(-15)}`)
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 100);

  const body = {
    jobs: [
      {
        name: safeName,
        job_type: "INSAR_GAMMA",
        job_parameters: {
          granules: [ref, sec],
          looks: "20x4",                // 20 look azimuth × 4 range — стандарт для агро
          apply_water_mask: false,
          include_look_vectors: false,
          include_inc_map: false,
          include_los_displacement: false,
          include_dem: false,
          include_wrapped_phase: false,
        },
      },
    ],
  };

  const res = await fetch(`${HYP3_API}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: bearerAuth(creds),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`HyP3 submit ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const j = await res.json() as { jobs: Array<Record<string, unknown>> };
  const job = j.jobs?.[0];
  if (!job) throw new Error("HyP3 submit вернул пустой массив jobs");
  return parseJob(job);
}

// ─────────────────────────────────────────────────────────────────────────
// Polling
// ─────────────────────────────────────────────────────────────────────────

export async function getJob(jobId: string): Promise<HyP3Job> {
  const creds = readCreds();
  if (!creds) throw new Error("HyP3 не настроен");

  const res = await fetch(`${HYP3_API}/jobs/${jobId}`, {
    headers: { authorization: bearerAuth(creds) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HyP3 getJob ${res.status}`);
  return parseJob(await res.json() as Record<string, unknown>);
}

// Листинг всех джобов аккаунта — полезно для cron, чтобы не дёргать БД
// для каждого job-id по отдельности.
export async function listJobs(opts: { status?: string; limit?: number } = {}): Promise<HyP3Job[]> {
  const creds = readCreds();
  if (!creds) return [];
  const params = new URLSearchParams();
  if (opts.status) params.set("status_code", opts.status);
  if (opts.limit) params.set("page_size", String(opts.limit));
  const url = `${HYP3_API}/jobs${params.toString() ? "?" + params.toString() : ""}`;
  const res = await fetch(url, {
    headers: { authorization: bearerAuth(creds) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const j = await res.json() as { jobs: Array<Record<string, unknown>> };
  return (j.jobs ?? []).map(parseJob);
}

// ─────────────────────────────────────────────────────────────────────────
// Product download — coherence.tif из готового джоба
// ─────────────────────────────────────────────────────────────────────────

// HyP3 отдаёт результат как .zip с несколькими тифами (amplitude, phase,
// coherence, dem, ...). Мы качаем zip, ищем внутри coherence.tif (или
// *_corr.tif в зависимости от job-type) и возвращаем его как Buffer.
//
// Для INSAR_ISCE_BURST имя файла внутри zip: <job_name>_corr.tif
// (corr = correlation/coherence).
export async function downloadCoherenceTif(productUrl: string): Promise<Buffer | null> {
  const creds = readCreds();
  if (!creds) return null;

  // HyP3 product URLs обычно требуют Earthdata-аутентификацию (redirect-chain
  // через urs.earthdata.nasa.gov). Сначала пробуем bearer, при 401 — fallback
  // на basic auth (если есть). Финальный hop часто идёт на S3 (там auth не нужен).
  let res = await fetch(productUrl, {
    headers: { authorization: bearerAuth(creds) },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok && res.status === 401) {
    const basic = basicAuth(creds);
    if (basic) {
      res = await fetch(productUrl, {
        headers: { authorization: basic },
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
      });
    }
  }
  if (!res.ok) {
    console.warn("[hyp3] product download failed", res.status, productUrl);
    return null;
  }
  const ab = await res.arrayBuffer();
  const zip = Buffer.from(ab);

  // Простой ZIP-парсер: ищем в central directory файл, оканчивающийся на _corr.tif.
  // Без внешних зависимостей — пишем минимальный reader.
  return extractCoherenceFromZip(zip);
}

// ─────────────────────────────────────────────────────────────────────────
// Главный entry-point (вызывается из coherence.ts) — async wrapper для
// случаев когда вызывающая сторона ожидает CoherenceTimeseries сразу.
// В реальности coherence считается через async-cron, поэтому здесь возвращаем
// null: cron должен заранее наполнить БД, а UI читает оттуда.
// ─────────────────────────────────────────────────────────────────────────

import type { CoherenceTimeseries } from "./types";
export async function fetchCoherenceFromHyP3(
  polygon: FieldPolygon,
  windowStart: string,
  windowEnd: string,
): Promise<CoherenceTimeseries | null> {
  void polygon; void windowStart; void windowEnd;
  if (!isHyP3Configured()) return null;
  // Real-time path не реализован: HyP3 — 10-30 мин на пару. Используй
  // POST /api/satellite/coherence/refresh для async-наполнения БД.
  // Возвращаем null чтобы caller прочитал из field_sar_observations.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

function parseJob(j: Record<string, unknown>): HyP3Job {
  const status = String(j.status_code ?? "PENDING") as HyP3Job["status"];
  const files = (j.files as Array<{ url?: string; filename?: string }> | undefined) ?? [];
  return {
    jobId: String(j.job_id ?? ""),
    status,
    name: String(j.name ?? ""),
    jobType: String(j.job_type ?? ""),
    productUrls: files.map((f) => f.url ?? "").filter(Boolean),
    errorMessages: (j.processing_times as unknown as Array<{ error_message?: string }> | undefined)
      ?.map((p) => p.error_message ?? "")
      .filter(Boolean),
  };
}

// Минимальный ZIP-reader: достаёт *_corr.tif из central directory.
// Использует тольk Buffer/DataView — без зависимостей.
function extractCoherenceFromZip(zip: Buffer): Buffer | null {
  // End of central directory record (EOCD): сигнатура 0x06054b50
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 65536; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    console.warn("[hyp3] zip EOCD not found");
    return null;
  }
  const cdOffset = zip.readUInt32LE(eocd + 16);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdEntries = zip.readUInt16LE(eocd + 10);

  let cd = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (zip.readUInt32LE(cd) !== 0x02014b50) break;
    const compMethod = zip.readUInt16LE(cd + 10);
    const compSize = zip.readUInt32LE(cd + 20);
    const nameLen = zip.readUInt16LE(cd + 28);
    const extraLen = zip.readUInt16LE(cd + 30);
    const commLen = zip.readUInt16LE(cd + 32);
    const localOff = zip.readUInt32LE(cd + 42);
    const name = zip.slice(cd + 46, cd + 46 + nameLen).toString("utf8");
    if ((name.endsWith("_corr.tif") || name.endsWith("_coh.tif")) && compMethod === 0) {
      // Stored (uncompressed) — самый частый случай у HyP3.
      const lh = localOff;
      if (zip.readUInt32LE(lh) !== 0x04034b50) return null;
      const localNameLen = zip.readUInt16LE(lh + 26);
      const localExtraLen = zip.readUInt16LE(lh + 28);
      const dataStart = lh + 30 + localNameLen + localExtraLen;
      return zip.slice(dataStart, dataStart + compSize);
    }
    if ((name.endsWith("_corr.tif") || name.endsWith("_coh.tif")) && compMethod !== 0) {
      console.warn(`[hyp3] coherence tif в zip компрессирован (method=${compMethod}), нужен inflate — пока не поддержано`);
      return null;
    }
    cd += 46 + nameLen + extraLen + commLen;
    if (cd >= cdOffset + cdSize) break;
  }
  console.warn("[hyp3] _corr.tif не найден в zip");
  return null;
}
