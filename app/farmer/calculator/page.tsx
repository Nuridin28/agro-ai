// Калькулятор STEPPE-Y — server-обёртка: резолвит сессию (демо или реальный
// пользователь), готовит prefill для клиентской формы. Сама форма (с
// useState/useMemo для пересчёта) и вызов predictYield() в [CalculatorClient.tsx].

import { redirect } from "next/navigation";
import { resolveFarmerSession } from "@/lib/farmer-context";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { meteoFor } from "@/lib/mock/meteo";
import type { Field } from "@/lib/types";
import type { SourceRef } from "@/lib/sources";
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

const placeholderSource: SourceRef = {
  source: "GIPROZEM",
  docId: "calculator-placeholder",
  fetchedAt: new Date().toISOString(),
  note: "Конструктивный плейсхолдер для калькулятора",
};

function prefillFromMock(farmerId: string): CalculatorPrefill {
  const field = fieldFor(farmerId);
  const season = seasonFor(farmerId);
  const meteo = field ? meteoFor(field.region.katoCode, season?.year ?? 2025) : undefined;
  if (!field) {
    return { hasFieldData: false };
  }
  return {
    hasFieldData: true,
    field,
    crop: season?.crop ?? "wheat_spring",
    year: season?.year ?? 2025,
    fertilizerKgHa: season?.fertilizerKgHa ?? 50,
    weatherOverrides: meteo
      ? {
          swEqMm: meteo.swEqMm,
          // springWindStress → 1 день ветра > 17 м/с (грубое сопоставление)
          daysWindOver17: meteo.springWindStress ? 1 : 0,
          soilWarmDate: meteo.soilWarmDate,
        }
      : undefined,
  };
}

function prefillFromUser(user: import("@/lib/users-store").User): CalculatorPrefill {
  // Берём первый привязанный участок Гипрозема. Атрибуты — n/p/k/gum/ph
  // из ArcGIS-ответа. Площадь из `s` (га); если нет — 100.
  const f = user.fields[0];
  if (!f) return { hasFieldData: false };
  const a = f.sample;

  // Конструируем полноценный Field из user.fields[0].
  // Бонитет точно не возвращается из Гипрозема; ставим 50 как «средний» —
  // фермер может скорректировать. Cu/Zn недоступны — используем норму.
  const field: Field = {
    id: `user-field-${user.id}-0`,
    farmerId: user.id,
    cadastralNumber: f.nazvxoz ?? "—",
    areaHa: a.s ?? 100,
    bonitet: 50,
    humusPct: a.gum ?? 3.0,
    nitrogenMgKg: a.n ?? 100,
    phosphorusMgKg: a.p ?? 15,
    potassiumMgKg: a.k ?? 100,
    copperMgKg: 0.25,
    zincMgKg: 0.6,
    region: { oblast: f.oblastCode ?? "—", rayon: "—", katoCode: "—" },
    source: placeholderSource,
    agroSource: placeholderSource,
  };

  return {
    hasFieldData: true,
    field,
    crop: "wheat_spring",
    year: new Date().getUTCFullYear(),
    fertilizerKgHa: 50,
    // Метео — пока без подкачки, клиент использует дефолты Сев. КЗ.
    weatherOverrides: undefined,
  };
}
