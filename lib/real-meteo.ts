// ────────────────────────────────────────────────────────────────────────────
// Open-Meteo клиент — без ключа, без лимитов для некоммерческого использования.
// Используем два endpoint'а:
//   - api.open-meteo.com/v1/forecast — текущая погода + 7-дневный прогноз
//   - archive-api.open-meteo.com/v1/archive — историческая (ERA5 reanalysis)
//
// Возвращаем ту же форму, что и наш мок MeteoSeason, чтобы движок верификации
// и UI могли работать с реальными данными без переделок.
// ────────────────────────────────────────────────────────────────────────────

export interface CurrentWx {
  time: string;            // ISO
  temperatureC: number | null;
  precipitationMm: number | null;
  snowDepthCm: number | null;
  windKmh: number | null;
  weatherCode: number | null;
}

export interface HistoricalWxSeason {
  year: number;
  minWinterC: number;
  maxSnowDepthCm: number;
  snowWaterEquivMm: number;   // расчёт по сумме снегопадов
  totalWinterSnowfallCm: number;
  snowMeltDate: string | null;
  soilWarmDate: string | null;
  springWindStress: boolean;  // по макс. ветру апрель-май
  springMaxWindKmh: number;
  augSepRainfallMm: number;
}

export interface MonthlyPrecip {
  ym: string;          // "2025-04"
  year: number;
  month: number;       // 1..12
  mm: number;          // сумма осадков за месяц, мм
  rainyDays: number;   // дней с осадками >= 0.5 мм
  partial: boolean;    // месяц ещё не закончился (для текущего)
}

export interface YearlyPrecip {
  year: number;
  mm: number;
  rainyDays: number;
  vsAvgPct: number;    // отклонение от многолетнего среднего, %
  partial: boolean;    // год ещё не закончился
}

export interface LongTermPrecip {
  fromYear: number;
  toYear: number;
  monthly: MonthlyPrecip[];
  yearly: YearlyPrecip[];
  // Среднее по каждому месяцу за полные годы выборки (1..12)
  multiYearMonthlyAvg: { month: number; mm: number }[];
  // Многолетнее годовое среднее (сумма multiYearMonthlyAvg)
  multiYearAnnualAvg: number;
}

export interface RealMeteo {
  source: "open-meteo";
  fetchedAt: string;
  lat: number;
  lng: number;
  current: CurrentWx;
  forecast7days: { date: string; tmin: number; tmax: number; precipMm: number }[];
  season?: HistoricalWxSeason;
  longTerm?: LongTermPrecip;
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL  = "https://archive-api.open-meteo.com/v1/archive";

async function getJson(url: string, timeoutMs = 15000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

export async function fetchCurrent(lat: number, lng: number): Promise<{ current: CurrentWx; forecast7days: RealMeteo["forecast7days"] }> {
  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,snowfall,snow_depth,wind_speed_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7&timezone=auto`;
  const j = await getJson(url);
  const c = j.current ?? {};
  const current: CurrentWx = {
    time: c.time ?? new Date().toISOString(),
    temperatureC: numOr(c.temperature_2m),
    precipitationMm: numOr(c.precipitation),
    snowDepthCm: c.snow_depth != null ? +(c.snow_depth * 100).toFixed(1) : null,
    windKmh: numOr(c.wind_speed_10m),
    weatherCode: numOr(c.weather_code),
  };
  const dt = j.daily?.time ?? [];
  const tmax = j.daily?.temperature_2m_max ?? [];
  const tmin = j.daily?.temperature_2m_min ?? [];
  const ps   = j.daily?.precipitation_sum ?? [];
  const forecast7days = dt.map((d: string, i: number) => ({
    date: d,
    tmin: numOr(tmin[i]) ?? 0,
    tmax: numOr(tmax[i]) ?? 0,
    precipMm: numOr(ps[i]) ?? 0,
  }));
  return { current, forecast7days };
}

export async function fetchSeason(lat: number, lng: number, year: number): Promise<HistoricalWxSeason> {
  // Сезон = зима (year-1) ноябрь → апрель (year) + уборка август-сентябрь.
  const start = `${year - 1}-11-01`;
  const end   = `${year}-09-30`;
  const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_min,snowfall_sum,precipitation_sum,wind_speed_10m_max,soil_temperature_28_to_100cm_mean,snow_depth_max` +
    `&timezone=auto`;
  const j = await getJson(url, 25000);
  const d = j.daily ?? {};
  const days: string[]     = d.time ?? [];
  const tmin: (number|null)[]      = d.temperature_2m_min ?? [];
  const sn:   (number|null)[]      = d.snowfall_sum ?? [];
  const pr:   (number|null)[]      = d.precipitation_sum ?? [];
  const wind: (number|null)[]      = d.wind_speed_10m_max ?? [];
  const soil: (number|null)[]      = d.soil_temperature_28_to_100cm_mean ?? [];
  const snowMax: (number|null)[]   = d.snow_depth_max ?? [];

  let minWinterC = Infinity;
  let totalSnowCm = 0;
  let augSepRain = 0;
  let springMaxWind = 0;
  let snowMeltDate: string | null = null;
  let soilWarmDate: string | null = null;
  let snowDepthMaxM = 0;

  const winterEnd = `${year}-04-15`;
  const springStart = `${year}-04-01`;
  const springEnd = `${year}-05-31`;

  for (let i = 0; i < days.length; i++) {
    const dt = days[i];
    if (!dt) continue;
    const m = parseInt(dt.split("-")[1] ?? "0");

    if (dt <= winterEnd) {
      if (tmin[i] != null && tmin[i]! < minWinterC) minWinterC = tmin[i]!;
      if (sn[i] != null && sn[i]! > 0) totalSnowCm += sn[i]!;
      if (snowMax[i] != null && snowMax[i]! > snowDepthMaxM) snowDepthMaxM = snowMax[i]!;
    }
    if (dt >= springStart && dt <= springEnd) {
      if (wind[i] != null && wind[i]! > springMaxWind) springMaxWind = wind[i]!;
    }
    if (m === 8 || m === 9) {
      if (pr[i] != null) augSepRain += pr[i]!;
    }
    if (!soilWarmDate && dt >= `${year}-03-15` && (soil[i] ?? -99) >= 8) soilWarmDate = dt;
    if (!snowMeltDate && dt >= `${year}-02-15` && (snowMax[i] ?? 0) <= 0.005) {
      // Подтверждаем 7 дней без снега
      let stable = true;
      for (let k = i; k < Math.min(days.length, i + 7); k++) {
        if ((snowMax[k] ?? 0) > 0.02) { stable = false; break; }
      }
      if (stable) snowMeltDate = dt;
    }
  }

  return {
    year,
    minWinterC: minWinterC === Infinity ? 0 : +minWinterC.toFixed(1),
    maxSnowDepthCm: +(snowDepthMaxM * 100).toFixed(0),
    snowWaterEquivMm: Math.round(totalSnowCm * 1.0), // 1cm fresh snow ≈ 1mm water (плотность 0.1)
    totalWinterSnowfallCm: +(totalSnowCm).toFixed(1),
    snowMeltDate,
    soilWarmDate,
    springWindStress: springMaxWind >= 50,           // 50 км/ч — устойчивый сильный ветер
    springMaxWindKmh: +(springMaxWind).toFixed(0),
    augSepRainfallMm: +(augSepRain).toFixed(0),
  };
}

// Долгосрочный анализ осадков: суммы по месяцам и годам + многолетнее среднее.
// fromYear..toYear включительно; для текущего года получаем YTD (partial=true).
export async function fetchLongTermPrecip(
  lat: number, lng: number, fromYear: number, toYear: number,
): Promise<LongTermPrecip> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const start = `${fromYear}-01-01`;
  // Архивный API не отдаёт будущее; ограничиваем end_date сегодняшним днём.
  const reqEnd = `${toYear}-12-31`;
  const end = reqEnd > todayIso ? todayIso : reqEnd;

  const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=precipitation_sum&timezone=auto`;
  const j = await getJson(url, 30000);
  const days: string[] = j.daily?.time ?? [];
  const pr: (number|null)[] = j.daily?.precipitation_sum ?? [];

  const monthlyMap = new Map<string, { mm: number; rainyDays: number; year: number; month: number }>();
  const yearlyMap = new Map<number, { mm: number; rainyDays: number }>();

  for (let i = 0; i < days.length; i++) {
    const dt = days[i];
    if (!dt) continue;
    const [yy, mm] = dt.split("-");
    const yr = +yy;
    const mo = +mm;
    const ym = `${yy}-${mm}`;
    const v = pr[i] ?? 0;

    const cm = monthlyMap.get(ym) ?? { mm: 0, rainyDays: 0, year: yr, month: mo };
    cm.mm += v;
    if (v >= 0.5) cm.rainyDays += 1;
    monthlyMap.set(ym, cm);

    const cy = yearlyMap.get(yr) ?? { mm: 0, rainyDays: 0 };
    cy.mm += v;
    if (v >= 0.5) cy.rainyDays += 1;
    yearlyMap.set(yr, cy);
  }

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentYm = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const monthly: MonthlyPrecip[] = [...monthlyMap.entries()]
    .map(([ym, v]) => ({
      ym, year: v.year, month: v.month,
      mm: +v.mm.toFixed(0),
      rainyDays: v.rainyDays,
      partial: ym === currentYm,
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  // Среднее по месяцу 1..12 — только по полным годам, чтобы не искажать частичным текущим.
  const baselineYears = monthly
    .filter((m) => m.year < currentYear)
    .reduce((acc, m) => acc.add(m.year), new Set<number>());
  const useFull = baselineYears.size > 0;

  const sumByMonth = Array.from({ length: 12 }, () => ({ sum: 0, n: 0 }));
  for (const m of monthly) {
    if (useFull && m.year === currentYear) continue;
    sumByMonth[m.month - 1].sum += m.mm;
    sumByMonth[m.month - 1].n += 1;
  }
  const multiYearMonthlyAvg = sumByMonth.map((x, i) => ({
    month: i + 1, mm: x.n ? +(x.sum / x.n).toFixed(0) : 0,
  }));
  const multiYearAnnualAvg = multiYearMonthlyAvg.reduce((s, x) => s + x.mm, 0);

  const yearly: YearlyPrecip[] = [...yearlyMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, v]) => ({
      year,
      mm: +v.mm.toFixed(0),
      rainyDays: v.rainyDays,
      vsAvgPct: multiYearAnnualAvg > 0
        ? +(((v.mm - multiYearAnnualAvg) / multiYearAnnualAvg) * 100).toFixed(1)
        : 0,
      partial: year === currentYear,
    }));

  return { fromYear, toYear, monthly, yearly, multiYearMonthlyAvg, multiYearAnnualAvg };
}

export async function fetchRealMeteo(
  lat: number, lng: number, year?: number, opts?: { longTermYears?: number },
): Promise<RealMeteo> {
  const cur = await fetchCurrent(lat, lng);
  let season: HistoricalWxSeason | undefined;
  let longTerm: LongTermPrecip | undefined;

  const tasks: Promise<unknown>[] = [];
  if (year) {
    tasks.push(
      fetchSeason(lat, lng, year)
        .then((s) => { season = s; })
        .catch(() => { /* skip silently */ }),
    );
  }
  if (opts?.longTermYears && opts.longTermYears > 0) {
    const toYear = new Date().getFullYear();
    const fromYear = toYear - opts.longTermYears + 1;
    tasks.push(
      fetchLongTermPrecip(lat, lng, fromYear, toYear)
        .then((lt) => { longTerm = lt; })
        .catch(() => { /* skip silently */ }),
    );
  }
  await Promise.all(tasks);

  return {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    lat, lng,
    current: cur.current,
    forecast7days: cur.forecast7days,
    season,
    longTerm,
  };
}

function numOr(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Расшифровка WMO weather code → строка
export function decodeWeatherCode(code: number | null): string {
  if (code == null) return "—";
  const map: Record<number, string> = {
    0: "ясно", 1: "почти ясно", 2: "переменная облачность", 3: "пасмурно",
    45: "туман", 48: "иней",
    51: "морось слабая", 53: "морось", 55: "морось сильная",
    61: "дождь слабый", 63: "дождь", 65: "ливень",
    71: "снег слабый", 73: "снег", 75: "снег сильный", 77: "снежная крупа",
    80: "ливневый дождь", 81: "сильный ливень", 82: "очень сильный ливень",
    85: "снегопад слабый", 86: "снегопад сильный",
    95: "гроза", 96: "гроза с градом", 99: "сильная гроза с градом",
  };
  return map[code] ?? `код ${code}`;
}
