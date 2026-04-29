// ────────────────────────────────────────────────────────────────────────────
// Оценка ожидаемого урожая по данным агрохимобследования (только то, что
// возвращает Гипрозем: n, p, k, gum, ph). Бонитет получаем как функцию от гумуса.
//
// Модель — закон минимума Либиха: реализованный потенциал ограничен «самым
// дефицитным» элементом. Базовая урожайность из норм БНС/КазНИИЗиР, поправка
// на бонитет почвы, дальше умножение на минимальный коэффициент.
// ────────────────────────────────────────────────────────────────────────────

import { CROP_NORMS } from "./norms";
import type { Crop } from "./types";

export interface AgroAttrs {
  n: number | null;
  p: number | null;
  k: number | null;
  gum: number | null;
  ph: number | null;
}

export interface YieldEstimate {
  crop: Crop;
  base: number;          // эталон БНС, ц/га (бонитет 50, нет лимитов)
  bonitetEst: number;    // оценочный балл бонитета по гумусу
  bonitetCoef: number;   // bonitetEst / 50
  factors: Factor[];     // все рассмотренные факторы
  limiting: Factor;      // лимитирующий (по Либиху)
  expected: number;      // итог, ц/га
  expectedHaTotal?: number; // тонн со всего участка, если передана площадь
}

interface Factor {
  name: string;
  value: string;       // как отображать в таблице (например, "P=12 мг/кг")
  coef: number;        // 0..1
  status: "ok" | "warn" | "crit";
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Эмпирическая зависимость: гумус 1.5% ≈ 42 балла, 3% ≈ 54, 4% ≈ 62.
function bonitetFromHumus(gum: number | null): number {
  if (gum == null) return 50;
  return clamp(30 + gum * 8, 25, 75);
}

function fp(p: number | null): Factor {
  if (p == null) return { name: "P", value: "—", coef: 0.85, status: "warn" };
  if (p < 8)  return { name: "P", value: `${p.toFixed(1)} (острый дефицит)`, coef: 0.55, status: "crit" };
  if (p < 15) return { name: "P", value: `${p.toFixed(1)} (дефицит)`,        coef: 0.78, status: "warn" };
  if (p < 25) return { name: "P", value: `${p.toFixed(1)} (норма)`,          coef: 0.95, status: "ok"   };
  return        { name: "P", value: `${p.toFixed(1)} (оптимум)`,             coef: 1.0,  status: "ok"   };
}
function fgum(gum: number | null): Factor {
  if (gum == null) return { name: "Гумус", value: "—", coef: 0.85, status: "warn" };
  if (gum < 2)   return { name: "Гумус", value: `${gum.toFixed(2)}% (бедная почва)`, coef: 0.75, status: "crit" };
  if (gum < 3)   return { name: "Гумус", value: `${gum.toFixed(2)}% (низкий)`,       coef: 0.90, status: "warn" };
  if (gum < 4)   return { name: "Гумус", value: `${gum.toFixed(2)}% (средний)`,      coef: 0.97, status: "ok"   };
  return           { name: "Гумус", value: `${gum.toFixed(2)}% (мощный)`,            coef: 1.0,  status: "ok"   };
}
function fph(ph: number | null): Factor {
  if (ph == null) return { name: "pH", value: "—", coef: 0.95, status: "warn" };
  if (ph < 5.5)  return { name: "pH", value: `${ph.toFixed(2)} (кислая)`,    coef: 0.85, status: "warn" };
  if (ph > 8.2)  return { name: "pH", value: `${ph.toFixed(2)} (щелочная)`,  coef: 0.85, status: "warn" };
  if (ph < 6 || ph > 7.8) return { name: "pH", value: `${ph.toFixed(2)} (на границе)`, coef: 0.95, status: "ok" };
  return           { name: "pH", value: `${ph.toFixed(2)} (норма)`,            coef: 1.0, status: "ok" };
}
function fk(k: number | null): Factor {
  if (k == null) return { name: "K", value: "—", coef: 0.95, status: "warn" };
  if (k < 80)   return { name: "K", value: `${k.toFixed(0)} (низкий)`, coef: 0.88, status: "warn" };
  if (k < 150)  return { name: "K", value: `${k.toFixed(0)} (норма)`,  coef: 0.97, status: "ok"   };
  return         { name: "K", value: `${k.toFixed(0)} (высокий)`,       coef: 1.0,  status: "ok"   };
}
function fn(n: number | null): Factor {
  if (n == null) return { name: "N", value: "—", coef: 0.95, status: "warn" };
  if (n < 60)   return { name: "N", value: `${n.toFixed(1)} (низкий)`, coef: 0.90, status: "warn" };
  if (n < 90)   return { name: "N", value: `${n.toFixed(1)} (средний)`, coef: 0.97, status: "ok"   };
  return         { name: "N", value: `${n.toFixed(1)} (хороший)`,        coef: 1.0,  status: "ok"   };
}

export function estimateYield(attrs: AgroAttrs, crop: Crop = "wheat_spring", areaHa?: number): YieldEstimate {
  const base = CROP_NORMS[crop].baseYieldCentnersHa;
  const bonitetEst = bonitetFromHumus(attrs.gum);
  const bonitetCoef = bonitetEst / 50;

  const factors: Factor[] = [
    fp(attrs.p),
    fgum(attrs.gum),
    fph(attrs.ph),
    fk(attrs.k),
    fn(attrs.n),
  ];
  // Liebig — лимит даёт самый дефицитный элемент
  const limiting = factors.reduce((m, f) => (f.coef < m.coef ? f : m), factors[0]);

  const expected = round1(base * bonitetCoef * limiting.coef);
  const expectedHaTotal = areaHa != null ? round1(expected * areaHa / 10) : undefined; // ц/га × га → центнеры; /10 = тонн

  return { crop, base, bonitetEst, bonitetCoef, factors, limiting, expected, expectedHaTotal };
}
