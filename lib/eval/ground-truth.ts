import type { CheckCode } from "../verify/types";

export type Decision = "clear" | "review" | "audit" | "recovery";

export interface GroundTruth {
  farmerId: string;
  hasFraud: boolean;
  expectedDecision: Decision;
  expectedCodes: CheckCode[];
  notes: string;
}

// Размеченные кейсы взяты из комментариев в lib/mock/* (crop.ts, livestock.ts).
// Они являются эталоном инспектора для оценки экспертной системы.
export const GROUND_TRUTH: GroundTruth[] = [
  // Crop
  { farmerId: "F-001", hasFraud: false, expectedDecision: "clear",  expectedCodes: [],                          notes: "Норма, хорошая земля" },
  { farmerId: "F-002", hasFraud: false, expectedDecision: "clear",  expectedCodes: [],                          notes: "Низкий урожай объясним низким бонитетом" },
  { farmerId: "F-003", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["CROP_MOISTURE_INCONSISTENCY"], notes: "Высокий урожай при малоснежной зиме" },
  { farmerId: "F-004", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["CROP_FAKE_SOWING"],         notes: "Посев в холодную почву" },
  { farmerId: "F-005", hasFraud: true,  expectedDecision: "recovery", expectedCodes: ["CROP_AGROCHEM_DEFICIT", "CROP_MOISTURE_INCONSISTENCY"], notes: "Дефицит P/Cu + влаги при заявке 16 ц/га" },
  { farmerId: "F-006", hasFraud: false, expectedDecision: "clear",  expectedCodes: [],                          notes: "Средний фермер, норма" },
  // Livestock
  { farmerId: "F-007", hasFraud: false, expectedDecision: "clear",  expectedCodes: [],                          notes: "Аулиекольская, чисто" },
  { farmerId: "F-008", hasFraud: false, expectedDecision: "clear",  expectedCodes: [],                          notes: "Ангус-эталон, чисто" },
  { farmerId: "F-009", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["LIV_ADG_OVER_CEILING"],     notes: "Привес 2.8 кг/сут — выше биологического" },
  { farmerId: "F-010", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["LIV_BULL_REPRO_GAP"],       notes: "Куплены быки, приплода 43/100" },
  { farmerId: "F-011", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["LIV_PASTURE_OVERLOAD"],     notes: "187 голов на пастбище ~45" },
  { farmerId: "F-012", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["LIV_VET_GAP"],              notes: "Вакцинация 35%" },
  { farmerId: "F-013", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["LIV_WINTER_FEED_GAP"],      notes: "Зима −42, нулевой падёж, мизер кормов" },
  { farmerId: "F-014", hasFraud: true,  expectedDecision: "audit",  expectedCodes: ["LIV_SALE_WEIGHT_FRAUD"],    notes: "Заявка 540 кг при ИСЖ 450 кг" },
];

export function gtFor(farmerId: string): GroundTruth | undefined {
  return GROUND_TRUTH.find((g) => g.farmerId === farmerId);
}
