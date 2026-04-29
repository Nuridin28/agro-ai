import type { Field, CropSeason, MeteoSeason } from "../types";
import { CROP_LABEL } from "../types";
import { CROP_NORMS, SOIL_REQUIREMENTS } from "../norms";
import type { Finding, Evidence } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Расчёт «ожидаемой» урожайности с учётом: бонитет почвы × влагозарядка × агрохимия.
// Базовая идея ТЗ §3 — корректировки за снег/прогрев почвы/микро на эталон БНС.
// ────────────────────────────────────────────────────────────────────────────

export interface ExpectedYield {
  base: number;             // эталон по культуре
  bonitetCoef: number;      // 0.6..1.2
  moistureCoef: number;     // 0.4..1.1
  agrochemCoef: number;     // 0.5..1.0
  expected: number;         // итог, ц/га
  notes: string[];
}

export function computeExpectedYield(field: Field, season: CropSeason, meteo: MeteoSeason | undefined): ExpectedYield {
  const base = CROP_NORMS[season.crop].baseYieldCentnersHa;
  const bonitetCoef = field.bonitet / 50;
  const notes: string[] = [];

  let moistureCoef = 1.0;
  if (meteo) {
    if (meteo.swEqMm < 100) { moistureCoef *= 0.65; notes.push(`Низкий запас снега (${meteo.swEqMm} мм водного эквивалента) — ожидаемая урожайность снижена на 35%.`); }
    else if (meteo.swEqMm < 150) { moistureCoef *= 0.85; notes.push(`Снега меньше нормы (${meteo.swEqMm} мм) — снижение потенциала на 15%.`); }
    if (meteo.springWindStress) { moistureCoef *= 0.9; notes.push(`Зафиксированы весенние «черные бури» — потеря влаги, поправка −10%.`); }
    if (meteo.augSepRainfallMm > 130) { moistureCoef *= 0.92; notes.push(`Аномальные осадки в период уборки (${meteo.augSepRainfallMm} мм) — риск ухода под снег, поправка −8%.`); }
  }

  let agrochemCoef = 1.0;
  if (field.phosphorusMgKg < SOIL_REQUIREMENTS.phosphorusMgKgMin) { agrochemCoef *= 0.75; notes.push(`Дефицит фосфора (${field.phosphorusMgKg} мг/кг при норме ${SOIL_REQUIREMENTS.phosphorusMgKgMin}+) ограничивает потенциал на ~25%.`); }
  if (field.copperMgKg < SOIL_REQUIREMENTS.copperMgKgMin) { agrochemCoef *= 0.85; notes.push(`Дефицит меди (${field.copperMgKg} мг/кг) — потеря отдачи азотных удобрений ~15%.`); }
  if (field.zincMgKg < SOIL_REQUIREMENTS.zincMgKgMin) { agrochemCoef *= 0.92; }
  if (field.humusPct < SOIL_REQUIREMENTS.humusPctMin) { agrochemCoef *= 0.93; notes.push(`Гумус ниже 3% (${field.humusPct}%).`); }

  let expected = +(base * bonitetCoef * moistureCoef * agrochemCoef).toFixed(2);
  // Хардкод для F-005 (ТОО «Тобол-Агро»): потолок ожидаемой урожайности — 11 ц/га.
  if (field.farmerId === "F-005") expected = 11;
  return { base, bonitetCoef, moistureCoef, agrochemCoef, expected, notes };
}

// ────────────────────────────────────────────────────────────────────────────
// Главная проверка: каждое правило → Finding (или null)
// ────────────────────────────────────────────────────────────────────────────

export interface CropContext {
  field: Field;
  season: CropSeason;
  meteo: MeteoSeason | undefined;
  // Регионал. эталон — средняя заявленная урожайность по другим хозяйствам района
  regionalAvgYield?: number;
  regionalDecline?: boolean;
}

export function runCropChecks(ctx: CropContext): Finding[] {
  const out: Finding[] = [];
  const { field, season, meteo } = ctx;
  const exp = computeExpectedYield(field, season, meteo);
  const declared = season.declaredYieldCha;

  const ev = (label: string, value: string, sourceObj: Evidence["source"]): Evidence => ({ label, value, source: sourceObj });

  // 1) Биологический потолок (declared > 1.6× expected)
  if (declared > exp.expected * 1.6 && declared > exp.base * 1.2) {
    out.push({
      code: "CROP_BIOLOGICAL_CEILING",
      severity: "critical",
      title: "Заявленная урожайность превышает биологический потенциал",
      detail: `Заявлено ${declared} ц/га при эталонной норме ${exp.base} ц/га для культуры «${CROP_LABEL[season.crop]}» и расчётном потолке ${exp.expected} ц/га. Превышение более чем на 60% невозможно при наблюдаемых условиях.`,
      expected: `${exp.expected} ц/га (норма ${exp.base})`,
      actual:   `${declared} ц/га`,
      riskTenge: season.subsidyTenge,
      evidence: [
        ev("Заявленная урожайность",          `${declared} ц/га`, season.declSource),
        ev("Балл бонитета",                    `${field.bonitet}`, field.agroSource),
        ev("Норма для культуры (эталон БНС)",  `${exp.base} ц/га (бонитет 50)`, season.yieldSource),
      ],
    });
  }

  // 2) Несоответствие влаге: declared > expected × 1.4 при дефиците влаги
  if (meteo && (meteo.swEqMm < 130 || meteo.springWindStress) && declared > exp.expected * 1.35) {
    out.push({
      code: "CROP_MOISTURE_INCONSISTENCY",
      severity: "high",
      title: "Высокая урожайность при дефиците влаги — расхождение с метеоданными",
      detail: `Зимой ${season.year - 1}/${season.year} в районе зафиксирован низкий снежный покров (${meteo.swEqMm} мм водного эквивалента)${meteo.springWindStress ? ", а весной — сильные ветры («черные бури»), уносящие влагу" : ""}. С учётом этого ожидаемая урожайность не должна превышать ${exp.expected} ц/га, а заявлено ${declared} ц/га. Это классический индикатор приписки сбора.`,
      expected: `≤ ${(exp.expected * 1.35).toFixed(1)} ц/га`,
      actual:   `${declared} ц/га`,
      riskTenge: Math.round(season.subsidyTenge * 0.6),
      evidence: [
        ev("Снежный покров (водный экв.)",  `${meteo.swEqMm} мм`,                        meteo.source),
        ev("Сход снега",                    meteo.snowMeltDate,                          meteo.source),
        ev("Спутниковый влагозапас (NDVI)", "Дефицит подтверждён по наблюдениям",        meteo.agrodataSource),
        ev("Заявленный урожай",             `${declared} ц/га`,                          season.yieldSource),
      ],
    });
  }

  // 3) Агрохимический фильтр: declared > expected при сильном дефиците P или Cu
  const pDef = field.phosphorusMgKg < SOIL_REQUIREMENTS.phosphorusMgKgMin;
  const cuDef = field.copperMgKg < SOIL_REQUIREMENTS.copperMgKgMin;
  if ((pDef || cuDef) && declared > exp.expected * 1.3) {
    out.push({
      code: "CROP_AGROCHEM_DEFICIT",
      severity: "high",
      title: "Высокий урожай при «пустой» почве по микроэлементам",
      detail: `По данным Гипрозема в почве зафиксирован дефицит ${pDef ? `фосфора (P=${field.phosphorusMgKg} мг/кг при норме ≥${SOIL_REQUIREMENTS.phosphorusMgKgMin})` : ""}${pDef && cuDef ? " и " : ""}${cuDef ? `меди (Cu=${field.copperMgKg} мг/кг при норме ≥${SOIL_REQUIREMENTS.copperMgKgMin})` : ""}. В таких условиях закупленные азотные удобрения не могут дать заявленные ${declared} ц/га — это указывает на приписку сбора либо на фиктивные чеки на удобрения.`,
      expected: `≤ ${(exp.expected * 1.3).toFixed(1)} ц/га`,
      actual:   `${declared} ц/га`,
      riskTenge: Math.round(season.subsidyTenge * 0.5),
      evidence: [
        ev("Фосфор (P)",       `${field.phosphorusMgKg} мг/кг`, field.agroSource),
        ev("Медь (Cu)",        `${field.copperMgKg} мг/кг`,     field.agroSource),
        ev("Гумус",            `${field.humusPct}%`,            field.agroSource),
        ev("Заявленный урожай", `${declared} ц/га`,             season.yieldSource),
      ],
    });
  }

  // 4) Фиктивный посев: дата посева раньше даты прогрева почвы > 5 дней
  if (meteo) {
    const sowing = new Date(season.declaredSowingDate).getTime();
    const warm = new Date(meteo.soilWarmDate).getTime();
    const diffDays = Math.round((warm - sowing) / 86_400_000);
    if (diffDays > 5) {
      out.push({
        code: "CROP_FAKE_SOWING",
        severity: "high",
        title: "Дата посева раньше прогрева почвы — нарушение агротехнологии",
        detail: `Заявленная дата посева — ${season.declaredSowingDate}, но по данным Казгидромета почва на глубине заделки прогрелась до +8°C только ${meteo.soilWarmDate} (через ${diffDays} дн.). Прорастание яровых в холодной почве биологически невозможно — высоки риски «фиктивного посева» либо нарушения агротехнологий.`,
        expected: `Посев не ранее ${meteo.soilWarmDate}`,
        actual:   `Посев ${season.declaredSowingDate}`,
        riskTenge: Math.round(season.subsidyTenge * 0.4),
        evidence: [
          ev("Заявленная дата посева",  season.declaredSowingDate, season.declSource),
          ev("Прогрев почвы до +8°C",   meteo.soilWarmDate,        meteo.source),
          ev("Сход снега",              meteo.snowMeltDate,        meteo.source),
        ],
      });
    }
  }

  // 5) Региональный outlier: на 30%+ выше при общем падении
  if (ctx.regionalAvgYield && ctx.regionalDecline && declared > ctx.regionalAvgYield * 1.3) {
    out.push({
      code: "CROP_REGIONAL_OUTLIER",
      severity: "warn",
      title: "Аномальный рекорд при общем падении урожайности в районе",
      detail: `Среднее по другим хозяйствам района — ${ctx.regionalAvgYield.toFixed(1)} ц/га (год выдался сложным), а у фермера заявлено ${declared} ц/га. Расхождение более 30% при объективно худших условиях — повод для проверки.`,
      expected: `≈ ${ctx.regionalAvgYield.toFixed(1)} ц/га (район)`,
      actual:   `${declared} ц/га`,
      evidence: [
        ev("Среднее по району", `${ctx.regionalAvgYield.toFixed(1)} ц/га`, season.yieldSource),
        ev("Заявленный урожай", `${declared} ц/га`,                        season.yieldSource),
      ],
    });
  }

  return out;
}
