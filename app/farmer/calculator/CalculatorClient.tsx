"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { CROP_LABEL, type Crop } from "@/lib/types";
import { SOIL_REQUIREMENTS } from "@/lib/norms";
import { estimateYield } from "@/lib/yield-estimate";
import { Card, CardHeader, Stat, formatTenge } from "@/components/ui";

const CROP_OPTIONS: { id: Crop; label: string }[] = [
  { id: "wheat_spring", label: CROP_LABEL.wheat_spring },
  { id: "wheat_winter", label: CROP_LABEL.wheat_winter },
  { id: "barley",       label: CROP_LABEL.barley },
  { id: "oats",         label: CROP_LABEL.oats },
  { id: "sunflower",    label: CROP_LABEL.sunflower },
  { id: "rapeseed",     label: CROP_LABEL.rapeseed },
];

const FERT_PRICE_KG = 320;          // ₸/кг (NPK)
const SUBSIDY_RATE_FERT = 0.6;
const GRAIN_PRICE_KG = 130;         // ₸/кг (пшеница 3 класс)

export interface CalculatorPrefill {
  hasFieldData: boolean;
  fieldCadastralNumber?: string;
  fieldAreaHa?: number;
  fieldBonitet?: number;
  soil?: { humusPct: number; n: number; p: number; k: number };
  crop?: Crop;
  fertilizerKgHa?: number;
  meteo?: { swEqMm: number; springWindStress: boolean };
}

interface Props {
  farmerId: string;
  farmerName: string;
  isReal: boolean;
  prefill: CalculatorPrefill;
}

export function CalculatorClient({ farmerName, isReal, prefill }: Props) {
  const [crop, setCrop] = useState<Crop>(prefill.crop ?? "wheat_spring");
  const [areaHa, setAreaHa] = useState<number>(prefill.fieldAreaHa ?? 100);
  const [fertKgHa, setFertKgHa] = useState<number>(prefill.fertilizerKgHa ?? 50);
  const [declared, setDeclared] = useState<number | "">("");

  // Если prefill изменился (демо-фермер переключился), обновим стейт
  useEffect(() => {
    setAreaHa(prefill.fieldAreaHa ?? 100);
    setCrop(prefill.crop ?? "wheat_spring");
    setFertKgHa(prefill.fertilizerKgHa ?? 50);
    setDeclared("");
  }, [prefill.fieldAreaHa, prefill.crop, prefill.fertilizerKgHa]);

  const yld = useMemo(() => {
    if (!prefill.soil) return null;
    return estimateYield(
      { n: prefill.soil.n, p: prefill.soil.p, k: prefill.soil.k, gum: prefill.soil.humusPct, ph: 6.8 },
      crop,
      areaHa,
    );
  }, [prefill.soil, crop, areaHa]);

  const weatherAdj = useMemo(() => {
    const m = prefill.meteo;
    if (!m) return { factor: 1, note: "метеоданные недоступны" };
    let f = 1; const notes: string[] = [];
    if (m.swEqMm < 100) { f *= 0.8; notes.push(`мало снега (${m.swEqMm} мм) → −20%`); }
    else if (m.swEqMm < 150) { f *= 0.92; notes.push(`снега меньше нормы → −8%`); }
    if (m.springWindStress) { f *= 0.92; notes.push("«черные бури» весной → −8%"); }
    return { factor: f, note: notes.length ? notes.join("; ") : "условия штатные" };
  }, [prefill.meteo]);

  const expected = yld ? +(yld.expected * weatherAdj.factor).toFixed(1) : 0;
  const expectedHa = yld ? +(expected * areaHa / 10).toFixed(1) : 0;
  const optimalFertKgHa = Math.round(expected * 3.5);
  const fertCost = fertKgHa * areaHa * FERT_PRICE_KG;
  const subsidyEstimate = Math.round(fertCost * SUBSIDY_RATE_FERT);
  const grossRevenue = Math.round(expectedHa * 1000 * GRAIN_PRICE_KG);

  const declaredNum = typeof declared === "number" ? declared : 0;
  const overclaim = declaredNum > 0 && declaredNum > expected * 1.2;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-foreground/60">Калькулятор субсидий · pre-check</div>
            <h1 className="text-xl font-bold tracking-tight mt-1">{farmerName}</h1>
            <div className="text-sm text-foreground/70 mt-0.5">
              {prefill.hasFieldData
                ? <>Поле {prefill.fieldCadastralNumber ?? "—"} · {prefill.fieldAreaHa ?? "—"} га · бонитет {prefill.fieldBonitet ?? "—"}</>
                : isReal
                ? "У вас не привязаны хозяйства. Калькулятор работает в демо-режиме — для точных расчётов привяжите участок Гипрозема при регистрации."
                : "Поле не задано"}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Параметры" subtitle="Подставьте свои значения — система пересчитает потенциал и оптимальный закуп." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
          <Field label="Культура">
            <select value={crop} onChange={(e) => setCrop(e.target.value as Crop)} className="w-full border border-border rounded px-2 py-2 bg-card text-sm">
              {CROP_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Площадь, га">
            <input type="number" value={areaHa} min={1} onChange={(e) => setAreaHa(Number(e.target.value) || 0)}
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm tabular-nums" />
          </Field>
          <Field label="Удобрения NPK, кг/га">
            <input type="number" value={fertKgHa} min={0} onChange={(e) => setFertKgHa(Number(e.target.value) || 0)}
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm tabular-nums" />
          </Field>
          <Field label="Какую урожайность планируете заявить, ц/га">
            <input type="number" value={declared} min={0} step={0.1}
              onChange={(e) => setDeclared(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="напр. 13.5"
              className="w-full border border-border rounded px-2 py-2 bg-card text-sm tabular-nums" />
          </Field>
        </div>
      </Card>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Базовый потенциал" value={yld ? `${yld.expected} ц/га` : "—"} sub={yld?.limiting.name ? `лимит: ${yld.limiting.name}` : ""} />
        <Stat label="Потенциал с учётом погоды" value={`${expected} ц/га`} sub={weatherAdj.note} accent={weatherAdj.factor < 0.95 ? "warn" : "ok"} />
        <Stat label="Прогноз сбора" value={`${expectedHa} т`} sub={`выручка ≈ ${formatTenge(grossRevenue)}`} />
        <Stat label="Ожидаемая субсидия" value={formatTenge(subsidyEstimate)} sub={`60% от ${formatTenge(fertCost)} удобрений`} />
      </section>

      <Card>
        <CardHeader title="AI-рекомендация" />
        <div className="p-5 space-y-3 text-sm">
          {prefill.soil && yld && (
            <Block level={fertKgHa < optimalFertKgHa * 0.7 ? "warn" : "ok"}>
              <strong>Оптимальная норма удобрений:</strong> ≈ {optimalFertKgHa} кг/га NPK для культуры «{CROP_LABEL[crop]}» при ожидаемом сборе {expected} ц/га.
              {fertKgHa < optimalFertKgHa * 0.7 && (
                <> Сейчас вы планируете {fertKgHa} кг/га — недокорм, реальный сбор будет ниже расчётного.</>
              )}
              {fertKgHa > optimalFertKgHa * 1.5 && (
                <> Сейчас {fertKgHa} кг/га — это перерасход, отдача от лишних удобрений будет минимальной (закон убывающей отдачи).</>
              )}
            </Block>
          )}
          {overclaim && (
            <Block level="alert">
              <strong>Внимание!</strong> Заявленная урожайность {declaredNum} ц/га выше реалистичного потенциала ({expected} ц/га) более чем на 20%.
              Это попадёт под аудит ДЭР по правилу <code className="kbd">CROP_BIOLOGICAL_CEILING</code>. Рекомендуем указывать не более <strong>{(expected * 1.15).toFixed(1)} ц/га</strong>.
            </Block>
          )}
          {prefill.soil && yld && yld.limiting.status === "crit" && (
            <Block level="warn">
              Главное ограничение вашей почвы: <strong>{yld.limiting.name}</strong> ({yld.limiting.value}). Пока этот фактор не подтянут,
              увеличение других удобрений даст лишь небольшой прирост (закон Либиха).
            </Block>
          )}
          {prefill.soil && prefill.soil.humusPct < SOIL_REQUIREMENTS.humusPctMin && (
            <Block level="tip">
              <strong>Совет по рекультивации:</strong> внесите 25–30 т/га органики или посейте сидераты осенью —
              за 2–3 года поднимете гумус с {prefill.soil.humusPct}% до 3.5%, и потенциал вырастет на ~25%.
            </Block>
          )}
          {!prefill.hasFieldData && (
            <Block level="tip">
              Для точных расчётов калькулятор использует данные привязанного через Гипрозем участка.
              Привяжите хозяйство при регистрации — потенциал и рекомендации станут персональными.
            </Block>
          )}
        </div>
      </Card>

      <div className="text-center">
        <Link href="/farmer" className="text-sm text-foreground/60 hover:underline">← Вернуться в кабинет</Link>
      </div>
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

function Block({ level, children }: { level: "ok" | "tip" | "warn" | "alert"; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    ok:    "bg-sky-50 border-sky-200 text-sky-900",
    tip:   "bg-emerald-50 border-emerald-200 text-emerald-900",
    warn:  "bg-amber-50 border-amber-200 text-amber-900",
    alert: "bg-rose-50 border-rose-200 text-rose-900",
  };
  return <div className={`border rounded-lg p-3 ${cls[level]}`}>{children}</div>;
}
