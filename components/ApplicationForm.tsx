"use client";

import { useActionState, useState } from "react";
import { submitApplication, type SubmitApplicationResult } from "@/app/farmer/applications/actions";
import { SUBSIDY_CATEGORY_LABEL, type SubsidyCategory } from "@/lib/subsidy-categories";

interface Props {
  farmerId: string;
}

const CATEGORIES: SubsidyCategory[] = [
  "fertilizer", "seeds", "pesticides", "irrigation", "insurance",
  "transport", "machinery", "feed", "breeding", "weight_realization",
];

// Форма подачи новой заявки. Через useActionState получаем результат
// Server Action и отображаем error/success без полной перезагрузки.
export function ApplicationForm({ farmerId }: Props) {
  const [state, formAction, pending] = useActionState<SubmitApplicationResult | null, FormData>(
    submitApplication,
    null,
  );
  const [category, setCategory] = useState<SubsidyCategory>("fertilizer");

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
          <span className="text-[11px] uppercase tracking-wider text-foreground/60">Сумма, ₸</span>
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
          placeholder="например, Пшеница яровая · поле №3 · 800 га · 50 кг/га"
          className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:border-accent focus:outline-none"
          required
        />
      </label>

      {state?.error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Заявка <span className="font-mono">{state.applicationId}</span> подана и поставлена на проверку.
          Запись появилась в реестре ниже.
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
          В реестр уйдёт мгновенно со статусом «На проверке».
        </span>
      </div>
    </form>
  );
}
