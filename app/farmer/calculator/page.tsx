// Калькулятор субсидий — server-обёртка: резолвит сессию (демо или реальный
// пользователь), готовит prefill для клиентской формы. Сама форма (с
// useState/useMemo для пересчёта) осталась в [CalculatorClient.tsx].

import { redirect } from "next/navigation";
import { resolveFarmerSession } from "@/lib/farmer-context";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { meteoFor } from "@/lib/mock/meteo";
import { CalculatorClient, type CalculatorPrefill } from "./CalculatorClient";

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const session = await resolveFarmerSession(as);
  if (!session) redirect("/login");

  const isReal = session.kind === "real";
  const farmer = session.farmer;

  const prefill = isReal ? prefillFromUser(session.user) : prefillFromMock(farmer.id);

  return (
    <CalculatorClient
      farmerId={farmer.id}
      farmerName={farmer.legalName}
      isReal={isReal}
      prefill={prefill}
    />
  );
}

function prefillFromMock(farmerId: string): CalculatorPrefill {
  const field = fieldFor(farmerId);
  const season = seasonFor(farmerId);
  const meteo = field ? meteoFor(field.region.katoCode, season?.year ?? 2024) : undefined;
  if (!field) {
    return { hasFieldData: false };
  }
  return {
    hasFieldData: true,
    fieldCadastralNumber: field.cadastralNumber,
    fieldAreaHa: field.areaHa,
    fieldBonitet: field.bonitet,
    soil: {
      humusPct: field.humusPct,
      n: field.nitrogenMgKg,
      p: field.phosphorusMgKg,
      k: field.potassiumMgKg,
    },
    crop: season?.crop ?? "wheat_spring",
    fertilizerKgHa: season?.fertilizerKgHa ?? 50,
    meteo: meteo
      ? { swEqMm: meteo.swEqMm, springWindStress: meteo.springWindStress }
      : undefined,
  };
}

function prefillFromUser(user: import("@/lib/users-store").User): CalculatorPrefill {
  // Берём первый привязанный участок Гипрозема. Атрибуты — n/p/k/gum/ph
  // из ArcGIS-ответа. Площадь из `s` (га); если нет — оставляем 100.
  const f = user.fields[0];
  if (!f) return { hasFieldData: false };
  const a = f.sample;
  // Бонитет точно не возвращается из этого слоя Гипрозема; ставим 50 как
  // нейтральный «средний» — пользователь может скорректировать вручную.
  return {
    hasFieldData: true,
    fieldCadastralNumber: f.nazvxoz,
    fieldAreaHa: a.s ?? 100,
    fieldBonitet: 50,
    soil: {
      humusPct: a.gum ?? 3.0,
      n: a.n ?? 100,
      p: a.p ?? 15,
      k: a.k ?? 100,
    },
    crop: "wheat_spring",
    fertilizerKgHa: 50,
    meteo: undefined, // для реального пользователя метео можно подтянуть отдельно через /api/meteo
  };
}
