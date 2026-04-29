"use server";

import { revalidatePath } from "next/cache";
import { addApplication } from "@/lib/applications-store";
import { resolveFarmer } from "@/lib/farmer-context";
import { SUBSIDY_CATEGORY_LABEL, type SubsidyCategory } from "@/lib/subsidy-categories";

const ALLOWED: SubsidyCategory[] = [
  "fertilizer", "seeds", "pesticides", "irrigation",
  "insurance", "transport", "machinery", "feed", "breeding", "weight_realization",
];

export interface SubmitApplicationResult {
  ok: boolean;
  error?: string;
  applicationId?: string;
}

// Server Action: подача новой заявки. Вызывается из ApplicationForm
// (client component) через useTransition + form action.
export async function submitApplication(_prev: SubmitApplicationResult | null, formData: FormData): Promise<SubmitApplicationResult> {
  const farmerIdRaw = String(formData.get("farmerId") ?? "");
  const category = String(formData.get("category") ?? "") as SubsidyCategory;
  const scope = String(formData.get("scope") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "0");

  if (!ALLOWED.includes(category)) {
    return { ok: false, error: "Неизвестный тип субсидии" };
  }
  if (scope.length < 3) {
    return { ok: false, error: "Опишите объект заявки (мин. 3 символа)" };
  }
  const amount = Number(amountRaw.replace(/\s+/g, "").replace(/,/g, "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Укажите положительную сумму в тенге" };
  }
  if (amount > 1_000_000_000) {
    return { ok: false, error: "Сумма выглядит подозрительно большой" };
  }

  // Резолвим фермера: либо демо-режим (?as=F-001), либо реальный пользователь.
  // resolveFarmer fall-backs на FARMERS[0], если ?as пустой и нет сессии — это
  // нормально для прототипа.
  const farmer = resolveFarmer(farmerIdRaw || null);

  const app = await addApplication({
    farmerId: farmer.id,
    category,
    type: `Субсидия — ${SUBSIDY_CATEGORY_LABEL[category]}`,
    scope,
    amount: Math.round(amount),
  });

  // Перерисовать страницу, чтобы новая заявка появилась в реестре.
  revalidatePath("/farmer/applications");

  return { ok: true, applicationId: app.id };
}
