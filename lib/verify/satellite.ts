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
import type { SAREventsResult } from "../satellite/sar-events";

function ev(label: string, value: string, sourceObj: Evidence["source"]): Evidence {
  return { label, value, source: sourceObj };
}

export interface SatelliteContext {
  field: Field;
  season: CropSeason;
  spatial?: SatelliteVerification | null;
  inactivity?: InactivityCheckResult | null;
  sar?: SAREventsResult | null;
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

    // Сравнение заявленной даты уборки с детектированной по NDVI.
    if (season.declaredHarvestDate && f.harvestDate) {
      const dDecl = new Date(`${season.declaredHarvestDate}T00:00:00Z`).getTime();
      const dObs  = new Date(`${f.harvestDate}T00:00:00Z`).getTime();
      const diffDays = Math.round((dObs - dDecl) / 86_400_000);
      const absDays = Math.abs(diffDays);
      if (absDays > 30) {
        const direction = diffDays > 0 ? "позже" : "раньше";
        out.push({
          code: "CROP_HARVEST_DATE_MISMATCH",
          severity: "high",
          title: "Заявленная дата уборки расходится со спутником",
          detail: `По декларации уборка ${season.declaredHarvestDate}, по NDVI поле перестало зеленеть только ${f.harvestDate} (${absDays} дн. ${direction}). Это классический признак «бумажной уборки» для досрочного закрытия отчётности.`,
          expected: `|Δ| ≤ ${30} дн.`,
          actual:   `Δ = ${diffDays} дн.`,
          riskTenge: Math.round(season.subsidyTenge * 0.5),
          evidence: [
            ev("Заявленная дата уборки",  season.declaredHarvestDate, season.declSource),
            ev("Падение NDVI ниже порога", f.harvestDate,             sat),
            ev("Дата пика NDVI",          f.peakDate ?? "—",          sat),
          ],
        });
      } else if (absDays > 15) {
        out.push({
          code: "CROP_HARVEST_DATE_DRIFT",
          severity: "warn",
          title: "Дата уборки слегка расходится со спутником",
          detail: `По декларации уборка ${season.declaredHarvestDate}, по NDVI — ${f.harvestDate} (${absDays} дн.). В пределах допустимого «шага облачности», но проверить вручную.`,
          expected: `|Δ| ≤ 15 дн.`,
          actual:   `Δ = ${diffDays} дн.`,
          riskTenge: 0,
          evidence: [
            ev("Заявленная дата уборки", season.declaredHarvestDate, season.declSource),
            ev("Падение NDVI",            f.harvestDate,             sat),
          ],
        });
      }
    }

    // Полный цикл «рост → пик → падение» не закрылся в окне сезона.
    if (f.vegetationPresent && f.peakDate && !f.harvestDetected) {
      out.push({
        code: "CROP_NO_HARVEST_DETECTED",
        severity: "warn",
        title: "Уборка не подтверждается снимками",
        detail: `Пик NDVI был зафиксирован ${f.peakDate}, но падение биомассы ниже порога ${0.20} до конца сезона не наблюдалось. Возможные причины: уборка не проведена, поле под паром/кормом, либо данные за конец сезона потеряны из-за облачности.`,
        expected: "После пика NDVI должен упасть ниже 0.20 в окне сезона",
        actual:   `Пик ${f.peakDate}, падения не зафиксировано`,
        riskTenge: season.declaredHarvestDate ? Math.round(season.subsidyTenge * 0.3) : 0,
        evidence: [
          ev("Дата пика NDVI",         f.peakDate,                                sat),
          ev("Заявленная уборка",      season.declaredHarvestDate ?? "—",         season.declSource),
        ],
      });
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

  // SAR-чеки: события из ряда S1 backscatter. Не валят сборку без CDSE —
  // ctx.sar просто null, и блок пропускается.
  if (ctx.sar) {
    const sar = ctx.sar;
    const sarSource: SourceRef = {
      source: "AGRODATA",
      docId: `SAR-S1-${season.year}-${season.farmerId}`,
      fetchedAt: new Date().toISOString(),
      note: `Sentinel-1 GRD · ${sar.summary.pointsUsed} наблюд., σVH ${sar.summary.vhSeasonStdevDb}дБ`,
    };

    // Расхождение даты уборки по SAR с заявленной — параллельно с NDVI-чеком.
    // SAR не зависит от облаков, поэтому даёт более точную дату, чем NDVI.
    if (sar.summary.harvestEvent && season.declaredHarvestDate) {
      const dDecl = new Date(`${season.declaredHarvestDate}T00:00:00Z`).getTime();
      const dObs  = new Date(`${sar.summary.harvestEvent.date}T00:00:00Z`).getTime();
      const diffDays = Math.round((dObs - dDecl) / 86_400_000);
      const absDays = Math.abs(diffDays);
      if (absDays > 30) {
        out.push({
          code: "CROP_SAR_HARVEST_MISMATCH",
          severity: "high",
          title: "SAR: дата уборки расходится с заявленной",
          detail: `Sentinel-1 зафиксировал падение VH (биомассы) ${sar.summary.harvestEvent.date}, фермер заявил уборку ${season.declaredHarvestDate} (расхождение ${absDays} дн.). ${sar.summary.harvestEvent.reason}.`,
          expected: `|Δ| ≤ 30 дн.`,
          actual:   `Δ = ${diffDays} дн.`,
          riskTenge: Math.round(season.subsidyTenge * 0.5),
          evidence: [
            ev("Заявленная уборка",   season.declaredHarvestDate,             season.declSource),
            ev("SAR-событие уборки",   sar.summary.harvestEvent.date,         sarSource),
            ev("Confidence",           sar.summary.harvestEvent.confidence.toFixed(2), sarSource),
          ],
        });
      }
    }

    // Поле спит весь сезон по SAR — даже если NDVI чем-то закрыт облаками,
    // S1 ловит отсутствие изменений независимо.
    if (sar.summary.inactivity) {
      out.push({
        code: "CROP_SAR_FIELD_INACTIVE",
        severity: "high",
        title: "SAR: поле не работало весь сезон",
        detail: `Sentinel-1 не зафиксировал значимых изменений backscatter (σ VH = ${sar.summary.vhSeasonStdevDb} дБ при пороге ${1.0} дБ). За сезон ${season.year} на поле нет ни вспашки, ни уборки. Заявленная агротехническая деятельность не подтверждается радаром.`,
        expected: `σ VH ≥ 1.0 дБ за сезон`,
        actual:   `σ VH = ${sar.summary.vhSeasonStdevDb} дБ`,
        riskTenge: Math.round(season.subsidyTenge * 0.7),
        evidence: [
          ev("σ VH (сезон)",            `${sar.summary.vhSeasonStdevDb} дБ`,    sarSource),
          ev("Медиана VH (сезон)",     `${sar.summary.vhSeasonMedianDb} дБ`,   sarSource),
          ev("Наблюдений S1",           `${sar.summary.pointsUsed}`,            sarSource),
        ],
      });
    } else if (sar.summary.tillageEvents.length === 0 && season.declaredSowingDate) {
      // Tillage-событие не нашлось — подозрительно, но мягче (warn), потому что
      // вспашка не всегда даёт яркий пик в backscatter.
      out.push({
        code: "CROP_SAR_NO_TILLAGE",
        severity: "warn",
        title: "SAR: следов вспашки не обнаружено",
        detail: `Sentinel-1 не зафиксировал всплеска VV (роста шероховатости почвы) в окне марта-октября ${season.year}. Это слабый, но дополнительный признак отсутствия механических работ перед посевом, заявленным на ${season.declaredSowingDate}.`,
        expected: `≥ 1 события tillage в сезоне`,
        actual:   `0 событий`,
        riskTenge: 0,
        evidence: [
          ev("σ VH (сезон)",            `${sar.summary.vhSeasonStdevDb} дБ`,    sarSource),
          ev("Наблюдений S1",           `${sar.summary.pointsUsed}`,            sarSource),
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
