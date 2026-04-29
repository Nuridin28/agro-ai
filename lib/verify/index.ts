import type { Farmer } from "../types";
import type { FarmerVerdict, Finding, Severity } from "./types";
import { runCropChecks, computeExpectedYield } from "./crop";
import { runLivestockChecks } from "./livestock";
import { runSatelliteChecks } from "./satellite";
import { findFarmer, FARMERS } from "../mock/farmers";
import { fieldFor, seasonFor, CROP_SEASONS } from "../mock/crop";
import { meteoFor } from "../mock/meteo";
import { herdFor, pastureFor, bullsFor, saleDeclarationFor } from "../mock/livestock";
import { polygonForFarmer } from "../mock/field-polygons";
import { verifySatellite, checkInactivity } from "../satellite";

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  ok: 0, info: 5, warn: 15, high: 35, critical: 60,
};

export function decisionFromRisk(score: number): "clear" | "review" | "audit" | "recovery" {
  if (score < 15) return "clear";
  if (score < 35) return "review";
  if (score < 65) return "audit";
  return "recovery";
}

function regionalAvg(katoCode: string, year: number, exceptFarmerId: string): { avg?: number; decline?: boolean } {
  // Усреднение заявленных показателей по соседям того же района (без героя)
  const fellow = CROP_SEASONS.filter((cs) => {
    if (cs.farmerId === exceptFarmerId || cs.year !== year) return false;
    const f = findFarmer(cs.farmerId);
    return f?.region.katoCode === katoCode;
  });
  if (fellow.length === 0) return {};
  const avg = fellow.reduce((s, cs) => s + cs.declaredYieldCha, 0) / fellow.length;
  // Признак «общего падения» — если среднее < 0.7 от среднего эталона по культурам в выборке
  const baselineAvg = fellow.reduce((s, cs) => s + (cs.crop === "wheat_spring" ? 14 : 16), 0) / fellow.length;
  const decline = avg < baselineAvg * 0.7;
  return { avg, decline };
}

export function verifyFarmer(farmerId: string): FarmerVerdict {
  const farmer = findFarmer(farmerId);
  if (!farmer) throw new Error(`Farmer ${farmerId} not found`);

  const findings: Finding[] = [];
  const modules: ("crop" | "livestock")[] = [];
  let totalSubsidy = 0;
  let totalRisk = 0;

  // Crop ─────
  const field = fieldFor(farmerId);
  const season = seasonFor(farmerId);
  if (field && season) {
    modules.push("crop");
    const meteo = meteoFor(field.region.katoCode, season.year);
    const { avg, decline } = regionalAvg(field.region.katoCode, season.year, farmerId);
    const cropFindings = runCropChecks({
      field, season, meteo,
      regionalAvgYield: avg, regionalDecline: decline,
    });
    findings.push(...cropFindings);
    totalSubsidy += season.subsidyTenge;
    totalRisk += cropFindings.reduce((s, f) => s + (f.riskTenge ?? 0), 0);
  }

  // Livestock ─────
  const herd = herdFor(farmerId);
  if (herd) {
    modules.push("livestock");
    const pasture = pastureFor(farmerId);
    const bulls = bullsFor(farmerId);
    const meteo = pasture ? meteoFor(pasture.region.katoCode, herd.year) : undefined;
    const sale = saleDeclarationFor(farmerId, herd.year);
    const livestockFindings = runLivestockChecks({
      herd, pasture, bulls, meteo,
      saleDeclaredKg: sale?.declaredWeightKg,
      saleSubsidyTenge: herd.subsidyTenge,
    });
    findings.push(...livestockFindings);
    totalSubsidy += herd.subsidyTenge;
    totalRisk += livestockFindings.reduce((s, f) => s + (f.riskTenge ?? 0), 0);
  }

  // Risk score ─────
  const riskAcc = findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
  const riskScore = Math.min(100, riskAcc);

  // Efficiency = насколько субсидии конвертируются в результат: чем больше риска и риск-тенге — тем ниже
  let efficiency = 100;
  if (totalSubsidy > 0) {
    const riskShare = totalRisk / totalSubsidy;
    efficiency = Math.max(0, Math.round(100 * (1 - riskShare * 0.9) - riskAcc * 0.3));
  }

  return {
    farmerId,
    efficiencyScore: efficiency,
    riskScore,
    decision: decisionFromRisk(riskScore),
    findings,
    totalSubsidyTenge: totalSubsidy,
    totalRiskTenge: totalRisk,
    modules,
  };
}

export function verifyAll(): Record<string, FarmerVerdict> {
  return Object.fromEntries(FARMERS.map((f) => [f.id, verifyFarmer(f.id)]));
}

// Async-вариант: тот же verdict, плюс спутниковые проверки (NDVI + inactivity).
// Не заменяет verifyFarmer (тот sync и используется в server-компонентах
// без await), а вызывается из API-роутов /api/satellite/*.
export async function verifyFarmerWithSatellite(farmerId: string): Promise<FarmerVerdict> {
  const base = verifyFarmer(farmerId);
  const field = fieldFor(farmerId);
  const season = seasonFor(farmerId);
  const polyRec = polygonForFarmer(farmerId);
  if (!field || !season || !polyRec) return base;

  // Окно сезона: от 1 апреля до 30 сентября года заявки.
  const startDate = `${season.year}-04-01`;
  const endDate   = `${season.year}-09-30`;
  const baselineDate = season.declaredSowingDate;

  const [spatial, inactivity] = await Promise.all([
    verifySatellite({
      polygon: polyRec.polygon,
      startDate, endDate,
      expectedSowingDate: season.declaredSowingDate,
      includeImages: true,
      includeYoY: true,
    }).catch((e) => { console.warn("[verify] satellite spatial failed", e); return null; }),
    checkInactivity({
      polygon: polyRec.polygon,
      baselineDate,
      windowDays: 45,
    }).catch((e) => { console.warn("[verify] satellite inactivity failed", e); return null; }),
  ]);

  const satFindings = runSatelliteChecks({ field, season, spatial, inactivity });
  if (satFindings.length === 0) return base;

  const findings = [...base.findings, ...satFindings];
  const totalRiskTenge = base.totalRiskTenge + satFindings.reduce((s, f) => s + (f.riskTenge ?? 0), 0);
  const riskAcc = findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
  const riskScore = Math.min(100, riskAcc);
  let efficiencyScore = 100;
  if (base.totalSubsidyTenge > 0) {
    const riskShare = totalRiskTenge / base.totalSubsidyTenge;
    efficiencyScore = Math.max(0, Math.round(100 * (1 - riskShare * 0.9) - riskAcc * 0.3));
  }

  return {
    ...base,
    findings,
    totalRiskTenge,
    riskScore,
    decision: decisionFromRisk(riskScore),
    efficiencyScore,
  };
}

// Re-exports
export { computeExpectedYield };
export type { Farmer };
