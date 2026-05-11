// ────────────────────────────────────────────────────────────────────────────
// Kd_adv — болезни в advisory режиме (первый сезон работы модели).
//
// В первый сезон Kd_adv ВСЕГДА = 1.0 (не режет урожай). Модель только
// выдаёт risk score по каждой болезни как информационный сигнал и
// рекомендацию фермеру.
//
// После 2+ сезонов scout-валидации можно переключить в "active" режим,
// где Kd_adv будет реально умножать урожай.
//
// Источники моделей риска:
//   - Жёлтая/стеблевая ржавчина: Coakley 1988 + Te Beest 2008 (RH >92%,
//     T 4–16°C для жёлтой; T 18–25°C для стеблевой)
//   - Септориоз: Te Beest et al. 2008 (T 18°C, leaf wetness duration)
//   - Tan spot: Pyrenophora tritici-repentis — частая в Сев. Казахстане
//   - FHB: Hooker-Schaafsma DONcast (RH>90%, T 15–30°C ±7 дн от цветения)
// ────────────────────────────────────────────────────────────────────────────

import type {
  YieldPredictionInput,
  KdResult,
  SortParams,
} from "./types";
import { clamp } from "./types";

export interface DiseaseRiskOptions {
  // Hours within +-anthesis window where RH>90% AND T in 15-30°C (FHB driver).
  fhbCriticalHours?: number;
  // Days during stem elongation with RH>92% AND T in 4-16°C (yellow rust).
  yellowRustDays?: number;
  // Days during stem elongation with RH>70% AND T in 18-25°C (stem rust).
  stemRustDays?: number;
  // Days during vegetative phase with rain + T~18°C (septoria/tan spot).
  septoriaWetDays?: number;
  // Принудительно включить active-mode (для будущего после scout-валидации).
  activeMode?: boolean;
}

interface DiseaseRisk {
  disease: string;
  riskScore: number;     // 0..1
  triggered: boolean;
}

// Логистическая функция риска: при threshold переходит из low в high плавно.
function logisticRisk(daysOrHours: number, threshold: number, steepness = 0.4): number {
  return 1 / (1 + Math.exp(-steepness * (daysOrHours - threshold)));
}

export function computeKdAdvisory(
  input: YieldPredictionInput,
  sort: SortParams,
  opts: DiseaseRiskOptions = {},
): KdResult {
  const reasons: string[] = [];
  const risks: DiseaseRisk[] = [];

  // ─── Жёлтая ржавчина ───
  const yellowRustDays = opts.yellowRustDays ?? 0;
  const yellowRustRiskRaw = logisticRisk(yellowRustDays, 4);  // порог Te Beest: 4+ дн.
  const yellowRustResist = sort.diseaseResistance.yellow_rust ?? 0.50;
  const yellowRustRisk = clamp(yellowRustRiskRaw * (1 - yellowRustResist), 0, 1);
  risks.push({
    disease: "yellow_rust",
    riskScore: +yellowRustRisk.toFixed(2),
    triggered: yellowRustRisk > 0.4,
  });
  if (yellowRustRisk > 0.4) {
    reasons.push(
      `Жёлтая ржавчина: ${yellowRustDays} дн. подходящих условий (RH>92%, T 4–16°C) → риск ${(yellowRustRisk * 100).toFixed(0)}% с учётом устойчивости сорта`,
    );
  }

  // ─── Стеблевая ржавчина ───
  const stemRustDays = opts.stemRustDays ?? 0;
  const stemRustRiskRaw = logisticRisk(stemRustDays, 5);
  const stemRustResist = sort.diseaseResistance.stem_rust ?? 0.50;
  const stemRustRisk = clamp(stemRustRiskRaw * (1 - stemRustResist), 0, 1);
  risks.push({
    disease: "stem_rust",
    riskScore: +stemRustRisk.toFixed(2),
    triggered: stemRustRisk > 0.4,
  });
  if (stemRustRisk > 0.4) {
    reasons.push(`Стеблевая ржавчина: ${stemRustDays} дн. условий → риск ${(stemRustRisk * 100).toFixed(0)}%`);
  }

  // ─── Септориоз / Tan spot ───
  const septoriaDays = opts.septoriaWetDays ?? 0;
  const septoriaRiskRaw = logisticRisk(septoriaDays, 6);
  const septoriaResist = sort.diseaseResistance.septoria ?? 0.55;
  const septoriaRisk = clamp(septoriaRiskRaw * (1 - septoriaResist), 0, 1);
  risks.push({
    disease: "septoria",
    riskScore: +septoriaRisk.toFixed(2),
    triggered: septoriaRisk > 0.4,
  });
  if (septoriaRisk > 0.4) {
    reasons.push(`Септориоз/tan spot: ${septoriaDays} дн. влаги при T~18°C → риск ${(septoriaRisk * 100).toFixed(0)}%`);
  }

  // ─── FHB (фузариоз колоса) ───
  const fhbHours = opts.fhbCriticalHours ?? 0;
  const fhbRiskRaw = logisticRisk(fhbHours, 24, 0.05);  // 24+ часа условий → высокий риск
  const fhbResist = sort.diseaseResistance.fhb ?? 0.55;
  const fhbRisk = clamp(fhbRiskRaw * (1 - fhbResist), 0, 1);
  risks.push({
    disease: "fhb",
    riskScore: +fhbRisk.toFixed(2),
    triggered: fhbRisk > 0.4,
  });
  if (fhbRisk > 0.4) {
    reasons.push(`FHB: ${fhbHours} часов условий в окне цветения → риск ${(fhbRisk * 100).toFixed(0)}%, опасность DON-контаминации`);
  }

  // ─── Финальный коэффициент ───
  // Advisory mode: Kd_adv = 1.0 ВСЕГДА (только сигнал, не штраф)
  // Active mode (будущее): Kd_active = min(1 - risk × susceptibility) по болезням,
  //                        модулируется фунгицидной обработкой (см. spray.ts)
  const mode: "advisory" | "active" = opts.activeMode ? "active" : "advisory";

  let kdValue: number;
  if (mode === "advisory") {
    kdValue = 1.0;
    reasons.push("Режим advisory — Kd не режет урожай в первом сезоне, только сигнал");
  } else {
    // Active: умножаем (1 − риск × максимальная потеря 0.4) по каждой болезни
    const MAX_LOSS_PER_DISEASE = 0.40;
    let acc = 1.0;
    for (const r of risks) {
      acc *= 1 - r.riskScore * MAX_LOSS_PER_DISEASE;
    }
    kdValue = clamp(acc, 0.50, 1.0);
  }

  // Рекомендация фермеру.
  let recommendation: string | undefined;
  const highestRisk = risks.reduce((m, r) => (r.riskScore > m.riskScore ? r : m), risks[0]);
  if (highestRisk && highestRisk.riskScore > 0.5) {
    recommendation = `Высокий риск по «${highestRisk.disease}». Рекомендация: профилактическая фунгицидная обработка в фазу флагового листа.`;
  } else if (highestRisk && highestRisk.riskScore > 0.3) {
    recommendation = `Средний риск по «${highestRisk.disease}». Обратитесь к агроному для оценки состояния поля.`;
  }

  if (reasons.length === 0) {
    reasons.push("Погодные условия не благоприятствуют развитию болезней");
  }

  return {
    value: +kdValue.toFixed(3),
    mode,
    diseaseRisks: risks,
    recommendation,
    confidence: mode === "advisory" ? "high" : "medium",
    sigmaRelative: mode === "advisory" ? 0.0 : 0.15,
    reasons,
  };
}
