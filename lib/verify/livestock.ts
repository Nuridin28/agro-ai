import type { HerdYear, Pasture, BreedingBull, MeteoSeason } from "../types";
import { BREED_LABEL } from "../types";
import { BREED_NORMS, expectedWinterFeedKgPerHead } from "../norms";
import type { Finding, Evidence } from "./types";

export interface LivestockContext {
  herd: HerdYear;
  pasture?: Pasture;
  bulls: BreedingBull[];
  meteo?: MeteoSeason;
  saleDeclaredKg?: number;
  saleSubsidyTenge?: number;
}

const ev = (label: string, value: string, source: Evidence["source"]): Evidence => ({ label, value, source });

export function runLivestockChecks(ctx: LivestockContext): Finding[] {
  const out: Finding[] = [];
  const { herd, pasture, bulls, meteo, saleDeclaredKg } = ctx;

  // Главная порода в стаде — у первого племенного быка (если их нет — берём казахскую белоголовую как нац.)
  const breed = bulls[0]?.breed ?? "kazakh_white_head";
  const norm = BREED_NORMS[breed];

  // ── 1) Bull → repro gap ──
  if (bulls.length > 0) {
    const reproPer100 = (herd.calvesBornHead / Math.max(1, herd.cowsHead)) * 100;
    if (reproPer100 < norm.reproPer100Cows.min) {
      const subsidyOnBulls = bulls.reduce((s, b) => s + b.subsidyTenge, 0);
      out.push({
        code: "LIV_BULL_REPRO_GAP",
        severity: "high",
        title: "Племенные быки куплены, но выход телят ниже биологической нормы",
        detail: `На балансе ${bulls.length} племенных быка(ов) породы «${BREED_LABEL[breed]}», на ${herd.cowsHead} коров получено ${herd.calvesBornHead} телят (${reproPer100.toFixed(1)} на 100 коров). Минимум для породы — ${norm.reproPer100Cows.min}/100. Это указывает на быков «на бумаге» либо на их использование не по назначению.`,
        expected: `≥ ${norm.reproPer100Cows.min} тел./100 коров`,
        actual:   `${reproPer100.toFixed(1)} тел./100 коров`,
        riskTenge: subsidyOnBulls,
        evidence: [
          ev("Племенные быки в ИАС",   `${bulls.length} гол.`,                               bulls[0].plemSource),
          ev("Маточное поголовье",      `${herd.cowsHead} гол.`,                              herd.source),
          ev("Приплод за год",          `${herd.calvesBornHead} тел.`,                         herd.source),
          ev("Субсидия на быков",       `${(subsidyOnBulls / 1_000_000).toFixed(1)} млн ₸`,    bulls[0].plemSource),
        ],
      });
    }
  }

  // ── 2) ADG over biological ceiling ──
  if (herd.declaredAdgKgDay > norm.adgKgDay.max) {
    out.push({
      code: "LIV_ADG_OVER_CEILING",
      severity: "critical",
      title: "Заявленный среднесуточный привес превышает биологический потолок",
      detail: `Заявлено ${herd.declaredAdgKgDay} кг/сутки, при том что для породы «${BREED_LABEL[breed]}» биологический максимум ${norm.adgKgDay.max} кг/сутки (типичный диапазон ${norm.adgKgDay.min}–${norm.adgKgDay.typical}). Превышение физически невозможно — высокий риск приписки веса.`,
      expected: `≤ ${norm.adgKgDay.max} кг/сутки`,
      actual:   `${herd.declaredAdgKgDay} кг/сутки`,
      riskTenge: herd.subsidyTenge,
      evidence: [
        ev("Порода",                              BREED_LABEL[breed],                                            bulls[0]?.plemSource ?? herd.source),
        ev("Заявленный привес",                   `${herd.declaredAdgKgDay} кг/сут`,                              herd.qoldauSource),
        ev("Биологический потолок (Plem.kz/ИАС)", `${norm.adgKgDay.max} кг/сут (типично ${norm.adgKgDay.typical})`, herd.source),
      ],
    });
  }

  // ── 3) Feed-to-growth correlation ──
  // Простая модель: на 1 кг прироста надо ~7 кг к.ед. кормов.
  const expectedFeedKgPerHead = norm.adgKgDay.typical * 365 * 7;
  if (herd.feedSubsidyKgPerHead < expectedFeedKgPerHead * 0.35 && herd.declaredAdgKgDay > norm.adgKgDay.typical * 1.15) {
    out.push({
      code: "LIV_FEED_TO_GROWTH",
      severity: "warn",
      title: "Корма куплено мало, а заявленный привес высокий",
      detail: `На голову закуплено всего ${herd.feedSubsidyKgPerHead} кг кормов (по Qoldau), при этом заявлен привес ${herd.declaredAdgKgDay} кг/сут. По норме конверсии 1:7 на такой привес требуется ~${Math.round(expectedFeedKgPerHead)} кг/гол. Разрыв указывает на фиктивные чеки на корма либо на приписку привеса.`,
      expected: `≥ ${Math.round(expectedFeedKgPerHead * 0.5)} кг/гол`,
      actual:   `${herd.feedSubsidyKgPerHead} кг/гол`,
      riskTenge: Math.round(herd.subsidyTenge * 0.4),
      evidence: [
        ev("Закуп кормов через Qoldau", `${herd.feedSubsidyKgPerHead} кг/гол`,        herd.qoldauSource),
        ev("Заявленный привес",          `${herd.declaredAdgKgDay} кг/сут`,            herd.qoldauSource),
        ev("Норма конверсии (Plem.kz)",  `≈ ${Math.round(expectedFeedKgPerHead)} кг/гол на такой привес`, herd.source),
      ],
    });
  }

  // ── 4) Pasture overload ──
  if (pasture) {
    const ceiling = pasture.areaHa * pasture.carryingCapacityHeadHa;
    const total = herd.cowsHead + herd.bullsHead;
    if (total > ceiling * 1.5) {
      out.push({
        code: "LIV_PASTURE_OVERLOAD",
        severity: "critical",
        title: "Превышение нормативной нагрузки на пастбище",
        detail: `На участке ${pasture.areaHa} га (${pasture.vegetationType}, балл ${pasture.bonitet}, эталон Гипрозема — ${pasture.carryingCapacityHeadHa} гол./га → потолок ${ceiling.toFixed(0)} гол.) заявлено ${total} голов. Превышение в ${(total / ceiling).toFixed(1)}× — без массового закупа внешних кормов содержание физически невозможно.`,
        expected: `≤ ${ceiling.toFixed(0)} гол. (Гипрозем)`,
        actual:   `${total} гол.`,
        riskTenge: herd.subsidyTenge,
        evidence: [
          ev("Площадь пастбища",                `${pasture.areaHa} га`,                pasture.source),
          ev("Тип растительности",              `${pasture.vegetationType}`,           pasture.giprozemSource),
          ev("Норма нагрузки (балл бонитета)",  `${pasture.carryingCapacityHeadHa} гол./га`, pasture.giprozemSource),
          ev("Поголовье в ИСЖ",                  `${total} гол. (${herd.cowsHead}+${herd.bullsHead})`, herd.source),
        ],
      });
    }
  }

  // ── 5) Vet gap ──
  if (herd.vaccinationCoveragePct < 80) {
    out.push({
      code: "LIV_VET_GAP",
      severity: "high",
      title: "Низкий охват обязательной вакцинации при субсидиях на корм",
      detail: `Охват вакцинации (ящур + бруцеллёз) — ${herd.vaccinationCoveragePct}% по VETIS, при минимуме 100% для получения субсидий. Государство возместило ${(herd.subsidyTenge / 1_000_000).toFixed(1)} млн ₸ на корм для поголовья, из которого ${100 - herd.vaccinationCoveragePct}% не имеет ветеринарного основания.`,
      expected: `100%`,
      actual:   `${herd.vaccinationCoveragePct}%`,
      riskTenge: Math.round(herd.subsidyTenge * (100 - herd.vaccinationCoveragePct) / 100),
      evidence: [
        ev("Охват вакцинации",  `${herd.vaccinationCoveragePct}%`,                  herd.vetSource),
        ev("Поголовье",          `${herd.cowsHead + herd.bullsHead} гол.`,           herd.source),
        ev("Субсидия на корма",  `${(herd.subsidyTenge / 1_000_000).toFixed(1)} млн ₸`, herd.qoldauSource),
      ],
    });
  }

  // ── 6) Winter feed gap ──
  if (meteo) {
    const expectedKg = expectedWinterFeedKgPerHead(meteo.minWinterC, meteo.maxSnowDepthCm);
    const harshWinter = meteo.minWinterC < -35 || meteo.maxSnowDepthCm > 50;
    if (harshWinter && herd.feedSubsidyKgPerHead < expectedKg * 0.4 && herd.mortalityHead === 0) {
      out.push({
        code: "LIV_WINTER_FEED_GAP",
        severity: "high",
        title: "Аномально низкий падёж при экстремальной зиме и минимальных кормах",
        detail: `Зима ${meteo.year}/${meteo.year + 1} в районе была экстремальной (мин. ${meteo.minWinterC}°C, снег до ${meteo.maxSnowDepthCm} см). Расчётная норма расхода кормов ≈ ${expectedKg} кг/гол, по Qoldau закуплено ${herd.feedSubsidyKgPerHead} кг/гол, при этом падёж нулевой. Это указывает на физическое отсутствие поголовья (стадо «на бумаге»).`,
        expected: `≥ ${Math.round(expectedKg * 0.6)} кг/гол при таких условиях`,
        actual:   `${herd.feedSubsidyKgPerHead} кг/гол, падёж 0`,
        riskTenge: Math.round(herd.subsidyTenge * 0.7),
        evidence: [
          ev("Минимум зимней температуры", `${meteo.minWinterC}°C`,                meteo.source),
          ev("Высота снега",                `${meteo.maxSnowDepthCm} см`,           meteo.source),
          ev("Падёж по ИСЖ",                `${herd.mortalityHead} гол.`,           herd.source),
          ev("Закуп кормов",                `${herd.feedSubsidyKgPerHead} кг/гол`,  herd.qoldauSource),
        ],
      });
    }
  }

  // ── 7) Sale weight fraud ──
  if (saleDeclaredKg && saleDeclaredKg > herd.avgSaleWeightKg + 30) {
    const diff = saleDeclaredKg - herd.avgSaleWeightKg;
    const overcharge = Math.round(diff / saleDeclaredKg * (ctx.saleSubsidyTenge ?? herd.subsidyTenge));
    out.push({
      code: "LIV_SALE_WEIGHT_FRAUD",
      severity: "critical",
      title: "Заявленный вес реализации выше фактически зафиксированного в ИСЖ",
      detail: `В заявке на субсидию (Qoldau) указан средний вес ${saleDeclaredKg} кг. По данным ИСЖ фактическая средняя живая масса при реализации составила ${herd.avgSaleWeightKg} кг — расхождение ${diff} кг. Это даёт основания на возврат части субсидии.`,
      expected: `${herd.avgSaleWeightKg} кг (ИСЖ)`,
      actual:   `${saleDeclaredKg} кг (Qoldau)`,
      riskTenge: overcharge,
      evidence: [
        ev("Заявленный вес (Qoldau)", `${saleDeclaredKg} кг`,                            herd.qoldauSource),
        ev("Фактический вес (ИСЖ)",   `${herd.avgSaleWeightKg} кг`,                      herd.source),
        ev("Расхождение",             `${diff} кг (≈${Math.round(diff / herd.avgSaleWeightKg * 100)}%)`, herd.source),
      ],
    });
  }

  return out;
}
