"use client";

import { useEffect, useRef, useState } from "react";

interface SearchResult { id: number; name: string; code: string; }

interface DataTable {
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

const POPULAR_QUERIES = [
  "Урожайность зерновых",
  "Урожайность пшеницы",
  "Поголовье крупного рогатого скота",
  "Реализация скота на убой",
  "Посевная площадь",
  "Валовой сбор",
];

const CACHE_KEY = "bns-search-cache-v1";

export default function BnsExplorerPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [table, setTable] = useState<DataTable | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, SearchResult[]>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) cacheRef.current = new Map(Object.entries(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  function persistCache() {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cacheRef.current)));
    } catch { /* ignore */ }
  }

  async function runSearch(q: string) {
    setSearchError(null);
    if (q.trim().length < 2) { setResults([]); return; }
    const key = q.trim().toLowerCase();
    const cached = cacheRef.current.get(key);
    if (cached) { setResults(cached); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/bns/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const list = (data.results as SearchResult[]) ?? [];
      cacheRef.current.set(key, list);
      persistCache();
      setResults(list);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 400);
  }

  async function loadIndicator(id: number) {
    setSelectedId(id);
    setTable(null);
    setTableError(null);
    setTableLoading(true);
    try {
      const res = await fetch(`/api/bns/data?indexId=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTable(data as DataTable);
    } catch (e) {
      setTableError(e instanceof Error ? e.message : String(e));
    } finally {
      setTableLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border-soft rounded-2xl shadow-soft p-6">
        <div className="text-xs uppercase tracking-wider text-foreground-soft">БНС · taldau.stat.gov.kz</div>
        <h1 className="text-xl font-bold tracking-tight mt-1">Обозреватель статистики БНС</h1>
        <p className="text-sm text-foreground-soft mt-1">
          Live-доступ к Taldau API: ищите показатель (урожайность, поголовье, веса), смотрите разбивку по областям и годам.
          Эти данные потом подключаются к движку верификации как «региональный эталон».
        </p>

        <div className="mt-4 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="например: «Урожайность пшеницы»"
            className="w-full border border-border rounded px-3 py-2 bg-card text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {POPULAR_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setQuery(q); runSearch(q); }}
                className="text-[11px] px-2 py-1 rounded-full border border-border bg-muted/40 hover:border-accent/40 hover:text-accent"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {searchError && (
          <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">{searchError}</div>
        )}
      </div>

      {(searching || results.length > 0) && (
        <div className="bg-card border border-border-soft rounded-2xl shadow-soft">
          <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between">
            <div className="text-sm font-semibold">Результаты поиска</div>
            <div className="text-xs text-foreground-soft">{searching ? "поиск…" : `${results.length} показателей`}</div>
          </div>
          <div className="divide-y divide-border-soft max-h-96 overflow-y-auto">
            {results.length === 0 && !searching && (
              <div className="px-5 py-6 text-sm text-foreground/60">Ничего не нашлось — попробуйте другой фрагмент.</div>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => loadIndicator(r.id)}
                className={`w-full text-left px-5 py-3 hover:bg-muted/40 ${selectedId === r.id ? "bg-emerald-50/60" : ""}`}
              >
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-foreground/60 mt-0.5 font-mono">id {r.id} · код {r.code || "—"}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedId !== null && (
        <div className="bg-card border border-border-soft rounded-2xl shadow-soft">
          <div className="px-5 py-4 border-b border-border-soft">
            <div className="text-sm font-semibold">
              {table?.indexName ?? `Показатель ${selectedId}`}
            </div>
            {table?.namePath && <div className="text-xs text-foreground-soft mt-0.5">{table.namePath}</div>}
            {table && (
              <div className="text-xs text-foreground-soft mt-1">
                Единица: <span className="font-medium">{table.unit || "—"}</span> · Период: годовой ·
                Лет в выборке: {table.years.length} · Строк: {table.rows.length}
              </div>
            )}
          </div>

          {tableLoading && <div className="px-5 py-6 text-sm text-foreground/60">Запрос в Taldau (5–15 сек)…</div>}
          {tableError && <div className="px-5 py-4 text-sm text-rose-700">{tableError}</div>}

          {table && !tableLoading && (
            <BnsTable table={table} />
          )}
        </div>
      )}
    </div>
  );
}

function BnsTable({ table }: { table: DataTable }) {
  const yearsAsc = [...table.years].sort((a, b) => a.year - b.year);
  const lastYears = yearsAsc.slice(-10); // показываем последние 10 лет
  // Корневая строка (РК) идёт первой; помечаем bold
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-foreground/60 bg-muted/40 sticky top-0">
          <tr>
            <th className="text-left px-5 py-2 font-medium">Регион</th>
            {lastYears.map((y) => (
              <th key={y.dateId} className="text-right px-2 py-2 font-medium">{y.year}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => {
            const isRoot = row.id === table.rootTermId;
            return (
              <tr key={`${row.id}-${i}`} className={`border-t border-border ${isRoot ? "bg-emerald-50/40 font-semibold" : ""}`}>
                <td className="px-5 py-2 align-top">{row.name}</td>
                {lastYears.map((y) => {
                  const v = row.values[y.year];
                  return (
                    <td key={y.dateId} className="text-right px-2 py-2 tabular-nums">
                      {v == null ? <span className="text-foreground/30">—</span> : formatBnsValue(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatBnsValue(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} млрд`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} млн`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)} тыс`;
  return v.toLocaleString("ru-KZ", { maximumFractionDigits: 2 });
}
