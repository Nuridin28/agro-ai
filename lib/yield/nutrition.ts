// ────────────────────────────────────────────────────────────────────────────
// K_nutrition — питательный коэффициент (закон Митчерлиха).
//
// K_element = 1 − exp(−c × (current_level + fert_applied × efficiency) / optimum)
//
// При ratio = 1.0 (на норме) K_element ≈ 0.95 (если c=3). Растёт с насыщением
// при больших дозах удобрений (диминутивная отдача).
//
// Финал: K_nutrition = K_N × K_P × K_K × K_micro
//
// Источник: Mitscherlich 1909, классика агрохимии. Преимущество над Либихом:
// нет резкого «обрыва» — переход плавный, что лучше соответствует биологии.
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  KNutritionResult,
} from "./types";
import { SOIL_OPTIMA } from "./norms";
import { clamp, round3 } from "./types";

function mitscherlichK(currentLevel: number, optimum: number, c: number): number {
  if (optimum <= 0) return 1.0;
  const ratio = currentLevel / optimum;
  // K = 1 − exp(−c × ratio); при ratio=0 → K=0, при ratio=1 → K≈0.95 (c=3)
  return clamp(1 - Math.exp(-c * ratio), 0, 1);
}

export function computeKNutrition(input: YieldPredictionInput): KNutritionResult {
  const { field, declaration } = input;
  const reasons: string[] = [];

  // N
  const effectiveN = (field.nitrogenMgKg ?? SOIL_OPTIMA.N_mgkg) +
    declaration.fertilizerNKgHa * SOIL_OPTIMA.fertilizerEfficiency.N;
  const ratioN = effectiveN / SOIL_OPTIMA.N_mgkg;
  const kN = mitscherlichK(effectiveN, SOIL_OPTIMA.N_mgkg, SOIL_OPTIMA.mitscherlichC.N);

  // P
  const effectiveP = (field.phosphorusMgKg ?? SOIL_OPTIMA.P_mgkg) +
    declaration.fertilizerPKgHa * SOIL_OPTIMA.fertilizerEfficiency.P;
  const ratioP = effectiveP / SOIL_OPTIMA.P_mgkg;
  const kP = mitscherlichK(effectiveP, SOIL_OPTIMA.P_mgkg, SOIL_OPTIMA.mitscherlichC.P);

  // K
  const effectiveK = (field.potassiumMgKg ?? SOIL_OPTIMA.K_mgkg) +
    declaration.fertilizerKKgHa * SOIL_OPTIMA.fertilizerEfficiency.K;
  const ratioK = effectiveK / SOIL_OPTIMA.K_mgkg;
  const kK = mitscherlichK(effectiveK, SOIL_OPTIMA.K_mgkg, SOIL_OPTIMA.mitscherlichC.K);

  // Микроэлементы (Cu, Zn) — обобщаем в один коэффициент.
  const cuRatio = (field.copperMgKg ?? SOIL_OPTIMA.Cu_mgkg) / SOIL_OPTIMA.Cu_mgkg;
  const znRatio = (field.zincMgKg ?? SOIL_OPTIMA.Zn_mgkg) / SOIL_OPTIMA.Zn_mgkg;
  const microRatio = Math.min(cuRatio, znRatio); // лимит по самому дефицитному
  const kMicro = mitscherlichK(
    microRatio * SOIL_OPTIMA.Cu_mgkg, // нормированное «есть/нет дефицит»
    SOIL_OPTIMA.Cu_mgkg,
    SOIL_OPTIMA.mitscherlichC.micro,
  );

  const kNutrition = kN * kP * kK * kMicro;

  reasons.push(
    `N: эффективно ${effectiveN.toFixed(0)} мг/кг (норма ${SOIL_OPTIMA.N_mgkg}, ratio ${ratioN.toFixed(2)}) → K_N = ${kN.toFixed(3)}`,
  );
  reasons.push(
    `P: эффективно ${effectiveP.toFixed(0)} мг/кг (норма ${SOIL_OPTIMA.P_mgkg}, ratio ${ratioP.toFixed(2)}) → K_P = ${kP.toFixed(3)}`,
  );
  reasons.push(
    `K: эффективно ${effectiveK.toFixed(0)} мг/кг (норма ${SOIL_OPTIMA.K_mgkg}, ratio ${ratioK.toFixed(2)}) → K_K = ${kK.toFixed(3)}`,
  );
  reasons.push(
    `Микроэлементы (Cu/Zn): minRatio ${microRatio.toFixed(2)} → K_micro = ${kMicro.toFixed(3)}`,
  );
  reasons.push(`K_nutrition = K_N × K_P × K_K × K_micro = ${kNutrition.toFixed(3)}`);

  // Confidence: high если все данные Гипрозема свежие и фермер задекларировал
  // удобрения. Снижается если что-то отсутствует.
  const hasAllAgrochem = field.nitrogenMgKg != null && field.phosphorusMgKg != null && field.potassiumMgKg != null;
  const declaredFertilizer = declaration.fertilizerNKgHa > 0 || declaration.fertilizerPKgHa > 0 || declaration.fertilizerKKgHa > 0;
  const confidence = hasAllAgrochem && declaredFertilizer ? "high" : hasAllAgrochem ? "medium" : "low";

  return {
    value: round3(kNutrition),
    byElement: [
      { element: "N",     effective: round3(effectiveN), ratio: round3(ratioN),     k: round3(kN) },
      { element: "P",     effective: round3(effectiveP), ratio: round3(ratioP),     k: round3(kP) },
      { element: "K",     effective: round3(effectiveK), ratio: round3(ratioK),     k: round3(kK) },
      { element: "micro", effective: round3(microRatio), ratio: round3(microRatio), k: round3(kMicro) },
    ],
    confidence,
    sigmaRelative: 0.12,
    reasons,
  };
}
