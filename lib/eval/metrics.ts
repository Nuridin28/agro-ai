import { verifyFarmer } from "../verify";
import type { CheckCode, FarmerVerdict } from "../verify/types";
import { GROUND_TRUTH, type Decision, type GroundTruth } from "./ground-truth";

const DECISIONS: Decision[] = ["clear", "review", "audit", "recovery"];

export interface BinaryMetrics {
  tp: number; fp: number; fn: number; tn: number;
  precision: number; recall: number; f1: number; accuracy: number;
  total: number;
}

export interface PerCaseRow {
  farmerId: string;
  expected: Decision;
  predicted: Decision;
  expectedFraud: boolean;
  predictedFraud: boolean;
  match: boolean;
  riskScore: number;
  efficiencyScore: number;
  firedCodes: CheckCode[];
  expectedCodes: CheckCode[];
  notes: string;
}

export interface RuleStats {
  code: CheckCode;
  expectedFires: number;  // GT positives for this rule
  actualFires: number;    // model fired
  truePositive: number;   // fired AND in GT
  falsePositive: number;  // fired but NOT in GT
  falseNegative: number;  // in GT but didn't fire
  precision: number;
  recall: number;
  f1: number;
}

export interface ConfusionMatrix {
  // rows = expected, cols = predicted
  matrix: Record<Decision, Record<Decision, number>>;
  total: number;
}

function safeDiv(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function f1(p: number, r: number): number {
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

// Бинарная задача: «есть ли фрод?»
// Положительный класс = decision ∈ {audit, recovery}
function isFraudPrediction(d: Decision): boolean {
  return d === "audit" || d === "recovery";
}

export function computeMetrics() {
  const cases: PerCaseRow[] = GROUND_TRUTH.map((gt) => {
    const verdict = verifyFarmer(gt.farmerId);
    const firedCodes = verdict.findings.map((f) => f.code);
    const predictedFraud = isFraudPrediction(verdict.decision);
    return {
      farmerId: gt.farmerId,
      expected: gt.expectedDecision,
      predicted: verdict.decision,
      expectedFraud: gt.hasFraud,
      predictedFraud,
      match: verdict.decision === gt.expectedDecision,
      riskScore: verdict.riskScore,
      efficiencyScore: verdict.efficiencyScore,
      firedCodes,
      expectedCodes: gt.expectedCodes,
      notes: gt.notes,
    };
  });

  // ── Бинарные метрики (фрод / не фрод) ──
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const c of cases) {
    if (c.expectedFraud && c.predictedFraud) tp++;
    else if (!c.expectedFraud && c.predictedFraud) fp++;
    else if (c.expectedFraud && !c.predictedFraud) fn++;
    else tn++;
  }
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const binary: BinaryMetrics = {
    tp, fp, fn, tn,
    precision, recall, f1: f1(precision, recall),
    accuracy: safeDiv(tp + tn, cases.length),
    total: cases.length,
  };

  // ── Confusion matrix 4×4 (decision) ──
  const matrix: Record<Decision, Record<Decision, number>> = {
    clear:    { clear: 0, review: 0, audit: 0, recovery: 0 },
    review:   { clear: 0, review: 0, audit: 0, recovery: 0 },
    audit:    { clear: 0, review: 0, audit: 0, recovery: 0 },
    recovery: { clear: 0, review: 0, audit: 0, recovery: 0 },
  };
  for (const c of cases) matrix[c.expected][c.predicted]++;
  const cm: ConfusionMatrix = { matrix, total: cases.length };

  // ── Macro precision/recall/F1 по 4 классам ──
  const perClass = DECISIONS.map((cls) => {
    const tp = matrix[cls][cls];
    const fp = DECISIONS.reduce((s, e) => s + (e === cls ? 0 : matrix[e][cls]), 0);
    const fn = DECISIONS.reduce((s, p) => s + (p === cls ? 0 : matrix[cls][p]), 0);
    const p = safeDiv(tp, tp + fp);
    const r = safeDiv(tp, tp + fn);
    return { class: cls, tp, fp, fn, precision: p, recall: r, f1: f1(p, r) };
  });
  const macro = {
    precision: perClass.reduce((s, x) => s + x.precision, 0) / perClass.length,
    recall: perClass.reduce((s, x) => s + x.recall, 0) / perClass.length,
    f1: perClass.reduce((s, x) => s + x.f1, 0) / perClass.length,
  };
  const accuracy = cases.filter((c) => c.match).length / cases.length;

  // ── Метрики по конкретным правилам ──
  const allCodes = new Set<CheckCode>();
  for (const c of cases) {
    c.firedCodes.forEach((x) => allCodes.add(x));
    c.expectedCodes.forEach((x) => allCodes.add(x));
  }
  const ruleStats: RuleStats[] = [...allCodes].map((code) => {
    let tp = 0, fp = 0, fn = 0;
    let expectedFires = 0, actualFires = 0;
    for (const c of cases) {
      const inGT = c.expectedCodes.includes(code);
      const fired = c.firedCodes.includes(code);
      if (inGT) expectedFires++;
      if (fired) actualFires++;
      if (inGT && fired) tp++;
      else if (!inGT && fired) fp++;
      else if (inGT && !fired) fn++;
    }
    const p = safeDiv(tp, tp + fp);
    const r = safeDiv(tp, tp + fn);
    return { code, expectedFires, actualFires, truePositive: tp, falsePositive: fp, falseNegative: fn, precision: p, recall: r, f1: f1(p, r) };
  }).sort((a, b) => b.expectedFires - a.expectedFires || a.code.localeCompare(b.code));

  // ── Финансовая аккуратность ──
  const totalSubsidy = cases.reduce((s, c) => {
    const v: FarmerVerdict = verifyFarmer(c.farmerId);
    return s + v.totalSubsidyTenge;
  }, 0);
  const totalRiskTenge = cases.reduce((s, c) => {
    const v = verifyFarmer(c.farmerId);
    return s + v.totalRiskTenge;
  }, 0);

  return {
    cases,
    binary,
    confusion: cm,
    perClass,
    macro,
    accuracy,
    ruleStats,
    totals: { totalSubsidy, totalRiskTenge, riskShare: safeDiv(totalRiskTenge, totalSubsidy) },
  };
}
