"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GiprozemFeature, GiprozemResponse } from "@/lib/giprozem";
import { GIPROZEM_BASE } from "@/lib/giprozem";
import {
  GIPROZEM_LAYERS,
  OBLAST_NAMES,
  layersByOblast,
  findLayer,
  intersectingLayers,
  intersectingLayersCount,
  type GiprozemLayer,
} from "@/lib/giprozem-catalog";
import { Card, CardHeader, Stat } from "@/components/ui";
import { SOIL_REQUIREMENTS } from "@/lib/norms";
import { estimateYield, type YieldEstimate } from "@/lib/yield-estimate";
import { CROP_LABEL, type Crop } from "@/lib/types";

const CROP_OPTIONS: { id: Crop; label: string }[] = [
  { id: "wheat_spring", label: CROP_LABEL.wheat_spring },
  { id: "wheat_winter", label: CROP_LABEL.wheat_winter },
  { id: "barley",       label: CROP_LABEL.barley },
  { id: "oats",         label: CROP_LABEL.oats },
  { id: "sunflower",    label: CROP_LABEL.sunflower },
  { id: "rapeseed",     label: CROP_LABEL.rapeseed },
];

const GiprozemMap = dynamic(() => import("@/components/GiprozemMap").then((m) => m.GiprozemMap), {
  ssr: false,
  loading: () => <div className="h-120 rounded-lg border border-border bg-muted/30 grid place-items-center text-foreground/60 text-sm">загрузка карты…</div>,
});

const OBLAST_OPTIONS = Object.entries(OBLAST_NAMES).sort((a, b) => a[1].localeCompare(b[1], "ru"));

// Признак, до какого числа слоёв в видимой области мы готовы делать fan-out запросов.
// Дальше (zoom-out на половину страны) показываем подсказку «увеличьте масштаб».
const MAX_LAYERS_IN_VIEW = 8;

interface EnrichedFeature extends GiprozemFeature {
  _layerId: number;
  _layerName: string;
}

export default function GiprozemPage() {
  const [oblastCode, setOblastCode] = useState<string>("12");
  const [layerId, setLayerId] = useState<number | null>(null);

  // Текущий bbox карты (W,S,E,N) — обновляется при каждом moveend
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  // Фильтр по году обследования: null = все годы (where=1=1), число = where=yearob=YYYY
  const [year, setYear] = useState<number | null>(null);
  // Культура для оценки урожая
  const [crop, setCrop] = useState<Crop>("wheat_spring");
  const [features, setFeatures] = useState<EnrichedFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [usedLayers, setUsedLayers] = useState<GiprozemLayer[]>([]);
  const [intersectCount, setIntersectCount] = useState(0);
  const [lastQueryDescr, setLastQueryDescr] = useState<string | null>(null);

  // Кеш доступных годов обследования по слою (lazy-fetch на /years=1).
  const [yearsByLayer, setYearsByLayer] = useState<Map<number, number[]>>(new Map());

  const rayons = useMemo(() => layersByOblast(oblastCode), [oblastCode]);
  const currentLayer: GiprozemLayer | undefined = layerId ? findLayer(layerId) : undefined;

  // Объединение доступных годов по всем видимым слоям
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    usedLayers.forEach((l) => (yearsByLayer.get(l.id) || []).forEach((y) => set.add(y)));
    return Array.from(set).sort((a, b) => b - a);
  }, [usedLayers, yearsByLayer]);

  // При смене области — выбираем первый район
  useEffect(() => {
    if (rayons.length > 0) setLayerId(rayons[0].id);
  }, [oblastCode, rayons]);

  // Гарантируем отмену предыдущей пачки запросов при новом move
  const ctrlRef = useRef<AbortController | null>(null);

  // Bbox-driven fetch
  useEffect(() => {
    if (!bbox) return;
    const [w, s, e, n] = bbox;

    const totalIntersect = intersectingLayersCount(w, s, e, n);
    setIntersectCount(totalIntersect);

    if (totalIntersect === 0) {
      setFeatures([]); setUsedLayers([]); setError(null); setLastQueryDescr(null);
      return;
    }
    if (totalIntersect > MAX_LAYERS_IN_VIEW) {
      // Пользователь зум-аутнул на много областей — не флудим Гипрозем 100 запросами
      setFeatures([]); setUsedLayers([]); setError(null);
      setLastQueryDescr(null);
      return;
    }

    const layers = intersectingLayers(w, s, e, n, MAX_LAYERS_IN_VIEW);
    setUsedLayers(layers);

    // Отменяем предыдущие in-flight, начинаем новую пачку
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    setLoading(true); setError(null);

    const yearParam = year ? `&year=${year}` : "";
    Promise.all(
      layers.map((l) =>
        fetch(`/api/giprozem?layer=${l.id}&bbox=${w},${s},${e},${n}&limit=300${yearParam}`, { signal: ctrl.signal })
          .then((r) => r.ok ? r.json() as Promise<GiprozemResponse> : Promise.reject(new Error(`HTTP ${r.status}`)))
          .then((d) => ({ layer: l, features: d.features ?? [] }))
      )
    )
      .then((results) => {
        if (ctrl.signal.aborted) return;
        const merged: EnrichedFeature[] = results.flatMap((r) =>
          r.features.map((f) => ({ ...f, _layerId: r.layer.id, _layerName: r.layer.name }))
        );
        setFeatures(merged);
        const yearTag = year ? ` • год ${year}` : "";
        setLastQueryDescr(`bbox=${w.toFixed(3)},${s.toFixed(3)},${e.toFixed(3)},${n.toFixed(3)} • слоёв: ${layers.length} • участков: ${merged.length}${yearTag}`);
      })
      .catch((err) => {
        if ((err as any).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [bbox, year]);

  // Lazy-fetch уникальных годов для каждого нового слоя в видимой области (один раз).
  useEffect(() => {
    const newLayers = usedLayers.filter((l) => !yearsByLayer.has(l.id));
    if (newLayers.length === 0) return;
    let cancelled = false;
    Promise.all(
      newLayers.map((l) =>
        fetch(`/api/giprozem?layer=${l.id}&years=1`)
          .then((r) => r.ok ? r.json() as Promise<GiprozemResponse> : Promise.reject(new Error(`HTTP ${r.status}`)))
          .then((d) => ({
            layer: l,
            years: (d.features ?? [])
              .map((f) => f.attributes.yearob)
              .filter((y): y is number => typeof y === "number"),
          }))
          .catch(() => ({ layer: l, years: [] as number[] }))
      )
    ).then((results) => {
      if (cancelled) return;
      setYearsByLayer((prev) => {
        const next = new Map(prev);
        results.forEach(({ layer, years }) => next.set(layer.id, years));
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [usedLayers, yearsByLayer]);

  // Оценка урожая по каждому участку (на основе агрохимии Гипрозема + культуры)
  const featuresWithYield = useMemo(
    () => features.map((f) => ({
      f,
      yld: estimateYield(f.attributes, crop, f.attributes.s ?? undefined),
    })),
    [features, crop]
  );

  // KPI
  const totalArea = features.reduce((s, f) => s + (f.attributes.s ?? 0), 0);
  const avgGum = features.length ? features.reduce((s, f) => s + (f.attributes.gum ?? 0), 0) / features.length : 0;
  const avgP = features.length ? features.reduce((s, f) => s + (f.attributes.p ?? 0), 0) / features.length : 0;
  const flagged = features.filter((f) => (f.attributes.p ?? 99) < SOIL_REQUIREMENTS.phosphorusMgKgMin).length;
  const totalExpectedTons = featuresWithYield.reduce((s, x) => s + (x.yld.expectedHaTotal ?? 0), 0);
  const avgExpected = featuresWithYield.length
    ? featuresWithYield.reduce((s, x) => s + x.yld.expected, 0) / featuresWithYield.length
    : 0;

  const tooMany = intersectCount > MAX_LAYERS_IN_VIEW;

  return (
    <div className="space-y-6">
      <section>
        <div className="text-xs uppercase tracking-wider text-foreground/60">Live · ArcGIS REST API · portal.giprozem.kz</div>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Карта агрохимобследования РК</h1>
        <p className="text-sm text-foreground/70 mt-1 max-w-3xl">
          Перемещайте и масштабируйте карту — система автоматически дозапрашивает участки во всех районах, попадающих в видимую область.
          Селекторы «Область / Район» работают как быстрый прыжок на интересующее место.
        </p>
      </section>

      <Card className="p-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr_auto] gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground/60">Область (быстрый переход)</span>
            <select
              value={oblastCode}
              onChange={(e) => setOblastCode(e.target.value)}
              className="border border-border rounded px-3 py-2 bg-card text-sm"
            >
              {OBLAST_OPTIONS.map(([code, name]) => (
                <option key={code} value={code}>{name} (код {code})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground/60">Район ({rayons.length} доступно)</span>
            <select
              value={layerId ?? ""}
              onChange={(e) => setLayerId(Number(e.target.value))}
              className="border border-border rounded px-3 py-2 bg-card text-sm font-mono"
            >
              {rayons.map((r) => (
                <option key={r.id} value={r.id}>{r.name} · код {r.rayonCode}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground/60">
              Год обследования {availableYears.length > 0 && <span className="text-foreground/40">({availableYears.length})</span>}
            </span>
            <select
              value={year ?? ""}
              onChange={(e) => setYear(e.target.value === "" ? null : Number(e.target.value))}
              className="border border-border rounded px-3 py-2 bg-card text-sm tabular-nums"
            >
              <option value="">Все годы</option>
              {availableYears.length === 0 && (
                <option value="" disabled>годы загружаются…</option>
              )}
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground/60">Культура (для оценки урожая)</span>
            <select
              value={crop}
              onChange={(e) => setCrop(e.target.value as Crop)}
              className="border border-border rounded px-3 py-2 bg-card text-sm"
            >
              {CROP_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <span className="text-xs text-foreground/60 self-end pb-2">
            {loading ? "загрузка участков…" : intersectCount === 0 ? "в видимой области нет покрытия" : `${intersectCount} район(ов) в области`}
          </span>
        </div>
        {error && <div className="text-xs text-rose-700 mt-3">Ошибка: {error}</div>}
        {tooMany && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
            В видимой области {intersectCount} районов — слишком много, чтобы запрашивать одновременно.
            Увеличьте масштаб карты, чтобы увидеть участки (предел: {MAX_LAYERS_IN_VIEW}).
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Карта"
          subtitle={lastQueryDescr ?? (tooMany ? "увеличьте масштаб для подгрузки" : "перемещайте карту — данные подгрузятся автоматически")}
        />
        <div className="p-3">
          <GiprozemMap
            features={features}
            flyToBbox={currentLayer?.bbox}
            onBoundsChange={setBbox}
            selectedIndex={selected}
            onSelect={(i) => setSelected(i)}
          />
          <Legend />
          {usedLayers.length > 0 && (
            <div className="mt-3 text-[11px] text-foreground/60">
              <span className="mr-2">Запрошено слоёв в видимой области:</span>
              {usedLayers.map((l) => (
                <a
                  key={l.id}
                  href={`${GIPROZEM_BASE}/${l.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-block font-mono mr-2 underline underline-offset-2"
                  title={`${OBLAST_NAMES[l.oblastCode]} · слой ${l.id}`}
                >
                  {l.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </Card>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Участков в видимой области" value={features.length} sub={features.length === 300 * usedLayers.length ? "лимит на слой" : "полный набор"} />
        <Stat label="Общая площадь" value={`${totalArea.toFixed(0)} га`} />
        <Stat label="Среднее P" value={avgP ? `${avgP.toFixed(1)} мг/кг` : "—"} sub={`норма ≥ ${SOIL_REQUIREMENTS.phosphorusMgKgMin}`} accent={avgP && avgP < SOIL_REQUIREMENTS.phosphorusMgKgMin ? "warn" : "ok"} />
        <Stat
          label={`Ожидаемый — ${CROP_LABEL[crop]}`}
          value={avgExpected ? `${avgExpected.toFixed(1)} ц/га` : "—"}
          sub={`в среднем по участкам`}
          accent={avgExpected ? (avgExpected < 8 ? "high" : avgExpected < 12 ? "warn" : "ok") : undefined}
        />
        <Stat
          label="Прогноз валового сбора"
          value={totalExpectedTons ? `${totalExpectedTons.toFixed(0)} т` : "—"}
          sub={`по агрохимии Гипрозема`}
        />
      </section>

      <Card>
        <CardHeader
          title={`Список участков · оценка урожая для культуры «${CROP_LABEL[crop]}»`}
          subtitle="Бонитет оценивается по гумусу, ожидаемая урожайность — по закону Либиха (лимитирующий элемент задаёт потолок)."
        />
        <div className="overflow-x-auto max-h-120 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left sticky top-0">
              <tr>
                <th className="px-5 py-2 font-medium">Хозяйство</th>
                <th className="px-3 py-2 font-medium">Слой</th>
                <th className="px-3 py-2 font-medium text-right">N</th>
                <th className="px-3 py-2 font-medium text-right">P</th>
                <th className="px-3 py-2 font-medium text-right">K</th>
                <th className="px-3 py-2 font-medium text-right">Гумус %</th>
                <th className="px-3 py-2 font-medium text-right">pH</th>
                <th className="px-3 py-2 font-medium text-right">Год</th>
                <th className="px-3 py-2 font-medium text-right">Площадь, га</th>
                <th className="px-3 py-2 font-medium text-right">Бонитет (≈)</th>
                <th className="px-3 py-2 font-medium text-right">Ожидаемый ц/га</th>
                <th className="px-3 py-2 font-medium text-right">Прогноз, т</th>
                <th className="px-3 py-2 font-medium">Лимитирующий</th>
              </tr>
            </thead>
            <tbody>
              {features.length === 0 && (
                <tr><td colSpan={13} className="px-5 py-8 text-center text-foreground/60">
                  {tooMany ? "Слишком крупный масштаб — увеличьте карту" : loading ? "Загрузка…" : "Нет данных в видимой области"}
                </td></tr>
              )}
              {featuresWithYield.map(({ f, yld }, i) => (
                <Row key={i} f={f} yld={yld} idx={i} selected={selected === i} onClick={() => setSelected(i)} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ["#16a34a", "P ≥ 25 — оптимум"],
    ["#84cc16", "P 15–25 — норма"],
    ["#facc15", "Гумус < 3%"],
    ["#f59e0b", "P 8–15 — дефицит"],
    ["#ef4444", "P < 8 — острый дефицит"],
    ["#9ca3af", "нет данных"],
  ];
  return (
    <div className="mt-3 text-xs text-foreground/70 flex flex-wrap items-center gap-3">
      <span>Шкала:</span>
      {items.map(([c, l], i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-foreground/20" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Row({ f, yld, idx, selected, onClick }: { f: EnrichedFeature; yld: YieldEstimate; idx: number; selected: boolean; onClick: () => void }) {
  const a = f.attributes;
  const fmt = (v: number | null, d = 1) => v == null ? "—" : v.toFixed(d);
  const yieldClass =
    yld.expected < 6 ? "text-rose-700 font-semibold" :
    yld.expected < 10 ? "text-amber-800 font-medium" :
    yld.expected >= 14 ? "text-emerald-800 font-medium" : "";
  return (
    <tr
      onClick={onClick}
      className={`border-t border-border cursor-pointer ${selected ? "bg-amber-100/60" : "hover:bg-muted/40"}`}
    >
      <td className="px-5 py-2 font-medium">{a.nazvxoz ?? "—"}</td>
      <td className="px-3 py-2 font-mono text-xs text-foreground/60">{f._layerName}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(a.n, 1)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${a.p != null && a.p < SOIL_REQUIREMENTS.phosphorusMgKgMin ? "text-rose-700 font-semibold" : ""}`}>{fmt(a.p, 1)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(a.k, 0)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${a.gum != null && a.gum < SOIL_REQUIREMENTS.humusPctMin ? "text-rose-700 font-semibold" : ""}`}>{fmt(a.gum, 2)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(a.ph, 2)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground/70">{a.yearob ?? "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(a.s, 0)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{yld.bonitetEst.toFixed(0)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${yieldClass}`} title={`эталон ${yld.base} ц/га × бонитет ${(yld.bonitetCoef*100).toFixed(0)}% × лимит ${(yld.limiting.coef*100).toFixed(0)}%`}>
        {yld.expected.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground/70">{yld.expectedHaTotal != null ? yld.expectedHaTotal.toFixed(1) : "—"}</td>
      <td className="px-3 py-2 text-xs">
        <span className={
          yld.limiting.status === "crit" ? "text-rose-700 font-semibold" :
          yld.limiting.status === "warn" ? "text-amber-800" : "text-emerald-700"
        }>
          {yld.limiting.name}: {yld.limiting.value}
        </span>
      </td>
    </tr>
  );
}
