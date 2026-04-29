"use server";

import { revalidatePath } from "next/cache";
import { addApplication, type CropDeclaration } from "@/lib/applications-store";
import { resolveFarmerSession } from "@/lib/farmer-context";
import { SUBSIDY_CATEGORY_LABEL, type SubsidyCategory } from "@/lib/subsidy-categories";
import { CROP_NORMS } from "@/lib/norms";
import type { Crop } from "@/lib/types";

const ALLOWED: SubsidyCategory[] = [
  "fertilizer", "seeds", "pesticides", "irrigation",
  "insurance", "transport", "machinery", "feed", "breeding", "weight_realization",
];

const ALLOWED_CROPS: Crop[] = ["wheat_spring", "wheat_winter", "barley", "oats", "sunflower", "rapeseed"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Категории, для которых нужна декларация урожая/удобрений.
const REQUIRES_CROP_DECL: SubsidyCategory[] = ["fertilizer", "seeds"];

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

  // Декларация урожая — обязательна для fertilizer/seeds, чтобы фрод-движок
  // мог проверить заявку. Для остальных категорий — игнорируем.
  let cropDeclaration: CropDeclaration | undefined;
  if (REQUIRES_CROP_DECL.includes(category)) {
    const crop = String(formData.get("crop") ?? "") as Crop;
    const areaHa = Number(String(formData.get("area_ha") ?? "0").replace(/\s+/g, "").replace(/,/g, "."));
    const declaredYield = Number(String(formData.get("declared_yield") ?? "0").replace(/\s+/g, "").replace(/,/g, "."));
    const fertKgHa = Number(String(formData.get("fert_kg_ha") ?? "0").replace(/\s+/g, "").replace(/,/g, "."));
    const sowingDate = String(formData.get("sowing_date") ?? "");
    if (!ALLOWED_CROPS.includes(crop)) {
      return { ok: false, error: "Выберите культуру (пшеница, ячмень, овёс и т.д.)" };
    }
    if (!Number.isFinite(areaHa) || areaHa <= 0 || areaHa > 100_000) {
      return { ok: false, error: "Площадь поля должна быть от 1 до 100 000 га" };
    }
    if (!Number.isFinite(declaredYield) || declaredYield <= 0 || declaredYield > 200) {
      return { ok: false, error: "Заявленная урожайность должна быть от 0 до 200 ц/га" };
    }
    // Биологический потолок: declared > 1.6× от эталона культуры (без поправок) — фрод-флаг сразу.
    const baseYield = CROP_NORMS[crop].baseYieldCentnersHa;
    if (declaredYield > baseYield * 1.6) {
      return { ok: false, error: `Заявленная урожайность ${declaredYield} ц/га нереалистична для культуры (биологический потолок ≈ ${baseYield} ц/га). Уточните цифры.` };
    }
    if (!Number.isFinite(fertKgHa) || fertKgHa < 0 || fertKgHa > 1000) {
      return { ok: false, error: "Норма внесения удобрений должна быть от 0 до 1000 кг/га" };
    }
    if (!ISO_DATE.test(sowingDate)) {
      return { ok: false, error: "Укажите дату посева в формате YYYY-MM-DD" };
    }
    cropDeclaration = { crop, areaHa, declaredYieldCha: declaredYield, fertilizerKgHa: fertKgHa, declaredSowingDate: sowingDate };
  }

  // Резолвим фермера через session (поддерживает демо + реальных пользователей).
  // Если в форме пришёл farmerId="U-xxxx" (реальный юзер), findFarmer не найдёт
  // его в моке → resolveFarmerSession проверит cookie и вернёт реального юзера.
  // Если форма прислала "F-001" (демо) — вернётся демо-сессия. Без сессии — отказ.
  const session = await resolveFarmerSession(farmerIdRaw || null);
  if (!session) {
    return { ok: false, error: "Сессия не найдена. Войдите в кабинет и попробуйте снова." };
  }

  const app = await addApplication({
    farmerId: session.farmer.id,
    category,
    type: `Субсидия — ${SUBSIDY_CATEGORY_LABEL[category]}`,
    scope,
    amount: Math.round(amount),
    cropDeclaration,
  });

  // Перерисовать страницу, чтобы новая заявка появилась в реестре.
  revalidatePath("/farmer/applications");

  return { ok: true, applicationId: app.id };
}
