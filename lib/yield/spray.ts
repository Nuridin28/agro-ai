// ────────────────────────────────────────────────────────────────────────────
// K_spray — гербицидная обработка (защита от сорняков).
//
// КРИТИЧЕСКАЯ ПРАВКА (из анализа):
//   K_spray НЕ детектируется со спутника. На большинстве культур NDVI-сигнал
//   гербицида либо отсутствует, либо ниже шума. Источник истины =
//   декларация фермера + чек Qoldau. Спутник — только weak signal для
//   подсолнечника/рапса.
//
// Логика:
//   K_spray = 1.00 если декларация + Qoldau подтверждают + дата в окне фенологии
//   K_spray = 0.95 если только декларация ИЛИ только чек
//   K_spray = 0.85 если ничего (т.е. обработка не была проведена)
//
// Фенологическое окно:
//   - Зерновые: гербицид в фазу кущения (21–35 дн от посева)
//   - Подсолнечник: 2–4 настоящих листа (~25–40 дн)
//   - Рапс: розетка 4–6 листьев (~28–42 дн)
//
// Фунгицид НЕ режет урожай через K_spray. Он модулирует Kd (см. disease.ts)
// в active-режиме (после scout-валидации). В первом сезоне фунгицид — только
// info-факт в provenance.
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  KSprayResult,
} from "./types";
import type { Crop } from "../types";

const HERBICIDE_WINDOW_DAYS: Record<Crop, [number, number]> = {
  wheat_spring: [21, 35],
  wheat_winter: [21, 45],
  barley:       [18, 30],
  oats:         [20, 32],
  sunflower:    [25, 40],
  rapeseed:     [28, 42],
};

const K_HERBICIDE_FULL = 1.00;
const K_HERBICIDE_PARTIAL = 0.95;
const K_HERBICIDE_MISSING = 0.85;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

export function computeKSpray(input: YieldPredictionInput): KSprayResult {
  const { declaration, season } = input;
  const herb = declaration.herbicideApplied;
  const reasons: string[] = [];

  let status: "confirmed" | "partial" | "missing";
  let value: number;
  let reasoning: string;

  if (!herb.declared && !herb.qoldauVerified) {
    status = "missing";
    value = K_HERBICIDE_MISSING;
    reasoning = "Гербицидная обработка не задекларирована и не подтверждена чеком Qoldau — считаем, что не проводилась.";
    reasons.push(`K_spray = ${value} (обработка не подтверждена)`);
  } else if (herb.declared && herb.qoldauVerified && herb.date) {
    // Проверяем фенологическое окно.
    const phenologyWindow = HERBICIDE_WINDOW_DAYS[season.crop];
    const daysFromSowing = daysBetween(declaration.sowingDate, herb.date);
    const inWindow = daysFromSowing >= phenologyWindow[0] && daysFromSowing <= phenologyWindow[1];

    if (inWindow) {
      status = "confirmed";
      value = K_HERBICIDE_FULL;
      reasoning = `Декларация + чек Qoldau подтверждают. Дата ${herb.date} (${daysFromSowing} дн от посева) попадает в фенологическое окно ${phenologyWindow[0]}–${phenologyWindow[1]} дн.`;
      reasons.push(`K_spray = ${value} (обработка подтверждена)`);
    } else {
      status = "partial";
      value = K_HERBICIDE_PARTIAL;
      reasoning = `Декларация + чек есть, но дата ${herb.date} (${daysFromSowing} дн от посева) вне окна ${phenologyWindow[0]}–${phenologyWindow[1]} дн. Эффективность могла быть снижена.`;
      reasons.push(`K_spray = ${value} (дата обработки сомнительная)`);
    }
  } else {
    // Одно из двух: декларация без чека или чек без декларации.
    status = "partial";
    value = K_HERBICIDE_PARTIAL;
    reasoning = herb.declared
      ? "Декларация есть, но чек Qoldau не найден. Возможно, обработка проводилась химией с другого источника."
      : "Чек Qoldau найден, но фермер не задекларировал обработку в заявке — несоответствие.";
    reasons.push(`K_spray = ${value} (частичное подтверждение)`);
  }

  // Информационный факт о фунгициде (не влияет на K_spray).
  const fung = declaration.fungicideApplied;
  if (fung.declared || fung.qoldauVerified) {
    reasons.push(
      `Фунгицидная обработка задекларирована (${fung.declared ? "да" : "нет"}, чек: ${fung.qoldauVerified ? "да" : "нет"}). Влияет на Kd в active-режиме (см. disease.ts).`,
    );
  }

  return {
    value,
    herbicide: { status, reasoning },
    confidence: "high",         // источник — декларация, не наш расчёт
    sigmaRelative: 0.03,
    reasons,
  };
}
