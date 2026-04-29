// Клиент к Taldau API (БНС / stat.gov.kz).
// Документация — внутренняя, эндпоинты выглядят так:
//   /Api/Search                  — поиск показателя по имени/коду
//   /Api/GetPeriodList           — типы периодов (Год/Квартал/Месяц)
//   /Api/GetSegmentList          — справочники-разрезы (регионы, виды и т.п.)
//   /Api/GetIndexPeriods         — список конкретных дат для показателя
//   /Api/GetIndexTreeData        — иерархия со значениями yXXXXXX
//   /Api/GetIndexAttributes      — метаданные (единица измерения и т.д.)
// Все вызовы серверные (CORS у portal'а нет, нужен прокси).
//
// КАТО dicId = 67 (регионы РК); корневой termId РК ≈ 741880.

const BASE = "http://taldau.stat.gov.kz/ru/Api";

async function getJson<T>(url: string, timeoutMs = 25000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Taldau ${res.status}: ${await res.text().catch(() => "")}`);
  const text = await res.text();
  // Иногда отдают с BOM; ключи в примерах документации содержат хвостовые пробелы — на всякий случай нормализуем.
  return normalizeKeys(JSON.parse(text.replace(/^﻿/, ""))) as T;
}

function normalizeKeys(o: any): any {
  if (Array.isArray(o)) return o.map(normalizeKeys);
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k.trim()] = normalizeKeys((o as Record<string, unknown>)[k]);
    return out;
  }
  return o;
}

export interface BnsSearchResult {
  id: number;
  name: string;
  code: string;
}

export async function searchBns(keyword: string): Promise<BnsSearchResult[]> {
  if (!keyword.trim()) return [];
  const url = `${BASE}/Search?keyword=${encodeURIComponent(keyword.trim())}`;
  const j = await getJson<{ total?: string; results?: Array<{ id: number; Name?: string; name?: string; Code?: string; code?: string }> }>(url);
  return (j.results ?? []).map((r) => ({
    id: r.id,
    name: r.Name ?? r.name ?? "",
    code: r.Code ?? r.code ?? "",
  }));
}

export interface BnsPeriod { id: number; name: string; }

export async function getPeriodList(indexId: number): Promise<BnsPeriod[]> {
  return getJson<BnsPeriod[]>(`${BASE}/GetPeriodList?indexId=${indexId}`);
}

export interface BnsSegment {
  dicId: string;       // напр. "67" или "67 + 915" (несколько справочников)
  dicClassId: string;
  ids: string;
  names: string;       // "Регионы + Виды экономической деятельности"
  fullNames: string;
  termIds: string;     // "741880,741885" — корневые элементы по каждому справочнику
  termNames: string;
  dicCount: number;
  termPath: string;
  idx: number;
  order: number;
  decFormat: number;
}

export async function getSegmentList(indexId: number, periodId: number): Promise<BnsSegment[]> {
  return getJson<BnsSegment[]>(`${BASE}/GetSegmentList?indexId=${indexId}&periodId=${periodId}`);
}

export interface BnsIndexPeriods {
  dateList: string[];        // ["122000","122001",…]
  periodNameList: string[];  // ["2000 год", …]
  datesToDraw: string[];     // ["31.12.2000", …]
  datesIds: string[];        // ["543","544",…]
}

interface IndexQueryOpts {
  indexId: number;
  periodId: number;
  terms: string[];
  termId: string;
  dicIds: string[];
}

export async function getIndexPeriods(opts: IndexQueryOpts): Promise<BnsIndexPeriods> {
  const u = `${BASE}/GetIndexPeriods?p_measure_id=1&p_index_id=${opts.indexId}` +
    `&p_period_id=${opts.periodId}` +
    `&p_terms=${opts.terms.join(",")}` +
    `&p_term_id=${opts.termId}` +
    `&p_dicIds=${opts.dicIds.join(",")}`;
  return getJson<BnsIndexPeriods>(u);
}

export interface BnsTreeNode {
  id: string;
  text: string;
  leaf: string;
  expanded: string;
  measureName?: string;
  rownum?: number;
  // Поля yXXXXXX содержат значения за конкретные даты (XXXXXX = dateList item)
  [key: string]: unknown;
}

export async function getIndexTreeData(opts: IndexQueryOpts & { idx?: number; parentId?: string }): Promise<BnsTreeNode[]> {
  const idx = opts.idx ?? 0;
  let u = `${BASE}/GetIndexTreeData?p_measure_id=1&p_index_id=${opts.indexId}` +
    `&p_period_id=${opts.periodId}` +
    `&p_terms=${opts.terms.join(",")}` +
    `&p_term_id=${opts.termId}` +
    `&p_dicIds=${opts.dicIds.join(",")}` +
    `&idx=${idx}`;
  if (opts.parentId) u += `&p_parent_id=${opts.parentId}`;
  return getJson<BnsTreeNode[]>(u);
}

export interface BnsIndexAttrs {
  id: number;
  name: string;
  namePath: string;
  measureName: string;
  measureSign?: string;
  decFormat: number;
}

export async function getIndexAttributes(indexId: number, periodId: number): Promise<BnsIndexAttrs> {
  return getJson<BnsIndexAttrs>(
    `${BASE}/GetIndexAttributes?periodId=${periodId}&measureID=1&measureKFC=1&indexId=${indexId}`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Высокоуровневая обёртка: «дай мне таблицу регион × год» по показателю.
// Используется и в обозревателе, и для подключения к движку верификации
// (например, региональные средние урожайности).
// ────────────────────────────────────────────────────────────────────────────

export interface BnsRegionYearTable {
  indexId: number;
  indexName: string;
  namePath: string;
  unit: string;
  periodId: number;
  rootTermId: string;
  rootName: string;
  years: { dateId: string; year: number; label: string }[];
  rows: { id: string; name: string; values: Record<number, number | null> }[];
}

// Парсим число из строки (БНС иногда возвращает значения как строки и/или с запятыми)
function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Из dateList-кода ("122015") вытаскиваем год — это последние 4 символа.
function yearFromDateCode(code: string): number {
  const m = code.match(/(\d{4})$/);
  return m ? +m[1] : NaN;
}

export async function fetchRegionYearTable(
  indexId: number,
  opts?: { periodId?: number; rootTermId?: string },
): Promise<BnsRegionYearTable> {
  // 1. Период — Год (id=7) по умолчанию
  const periods = await getPeriodList(indexId);
  const period = periods.find((p) => p.id === (opts?.periodId ?? 7)) ?? periods.find((p) => p.id === 7) ?? periods[0];
  if (!period) throw new Error(`У показателя ${indexId} нет периодов`);

  // 2. Сегменты: ищем тот, где есть dicId 67 (регионы)
  const segments = await getSegmentList(indexId, period.id);
  const regionSeg = segments.find((s) => s.dicId.split("+").map((x) => x.trim()).includes("67")) ?? segments[0];
  if (!regionSeg) throw new Error(`У показателя ${indexId} нет сегментов`);

  const dicIds = regionSeg.dicId.split("+").map((s) => s.trim()).filter(Boolean);
  const allTerms = regionSeg.termIds.split(",").map((s) => s.trim()).filter(Boolean);
  const termId = opts?.rootTermId ?? allTerms[0] ?? "741880";
  const rootName = (regionSeg.termNames || "").split("+").map((s) => s.trim())[0] ?? "—";

  // 3. Доступные даты
  const ip = await getIndexPeriods({
    indexId, periodId: period.id, terms: allTerms, termId, dicIds,
  });
  const years = ip.dateList.map((d, i) => ({
    dateId: d,
    year: yearFromDateCode(d),
    label: ip.periodNameList[i] ?? d,
  }));

  // 4. Дерево: сначала корень (без parent_id) → строка с РК; затем дети (parent_id=root) → области
  const idx = regionSeg.idx ?? 0;
  const [rootRows, childRows] = await Promise.all([
    getIndexTreeData({ indexId, periodId: period.id, terms: allTerms, termId, dicIds, idx }),
    getIndexTreeData({ indexId, periodId: period.id, terms: allTerms, termId, dicIds, idx, parentId: termId }),
  ]);

  const allRows = [...rootRows, ...childRows];
  const rows = allRows.map((t) => {
    const values: Record<number, number | null> = {};
    for (const y of years) {
      const raw = (t as Record<string, unknown>)[`y${y.dateId}`];
      values[y.year] = parseNumber(raw);
    }
    return { id: t.id, name: (t.text ?? "").trim() || "—", values };
  });

  // 5. Метаданные
  let attrs: BnsIndexAttrs | null = null;
  try { attrs = await getIndexAttributes(indexId, period.id); } catch { /* не критично */ }

  return {
    indexId,
    indexName: attrs?.name ?? "",
    namePath: attrs?.namePath ?? "",
    unit: attrs?.measureName ?? "",
    periodId: period.id,
    rootTermId: termId,
    rootName,
    years,
    rows,
  };
}
