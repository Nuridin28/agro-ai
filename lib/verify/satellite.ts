// Превращает результаты модуля satellite/* в Findings движка верификации.
//
// На вход — результат spatial-проверки (NDVI features + риск-флаг по ТЗ)
// и/или результат inactivity-check. На выходе — Findings, которые попадают
// в общий риск-скор фермера и в карточки в инспекторе.

import type { CropSeason, Field } from "../types";
import type { Finding, Evidence } from "./types";
import type { SatelliteVerification, InactivityCheckResult } from "../satellite/types";
import { CROP_LABEL } from "../types";
import { SAT_THRESHOLDS } from "../satellite/ndvi";

function ev(label: string, value: string, sourceObj: Evidence["source"]): Evidence {
  return { label, value, source: sourceObj };
}

export interface SatelliteContext {
  field: Field;
  season: CropSeason;
  spatial?: SatelliteVerification | null;
  inactivity?: InactivityCheckResult | null;
}

export function runSatelliteChecks(ctx: SatelliteContext): Finding[] {
  const out: Finding[] = [];
  const { field, season, spatial, inactivity } = ctx;

  if (spatial && spatial.status === "OK" && spatial.features) {
    const f = spatial.features;
    const sat = spatial.source;

    if (!f.vegetationPresent) {
      out.push({
        code: "CROP_NO_VEGETATION",
        severity: "critical",
        title: "Посев не подтверждается спутниковыми снимками",
        detail: `За окно ${spatial.window.startDate} → ${spatial.window.endDate} максимум NDVI составил ${f.ndviMax} (порог наличия вегетации — 0.30). По полю «${CROP_LABEL[season.crop]}» (${field.cadastralNumber}) фактических признаков посева нет — высокий риск получения субсидии при отсутствии работ.`,
        expected: "NDVI max ≥ 0.30 в сезон вегетации",
        actual:   `NDVI max ${f.ndviMax}, mean ${f.ndviMean}`,
        riskTenge: season.subsidyTenge,
        evidence: [
          ev("NDVI max",                 `${f.ndviMax}`, sat),
          ev("NDVI mean",                `${f.ndviMean}`, sat),
          ev("Использовано наблюдений",  `${f.pointsUsed} (отброшено ${f.pointsDropped})`, sat),
          ev("Заявленный посев",         season.declaredSowingDate, season.declSource),
        ],
      });
    } else if (f.ndviMax < 0.40) {
      out.push({
        code: "CROP_WEAK_VEGETATION",
        severity: "warn",
        title: "Слабая вегетация на спутниковых снимках",
        detail: `Пик NDVI (${f.ndviMax}) ниже норматива для зерновых. Возможные причины: нарушение агротехнологий, недосев, недостаточное использование удобрений, на которые получена субсидия.`,
        expected: "NDVI max ≥ 0.55 (медиана для пшеницы)",
        actual:   `NDVI max ${f.ndviMax}`,
        riskTenge: Math.round(season.subsidyTenge * 0.3),
        evidence: [
          ev("NDVI max",  `${f.ndviMax}`, sat),
          ev("Удобрения, кг/га",  `${season.fertilizerKgHa}`, season.declSource),
        ],
      });
    }

    // Гетерогенность поля: высокая σ NDVI = мозаичная пашня. Это не всегда
    // фрод (могут быть лесополосы по краям), но повышает вероятность
    // частичного посева. Помечаем info-severity при слабой вегетации, иначе warn.
    if (f.heterogeneityStdev !== null && f.heterogeneityStdev >= SAT_THRESHOLDS.HETEROGENEITY_HIGH_STDEV) {
      const severity = f.ndviMax < 0.4 ? "warn" : "info";
      out.push({
        code: "CROP_HETEROGENEOUS_FIELD",
        severity,
        title: "Поле визуально неоднородное по NDVI",
        detail: `Средняя пространственная σ NDVI по полю — ${f.heterogeneityStdev} (порог однородности ${SAT_THRESHOLDS.HETEROGENEITY_HIGH_STDEV}). Возможные причины: засеяна не вся площадь, заброшенные участки, непаханые края. Это снижает доверие к среднему по полю NDVI и фактическим объёмам субсидируемых работ.`,
        expected: `σ ≤ ${SAT_THRESHOLDS.HETEROGENEITY_HIGH_STDEV}`,
        actual:   `σ = ${f.heterogeneityStdev}`,
        riskTenge: severity === "warn" ? Math.round(season.subsidyTenge * 0.2) : 0,
        evidence: [
          ev("Пространственная σ NDVI", `${f.heterogeneityStdev}`, sat),
          ev("NDVI max",                 `${f.ndviMax}`, sat),
          ev("Заявленная площадь",       `${field.areaHa} га`, field.source),
        ],
      });
    }

    // Скорость прироста NDVI/день: при субсидии на удобрения мы ждём
    // активного зелёного набора. Если рост слабый — удобрения «не сработали».
    if (f.growthRateNdviPerDay !== null && f.growthRateNdviPerDay < SAT_THRESHOLDS.GROWTH_RATE_LOW && f.vegetationPresent) {
      out.push({
        code: "CROP_SLOW_GROWTH",
        severity: "warn",
        title: "Низкая скорость прироста NDVI при субсидии на удобрения",
        detail: `Максимальная скорость прироста NDVI составила ${f.growthRateNdviPerDay}/день при норме ${SAT_THRESHOLDS.GROWTH_RATE_LOW}+/день для зерновых. На фоне закупленных ${season.fertilizerKgHa} кг/га удобрений ожидался более активный набор зелёной массы. Возможны: неэффективное внесение, фиктивная закупка, агротехнические нарушения.`,
        expected: `≥ ${SAT_THRESHOLDS.GROWTH_RATE_LOW}/день`,
        actual:   `${f.growthRateNdviPerDay}/день`,
        riskTenge: Math.round(season.subsidyTenge * 0.25),
        evidence: [
          ev("Скорость прироста NDVI", `${f.growthRateNdviPerDay}/день`, sat),
          ev("Закуплено удобрений",     `${season.fertilizerKgHa} кг/га`, season.declSource),
          ev("Дни до пика NDVI",        `${f.daysToPeak ?? "—"}`, sat),
        ],
      });
    }

    if (f.growthStartDate && season.declaredSowingDate) {
      const declared = new Date(season.declaredSowingDate).getTime();
      const observed = new Date(f.growthStartDate).getTime();
      const diffDays = Math.round((observed - declared) / 86_400_000);
      // > 30 дн. опоздания старта вегетации vs. заявленного посева
      if (diffDays > 30) {
        out.push({
          code: "CROP_LATE_GROWTH",
          severity: "high",
          title: "Старт вегетации значительно позже заявленного посева",
          detail: `По NDVI вегетация на поле начала формироваться ${f.growthStartDate}, тогда как заявленная дата посева — ${season.declaredSowingDate} (расхождение ${diffDays} дн.). Это типичный индикатор «бумажного» раннего посева для отчётности.`,
          expected: `Старт роста ≤ ${addDays(season.declaredSowingDate, 30)}`,
          actual:   `Старт роста ${f.growthStartDate}`,
          riskTenge: Math.round(season.subsidyTenge * 0.4),
          evidence: [
            ev("Заявленная дата посева",  season.declaredSowingDate, season.declSource),
            ev("Дата старта по NDVI",     f.growthStartDate,         sat),
            ev("Дата пика NDVI",          f.peakDate ?? "—",         sat),
          ],
        });
      }
    }
  }

  // Year-over-Year: если пик NDVI заметно ниже прошлогоднего, это аномалия.
  // С учётом метео может быть объяснимо (засуха) — в проде стоит увязывать
  // с meteo-движком; пока это «warn» с риском в денежном выражении.
  if (spatial?.yoy && spatial.yoy.ndviMaxDelta !== null && spatial.yoy.ndviMaxPrev !== null) {
    const drop = -spatial.yoy.ndviMaxDelta;
    if (drop >= SAT_THRESHOLDS.YOY_NDVI_DROP) {
      out.push({
        code: "CROP_YOY_DECLINE",
        severity: "warn",
        title: "Падение пика NDVI vs. прошлый год",
        detail: `Пик NDVI этого сезона — ${spatial.features?.ndviMax ?? "?"} против ${spatial.yoy.ndviMaxPrev} в ${spatial.yoy.previousYear}. Падение ${drop.toFixed(2)} превышает порог ${SAT_THRESHOLDS.YOY_NDVI_DROP}. Если погодные условия не объясняют разницу — поле «выдохлось», вложения в субсидии не дают результата.`,
        expected: `Δ ≤ ${SAT_THRESHOLDS.YOY_NDVI_DROP}`,
        actual:   `Δ = ${drop.toFixed(2)}`,
        riskTenge: Math.round(season.subsidyTenge * 0.2),
        evidence: [
          ev(`NDVI max ${spatial.yoy.previousYear}`, `${spatial.yoy.ndviMaxPrev}`, spatial.source),
          ev(`NDVI max ${season.year}`,               `${spatial.features?.ndviMax ?? "—"}`, spatial.source),
          ev("Старт вегетации (YoY)", `Δ ${spatial.yoy.growthStartDeltaDays ?? "—"} дн.`, spatial.source),
        ],
      });
    }
  }

  if (inactivity && (inactivity.level === "ALERT" || inactivity.level === "SUSPICIOUS")) {
    out.push({
      code: "CROP_POST_SUBSIDY_INACTIVE",
      severity: inactivity.level === "ALERT" ? "high" : "warn",
      title: inactivity.level === "ALERT"
        ? "После выдачи субсидии — нет агроактивности на снимках"
        : "Подозрение на отсутствие агроактивности после субсидии",
      detail: `С момента ${inactivity.baselineDate} прошло достаточно времени (проверено до ${inactivity.checkedThrough}), однако NDVI на полигоне не превысил порог активности (max ${inactivity.recentNDVIMax ?? "—"}, ΔNDVI ${inactivity.deltaNDVI ?? "—"}). ${inactivity.reasons.join(" ")}`,
      expected: "ΔNDVI ≥ 0.10 либо NDVI max ≥ 0.30 в окне после субсидии",
      actual:   `NDVI max ${inactivity.recentNDVIMax ?? "—"} · ΔNDVI ${inactivity.deltaNDVI ?? "—"}`,
      riskTenge: inactivity.level === "ALERT"
        ? Math.round(season.subsidyTenge * 0.6)
        : Math.round(season.subsidyTenge * 0.2),
      evidence: [
        { label: "Baseline дата",       value: inactivity.baselineDate, source: agrodataRefFromInactivity(inactivity) },
        { label: "Проверено до",         value: inactivity.checkedThrough, source: agrodataRefFromInactivity(inactivity) },
        { label: "NDVI на baseline",     value: `${inactivity.baselineNDVI ?? "—"}`, source: agrodataRefFromInactivity(inactivity) },
        { label: "Наблюдений в окне",    value: `${inactivity.observationsInWindow} (отброшено облачных ${inactivity.cloudyDropped})`, source: agrodataRefFromInactivity(inactivity) },
      ],
    });
  }

  return out;
}

function addDays(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

import type { SourceRef } from "../sources";
function agrodataRefFromInactivity(r: InactivityCheckResult): SourceRef {
  return {
    source: "AGRODATA",
    docId: `INACT-${r.provider}-${r.baselineDate}_${r.checkedThrough}`,
    fetchedAt: r.fetchedAt,
    note: `Inactivity check (${r.level}) · ${r.observationsInWindow} наблюд. в окне`,
  };
}
