"use client";

// ────────────────────────────────────────────────────────────────────────────
// Калькулятор урожайности на базе модели STEPPE-Y v0.1.
//
// Поток:
//   1. Фермер подставляет культуру/сорт/удобрения/дату посева/уборки
//   2. buildYieldPredictionInput собирает YieldPredictionInput
//   3. predictYield() выдаёт P10/P50/P90 + 8 компонентов + peer
//   4. UI рисует раскладку с цветовой индикацией уверенности и provenance
//
// Полностью на клиенте — predictYield синхронная pure-функция.
// ────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { CROP_LABEL, type Crop, type Field } from "@/lib/types";
import { predictYield } from "@/lib/yield/predict";
import { buildYieldPredictionInput } from "@/lib/yield/build-input";
import { SORT_PARAMS } from "@/lib/yield/norms";
import type { Confidence, YieldPrediction } from "@/lib/yield/types";
import { Card, CardHeader, Stat, formatTenge } from "@/components/ui";

const CROP_OPTIONS: { id: Crop; label: string }[] = [
  { id: "wheat_spring", label: CROP_LABEL.wheat_spring },
  { id: "wheat_winter", label: CROP_LABEL.wheat_winter },
  { id: "barley",       label: CROP_LABEL.barley },
  { id: "oats",         label: CROP_LABEL.oats },
  { id: "sunflower",    label: CROP_LABEL.sunflower },
  { id: "rapeseed",     label: CROP_LABEL.rapeseed },
];

const FERT_PRICE_KG = 320;
const SUBSIDY_RATE_FERT = 0.6;
const GRAIN_PRICE_KG = 130;

export interface WeatherOverrides {
  swEqMm?: number;
  daysWindOver17?: number;
  daysTmaxOver32?: number;
  soilWarmDate?: string;
}

export interface CalculatorPrefill {
  hasFieldData: boolean;
  field?: Field;                  // полный Field (мок или построенный из user)
  crop?: Crop;
  year?: number;
  fertilizerKgHa?: number;        // суммарная доза, для обратной совместимости
  weatherOverrides?: WeatherOverrides;
}

interface Props {
  farmerId: string;
  farmerName: string;
  isReal: boolean;
  prefill: CalculatorPrefill;
}

// Доступные сорта по культуре (из SORT_PARAMS).
function sortsForCrop(crop: Crop): { id: string; label: string }[] {
  return Object.values(SORT_PARAMS)
    .filter((s) => s.crop === crop)
    .map((s) => ({ id: s.id, label: s.displayName }));
}

export function CalculatorClient({ farmerName, isReal, prefill }: Props) {
  const [crop, setCrop] = useState<Crop>(prefill.crop ?? "wheat_spring");
  const [year] = useState<number>(prefill.year ?? new Date().getUTCFullYear());
  const [sortId, setSortId] = useState<string>(`${crop}/default`);
  const [areaHa, setAreaHa] = useState<number>(prefill.field?.areaHa ?? 100);
  // Раскладываем NPK: при отсутствии явного разделения — пропорция 50/30/20.
  const totalFert = prefill.fertilizerKgHa ?? 50;
  const [fertN, setFertN] = useState<number>(Math.round(totalFert * 0.5));
  const [fertP, setFertP] = useState<number>(Math.round(totalFert * 0.3));
  const [fertK, setFertK] = useState<number>(Math.round(totalFert * 0.2));
  const [sowingDate, setSowingDate] = useState<string>(defaultSowingDate(crop, year));
  const [harvestDate, setHarvestDate] = useState<string>(defaultHarvestDate(crop, year, sowingDate));
  const [herbicide, setHerbicide] = useState<boolean>(true);
  const [declared, setDeclared] = useState<number | "">("");

  // Sync state when prefill changes (e.g. demo farmer switch).
  useEffect(() => {
    setCrop(prefill.crop ?? "wheat_spring");
    setAreaHa(prefill.field?.areaHa ?? 100);
    const t = prefill.fertilizerKgHa ?? 50;
    setFertN(Math.round(t * 0.5));
    setFertP(Math.round(t * 0.3));
    setFertK(Math.round(t * 0.2));
    setDeclared("");
  }, [prefill.field?.areaHa, prefill.crop, prefill.fertilizerKgHa]);

  // При смене культуры — синхронизируем сорт-дефолт.
  useEffect(() => {
    setSortId(`${crop}/default`);
    setSowingDate(defaultSowingDate(crop, year));
  }, [crop, year]);

  // При смене посева — пересчитываем дефолт уборки (если фермер не редактировал явно).
  useEffect(() => {
    setHarvestDate(defaultHarvestDate(crop, year, sowingDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sowingDate, crop]);

  const prediction = useMemo<YieldPrediction | null>(() => {
    if (!prefill.field) return null;
    const input = buildYieldPredictionInput({
      field: prefill.field,
      year,
      crop,
      sortId,
      sowingDate,
      harvestDate,
      fertilizerNKgHa: fertN,
      fertilizerPKgHa: fertP,
      fertilizerKKgHa: fertK,
      herbicideDeclared: herbicide,
      declaredYieldCha: typeof declared === "number" ? declared : undefined,
      swEqMm: prefill.weatherOverrides?.swEqMm,
      daysWindOver17: prefill.weatherOverrides?.daysWindOver17,
      daysTmaxOver32: prefill.weatherOverrides?.daysTmaxOver32,
      soilWarmDate: prefill.weatherOverrides?.soilWarmDate,
    });
    return predictYield(input, { seed: 42, monteCarloIterations: 1000 });
  }, [
    prefill.field, prefill.weatherOverrides, year, crop, sortId,
    sowingDate, harvestDate, fertN, fertP, fertK, herbicide, declared,
  ]);

  const expected = prediction?.pointEstimateCha ?? 0;
  const expectedTons = +(expected * areaHa / 10).toFixed(1);
  const fertTotal = fertN + fertP + fertK;
  const fertCost = fertTotal * areaHa * FERT_PRICE_KG;
  const subsidyEstimate = Math.round(fertCost * SUBSIDY_RATE_FERT);
  const grossRevenue = Math.round(expectedTons * 1000 * GRAIN_PRICE_KG);

  const declaredNum = typeof declared === "number" ? declared : 0;
  const overP90 = prediction && declaredNum > prediction.p90Cha;
  const belowP10 = prediction && declaredNum > 0 && declaredNum < prediction.p10Cha;

  const sortOptions = sortsForCrop(crop);

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-foreground/60">
              Прогноз урожайности · STEPPE-Y v0.1
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight mt-1 wrap-break-word">{farmerName}</h1>
            <div className="text-sm text-foreground/70 mt-0.5">
              {prefill.hasFieldData && prefill.field
                ? <>Поле {prefill.field.cadastralNumber} · {prefill.field.areaHa} га · бонитет {prefill.field.bonitet}</>
                : isReal
                ? "Не привязаны хозяйства — калькулятор в демо-режиме. Привяжите Гипрозем-участок при регистрации для персонального прогноза."
                : "Поле не задано"}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Параметры сезона" subtitle="Подставьте свои значения — модель пересчитает 8 компонентов и финальный прогноз." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-5">
          <Field label="Культура">
            <select value={crop} onChange={(e) => setCrop(e.target.value as Crop)} className="w-full border border-border rounded px-2 py-2 bg-card text-sm">
              {CROP_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Сорт">
            <select value={sortId} onChange={(e) => setSortId(e.target.value)} className="w-full border border-border rounded px-2 py-2 bg-card text-sm">
              {sortOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Площадь, га">
            <input type="number" value={areaHa} min={1} onChange={(e) => setAreaHa(Number(e.target.value) || 0)}
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm tabular-nums" />
          </Field>
          <Field label="Дата посева">
            <input type="date" value={sowingDate} onChange={(e) => setSowingDate(e.target.value)}
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm" />
          </Field>
          <Field label="Дата уборки">
            <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)}
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm" />
          </Field>
          <Field label="Какую урожайность планируете заявить, ц/га">
            <input type="number" value={declared} min={0} step={0.1}
              onChange={(e) => setDeclared(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="напр. 13.5"
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm tabular-nums" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 sm:p-5 pt-0">
          <Field label="N, кг/га"><NumInput value={fertN} onChange={setFertN} /></Field>
          <Field label="P, кг/га"><NumInput value={fertP} onChange={setFertP} /></Field>
          <Field label="K, кг/га"><NumInput value={fertK} onChange={setFertK} /></Field>
          <Field label="Гербицидная обработка">
            <label className="flex items-center gap-2 px-2 py-2 border border-border rounded bg-card cursor-pointer text-sm">
              <input type="checkbox" checked={herbicide} onChange={(e) => setHerbicide(e.target.checked)} />
              Запланирована
            </label>
          </Field>
        </div>
      </Card>

      {prediction ? (
        <PredictionResult
          prediction={prediction}
          areaHa={areaHa}
          declaredNum={declaredNum}
          overP90={!!overP90}
          belowP10={!!belowP10}
          stats={{ expectedTons, subsidyEstimate, fertCost, grossRevenue, fertTotal }}
        />
      ) : (
        <Card className="p-6 text-sm text-foreground/60">
          Привяжите хозяйство при регистрации, чтобы получить персональный прогноз.
        </Card>
      )}

      <div className="text-center">
        <Link href="/farmer" className="text-sm text-foreground/60 hover:underline">← Вернуться в кабинет</Link>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Результат прогноза — основная карточка с раскладкой компонентов.
// ────────────────────────────────────────────────────────────────────────────

function PredictionResult({
  prediction, areaHa, declaredNum, overP90, belowP10, stats,
}: {
  prediction: YieldPrediction;
  areaHa: number;
  declaredNum: number;
  overP90: boolean;
  belowP10: boolean;
  stats: { expectedTons: number; subsidyEstimate: number; fertCost: number; grossRevenue: number; fertTotal: number };
}) {
  const c = prediction.components;
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Stat
          label="Прогноз (медиана)"
          value={`${prediction.p50Cha} ц/га`}
          sub={`${prediction.p10Cha} — ${prediction.p90Cha} ц/га (P10–P90)`}
          accent={prediction.overallConfidence === "high" ? "ok" : prediction.overallConfidence === "low" ? "warn" : undefined}
        />
        <Stat
          label="Прогноз сбора"
          value={`${stats.expectedTons} т`}
          sub={`на ${areaHa} га · выручка ≈ ${formatTenge(stats.grossRevenue)}`}
        />
        <Stat
          label="Уверенность модели"
          value={prediction.overallConfidence.toUpperCase()}
          sub={`сорт: ${prediction.sortUsed.displayName}`}
        />
        <Stat
          label="Ожидаемая субсидия"
          value={formatTenge(stats.subsidyEstimate)}
          sub={`60% от ${formatTenge(stats.fertCost)} удобрений`}
        />
      </section>

      <Card>
        <CardHeader title="Раскладка прогноза" subtitle={`Модель ${prediction.modelVersion}. Каждый компонент — формула из публичной науки.`} />
        <div className="p-4 sm:p-5 space-y-1.5 text-sm">
          <ComponentRow label="Y_potential (потолок)"     value={c.yPotential.value} suffix="ц/га" running={c.yPotential.value} reasons={c.yPotential.reasons} confidence={c.yPotential.confidence} highlight />
          <ComponentRow label="× Kw (вода)"                value={c.kw.value}         running={runningProduct(c, "kw")}        reasons={c.kw.reasons} confidence={c.kw.confidence} />
          <ComponentRow label="× Ks (стресс)"              value={c.ks.value}         running={runningProduct(c, "ks")}        reasons={c.ks.reasons} confidence={c.ks.confidence} />
          <ComponentRow label={`× Kd_adv (болезни, ${c.kd.mode})`} value={c.kd.value} running={runningProduct(c, "kd")} reasons={c.kd.reasons} confidence={c.kd.confidence} />
          <ComponentRow label={`× K_spray (${c.kSpray.herbicide.status})`} value={c.kSpray.value} running={runningProduct(c, "kSpray")} reasons={c.kSpray.reasons} confidence={c.kSpray.confidence} />
          <ComponentRow label="× K_nutrition (Mitscherlich)" value={c.kNutrition.value} running={runningProduct(c, "kNutrition")} reasons={c.kNutrition.reasons} confidence={c.kNutrition.confidence} />
          <ComponentRow label={`× K_harvest (потери ${c.kHarvest.lossPct}%)`} value={c.kHarvest.value} running={runningProduct(c, "kHarvest")} reasons={c.kHarvest.reasons} confidence={c.kHarvest.confidence} />
          <ComponentRow label={`× Cregion (${c.cregion.fallback ? "fallback" : "БНС"})`} value={c.cregion.value} running={runningProduct(c, "cregion")} reasons={c.cregion.reasons} confidence={c.cregion.confidence} final />
        </div>
      </Card>

      <Card>
        <CardHeader title="Сравнение с соседями" subtitle="9-й сигнал — не множитель в формуле, отдельная интерпретация." />
        <div className="p-4 sm:p-5">
          <PeerRow peer={prediction.peer} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Рекомендации" />
        <div className="p-4 sm:p-5 space-y-3 text-sm">
          {overP90 && (
            <Block level="alert">
              <strong>Заявленная урожайность {declaredNum} ц/га выше P90 ({prediction.p90Cha} ц/га)</strong> — за пределами 80%-интервала модели. Высокий риск аудита по правилу <code className="kbd">YIELD_DECLARED_ABOVE_P90</code>. Рекомендуем указывать не более <strong>{prediction.p90Cha} ц/га</strong>.
            </Block>
          )}
          {belowP10 && (
            <Block level="warn">
              Заявленная {declaredNum} ц/га ниже P10 ({prediction.p10Cha}). Возможно занижение — проверьте, не теряете ли субсидийную выгоду.
            </Block>
          )}
          {c.kd.recommendation && (
            <Block level="warn">
              <strong>Болезни:</strong> {c.kd.recommendation}
            </Block>
          )}
          {c.kw.confidence === "low" && (
            <Block level="tip">
              <strong>Низкая уверенность по воде:</strong> модель использовала только один источник (FAO bucket). При интеграции SMAP/NDVI прогноз станет точнее.
            </Block>
          )}
          {c.kHarvest.delayDays > 7 && (
            <Block level="warn">
              <strong>Уборка с задержкой {c.kHarvest.delayDays} дн:</strong> потери составят {c.kHarvest.lossPct}%. Постарайтесь убрать в оптимальное окно.
            </Block>
          )}
          {!overP90 && !belowP10 && !c.kd.recommendation && c.kHarvest.delayDays <= 7 && (
            <Block level="ok">
              По всем компонентам — штатный режим. Прогноз в реалистичном диапазоне для вашего поля.
            </Block>
          )}
        </div>
      </Card>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Атомы.
// ────────────────────────────────────────────────────────────────────────────

function runningProduct(c: YieldPrediction["components"], upTo: keyof YieldPrediction["components"]): number {
  const order: (keyof YieldPrediction["components"])[] = [
    "yPotential", "kw", "ks", "kd", "kSpray", "kNutrition", "kHarvest", "cregion",
  ];
  const idx = order.indexOf(upTo);
  let acc = 1;
  for (let i = 0; i <= idx; i++) {
    const k = order[i];
    const comp = c[k] as { value: number };
    acc = i === 0 ? comp.value : acc * comp.value;
  }
  return +acc.toFixed(2);
}

function ComponentRow({
  label, value, suffix, running, reasons, confidence, highlight, final,
}: {
  label: string;
  value: number;
  suffix?: string;
  running: number;
  reasons: string[];
  confidence: Confidence;
  highlight?: boolean;
  final?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border ${final ? "border-emerald-300 bg-emerald-50/40" : highlight ? "border-sky-200 bg-sky-50/30" : "border-border-soft bg-background-elev"} px-3 py-2`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="flex-1 text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums font-mono w-16 text-right">{value.toFixed(suffix ? 1 : 3)}{suffix ? ` ${suffix}` : ""}</span>
        <span className="text-sm tabular-nums font-mono w-20 text-right text-foreground/70">→ {running.toFixed(2)}</span>
        <ConfidenceBadge level={confidence} />
        <span className="text-xs text-foreground/40 w-4">{open ? "▾" : "▸"}</span>
      </button>
      {open && reasons.length > 0 && (
        <ul className="mt-2 pl-4 text-xs text-foreground/70 space-y-0.5">
          {reasons.map((r, i) => <li key={i}>· {r}</li>)}
        </ul>
      )}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const cls: Record<Confidence, string> = {
    high: "bg-emerald-100 text-emerald-800 border-emerald-200",
    medium: "bg-amber-100 text-amber-800 border-amber-200",
    low: "bg-rose-100 text-rose-800 border-rose-200",
    unknown: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls[level]} w-14 text-center`}>
      {level === "unknown" ? "—" : level}
    </span>
  );
}

function PeerRow({ peer }: { peer: YieldPrediction["peer"] }) {
  const cls: Record<string, string> = {
    above_peers_significantly: "bg-rose-50 border-rose-200 text-rose-900",
    above_peers:               "bg-amber-50 border-amber-200 text-amber-900",
    in_line_with_peers:        "bg-emerald-50 border-emerald-200 text-emerald-900",
    below_peers:               "bg-amber-50 border-amber-200 text-amber-900",
    below_peers_significantly: "bg-rose-50 border-rose-200 text-rose-900",
    no_peers:                  "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <div className={`border rounded-lg p-3 ${cls[peer.interpretation] ?? cls.no_peers}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{peer.interpretation.replace(/_/g, " ")}</div>
      <div className="text-sm mt-1">{peer.reasoning}</div>
      {peer.fieldVsPeerDeltaCha != null && (
        <div className="text-xs mt-1 opacity-70">
          Δ {peer.fieldVsPeerDeltaCha > 0 ? "+" : ""}{peer.fieldVsPeerDeltaCha} ц/га ({peer.fieldVsPeerDeltaPct?.toFixed(0)}%)
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-foreground/60">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full border border-border rounded px-2 py-2 bg-card text-sm tabular-nums"
    />
  );
}

function Block({ level, children }: { level: "ok" | "tip" | "warn" | "alert"; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    ok:    "bg-sky-50 border-sky-200 text-sky-900",
    tip:   "bg-emerald-50 border-emerald-200 text-emerald-900",
    warn:  "bg-amber-50 border-amber-200 text-amber-900",
    alert: "bg-rose-50 border-rose-200 text-rose-900",
  };
  return <div className={`border rounded-lg p-3 ${cls[level]}`}>{children}</div>;
}

// ────────────────────────────────────────────────────────────────────────────
// Дефолты дат по культуре.
// ────────────────────────────────────────────────────────────────────────────

function defaultSowingDate(crop: Crop, year: number): string {
  const map: Record<Crop, string> = {
    wheat_spring: `${year}-05-15`,
    wheat_winter: `${year - 1}-09-05`,
    barley:       `${year}-05-12`,
    oats:         `${year}-05-13`,
    sunflower:    `${year}-05-20`,
    rapeseed:     `${year}-05-10`,
  };
  return map[crop];
}

function defaultHarvestDate(crop: Crop, year: number, sowingDate: string): string {
  const daysByMaturity: Record<Crop, number> = {
    wheat_spring: 100, wheat_winter: 280, barley: 88, oats: 96, sunflower: 118, rapeseed: 96,
  };
  const t = new Date(`${sowingDate}T00:00:00Z`).getTime() + daysByMaturity[crop] * 86_400_000;
  void year;
  return new Date(t).toISOString().slice(0, 10);
}
