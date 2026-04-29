"use client";

import { useActionState, useState } from "react";
import { submitApplication, type SubmitApplicationResult } from "@/app/farmer/applications/actions";
import { SUBSIDY_CATEGORY_LABEL, type SubsidyCategory } from "@/lib/subsidy-categories";
import { CROP_LABEL, type Crop } from "@/lib/types";

interface Props {
  farmerId: string;
}

const CATEGORIES: SubsidyCategory[] = [
  "fertilizer", "seeds", "pesticides", "irrigation", "insurance",
  "transport", "machinery", "feed", "breeding", "weight_realization",
];

const CROP_OPTIONS: Crop[] = ["wheat_spring", "wheat_winter", "barley", "oats", "sunflower", "rapeseed"];

// Категории, для которых форма требует декларацию урожая/удобрений —
// именно эти данные нужны фрод-движку для проверки заявки.
const REQUIRES_CROP_DECL: SubsidyCategory[] = ["fertilizer", "seeds"];

export function ApplicationForm({ farmerId }: Props) {
  const [state, formAction, pending] = useActionState<SubmitApplicationResult | null, FormData>(
    submitApplication,
    null,
  );
  const [category, setCategory] = useState<SubsidyCategory>("fertilizer");
  const requiresCropDecl = REQUIRES_CROP_DECL.includes(category);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="farmerId" value={farmerId} />

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-foreground/60">Тип субсидии</span>
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SubsidyCategory)}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{SUBSIDY_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-foreground/60">Сумма субсидии, ₸</span>
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            step={1000}
            min={1}
            placeholder="например, 1 200 000"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wider text-foreground/60">Объект / описание</span>
        <input
          name="scope"
          type="text"
          placeholder="например, Пшеница яровая · поле №3 · 800 га"
          className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none"
          required
        />
      </label>

      {requiresCropDecl && (
        <fieldset className="border border-border-soft rounded-xl p-4 bg-muted/40 space-y-3">
          <legend className="px-2 text-xs uppercase tracking-wider text-foreground/70 font-semibold">
            Декларация урожая · нужна для авто-проверки
          </legend>
          <p className="text-[11px] text-foreground/60 -mt-1">
            Эти цифры система сравнит с агрохимией почвы, метео и нормативами по культуре.
            Если заявленный сбор реалистичен — заявку одобрят без вопросов; если выбивается из норм — попадёт под аудит.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[11px] text-foreground/70">Культура</span>
              <select
                name="crop"
                defaultValue="wheat_spring"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none"
              >
                {CROP_OPTIONS.map((c) => <option key={c} value={c}>{CROP_LABEL[c]}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] text-foreground/70">Площадь, га</span>
              <input
                name="area_ha"
                type="number"
                step={1}
                min={1}
                max={100000}
                placeholder="например, 800"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none tabular-nums"
                required
              />
            </label>

            <label className="block">
              <span className="text-[11px] text-foreground/70">Заявленный урожай, ц/га</span>
              <input
                name="declared_yield"
                type="number"
                step={0.1}
                min={0}
                max={200}
                placeholder="например, 13.5"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none tabular-nums"
                required
              />
            </label>

            <label className="block">
              <span className="text-[11px] text-foreground/70">Удобрения NPK, кг/га</span>
              <input
                name="fert_kg_ha"
                type="number"
                step={1}
                min={0}
                max={1000}
                placeholder="например, 50"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none tabular-nums"
                required
              />
            </label>

            <label className="block sm:col-span-2 lg:col-span-2">
              <span className="text-[11px] text-foreground/70">Дата посева</span>
              <input
                name="sowing_date"
                type="date"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none tabular-nums"
                required
              />
            </label>
          </div>
        </fieldset>
      )}

      {state?.error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Заявка <span className="font-mono">{state.applicationId}</span> подана. Вы увидите её в реестре ниже,
          и автоматическая проверка скоро отработает в досье у инспектора.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Отправка…" : "Подать заявку"}
        </button>
        <span className="text-xs text-foreground/60">
          Статус «На проверке» поставится сразу.
        </span>
      </div>
    </form>
  );
}
