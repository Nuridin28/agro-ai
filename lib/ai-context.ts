// Сборка компактного контекста по фермеру для отправки в OpenAI.
// Только сухие факты + ссылки на источники, никакого PII за пределы того, что
// уже есть в публичных госисточниках (БИН, регион).

import { findFarmer, FARMERS } from "./mock/farmers";
import { fieldFor, seasonFor } from "./mock/crop";
import { herdFor, pastureFor, bullsFor, saleDeclarationFor } from "./mock/livestock";
import { meteoFor } from "./mock/meteo";
import { verifyFarmer } from "./verify";
import { CROP_LABEL, BREED_LABEL } from "./types";
import { computeExpectedYield } from "./verify/crop";
import { buildFarmerApplications, breakdownByCategory, SUBSIDY_CATEGORY_LABEL } from "./subsidies";
import { fetchRealMeteo, decodeWeatherCode } from "./real-meteo";

export function buildFarmerContext(farmerId: string): string {
  const farmer = findFarmer(farmerId);
  if (!farmer) return `Фермер ${farmerId} не найден.`;
  const verdict = verifyFarmer(farmerId);
  const field = fieldFor(farmerId);
  const season = seasonFor(farmerId);
  const herd = herdFor(farmerId);
  const pasture = pastureFor(farmerId);
  const bulls = bullsFor(farmerId);
  const sale = saleDeclarationFor(farmerId);
  const meteo = field
    ? meteoFor(field.region.katoCode, season?.year ?? 2024)
    : pasture
    ? meteoFor(pasture.region.katoCode, herd?.year ?? 2024)
    : undefined;

  const lines: string[] = [];
  lines.push(`=== Хозяйство ===`);
  lines.push(`${farmer.legalName} (БИН/ИИН ${farmer.bin})`);
  lines.push(`${farmer.region.oblast}, ${farmer.region.rayon}, КАТО ${farmer.region.katoCode}`);
  lines.push(`Сектор: ${farmer.sector}`);
  lines.push(`Эффективность по AI-движку: ${verdict.efficiencyScore}/100, Risk score: ${verdict.riskScore}, Решение: ${verdict.decision}`);
  lines.push(`Сумма субсидий: ${verdict.totalSubsidyTenge} ₸, Под риском возврата: ${verdict.totalRiskTenge} ₸`);

  if (field && season) {
    const exp = computeExpectedYield(field, season, meteo);
    lines.push(`\n=== Земледелие ===`);
    lines.push(`Поле ${field.cadastralNumber} (ЕГКН), ${field.areaHa} га, балл бонитета ${field.bonitet}`);
    lines.push(`Агрохимия (Гипрозем): гумус ${field.humusPct}%, N=${field.nitrogenMgKg}, P=${field.phosphorusMgKg}, K=${field.potassiumMgKg}, Cu=${field.copperMgKg}, Zn=${field.zincMgKg} мг/кг`);
    lines.push(`Сезон ${season.year}, культура ${CROP_LABEL[season.crop]}, заявлено ${season.declaredYieldCha} ц/га, удобрений ${season.fertilizerKgHa} кг/га, посев ${season.declaredSowingDate}, субсидия ${season.subsidyTenge} ₸`);
    lines.push(`Расчёт ожидаемой урожайности: ${exp.expected} ц/га (эталон ${exp.base}, бонитет ×${exp.bonitetCoef.toFixed(2)}, влага ×${exp.moistureCoef.toFixed(2)}, агрохимия ×${exp.agrochemCoef.toFixed(2)})`);
    if (meteo) {
      lines.push(`Метео сезона ${meteo.year}: снег ${meteo.swEqMm} мм, сход ${meteo.snowMeltDate}, прогрев почвы ${meteo.soilWarmDate}, бури=${meteo.springWindStress}, осадки авг–сен ${meteo.augSepRainfallMm} мм, мин t° ${meteo.minWinterC}, макс снег ${meteo.maxSnowDepthCm} см`);
    }
  }

  if (herd) {
    lines.push(`\n=== Животноводство ===`);
    if (bulls.length > 0) {
      lines.push(`Племенные быки (Plem.kz): ${bulls.length} гол. породы ${BREED_LABEL[bulls[0].breed]}, общая субсидия ${bulls.reduce((s, b) => s + b.subsidyTenge, 0)} ₸`);
    }
    lines.push(`Стадо ${herd.year}: коров ${herd.cowsHead}, быков ${herd.bullsHead}, приплод ${herd.calvesBornHead}, падёж ${herd.mortalityHead}, продано ${herd.soldHead}`);
    lines.push(`Средний вес продажи (ИСЖ): ${herd.avgSaleWeightKg} кг; ADG заявленный ${herd.declaredAdgKgDay} кг/сут`);
    lines.push(`Корма закуплено: ${herd.feedSubsidyKgPerHead} кг/гол; Вакцинация (VETIS): ${herd.vaccinationCoveragePct}%`);
    if (sale) lines.push(`Заявленный вес для субсидии (Qoldau): ${sale.declaredWeightKg} кг`);
    if (pasture) lines.push(`Пастбище ${pasture.cadastralNumber}: ${pasture.areaHa} га, тип ${pasture.vegetationType}, нагрузка ${pasture.carryingCapacityHeadHa} гол./га, потолок ${(pasture.areaHa * pasture.carryingCapacityHeadHa).toFixed(0)} гол.`);
  }

  const apps = buildFarmerApplications(farmerId);
  if (apps.length > 0) {
    lines.push(`\n=== Заявки на субсидии (по типам направлений 2026) ===`);
    const breakdown = breakdownByCategory(apps);
    for (const row of breakdown) {
      lines.push(`- ${SUBSIDY_CATEGORY_LABEL[row.category]}: ${row.applicationsCount} заявок, сумма ${row.amount} ₸, под риском ${row.riskTenge} ₸, не принято ${row.pendingCount}`);
    }
  }

  if (verdict.findings.length > 0) {
    lines.push(`\n=== Выявленные нарушения (${verdict.findings.length}) ===`);
    for (const f of verdict.findings) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.code}: ${f.title}`);
      lines.push(`  ${f.detail}`);
      if (f.expected) lines.push(`  Ожидалось: ${f.expected}`);
      if (f.actual) lines.push(`  Фактически: ${f.actual}`);
      if (f.riskTenge) lines.push(`  Сумма к возврату: ${f.riskTenge} ₸`);
    }
  } else {
    lines.push(`\n=== Нарушений не выявлено ===`);
  }

  return lines.join("\n");
}

const MONTH_NAMES_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// Контекст для AI-агроклиматолога: текущая погода + прогноз 7 дней + многолетние осадки.
// Тянет данные из open-meteo. Используется в режиме meteo_advisor.
export async function buildMeteoContext(lat: number, lng: number, label?: string, year?: number): Promise<string> {
  const yr = year ?? new Date().getFullYear();
  const meteo = await fetchRealMeteo(lat, lng, yr, { longTermYears: 6 });

  const lines: string[] = [];
  lines.push(`=== Локация ===`);
  lines.push(`${label ?? "Поле"} (lat ${lat.toFixed(3)}, lng ${lng.toFixed(3)}) · open-meteo / ERA5`);

  const c = meteo.current;
  lines.push(`\n=== Текущая погода (${new Date(c.time).toLocaleString("ru-KZ")}) ===`);
  lines.push(`Температура: ${c.temperatureC ?? "—"} °C, погода: ${decodeWeatherCode(c.weatherCode)}`);
  lines.push(`Снежный покров: ${c.snowDepthCm ?? "—"} см, осадки: ${c.precipitationMm ?? 0} мм/ч, ветер: ${c.windKmh ?? "—"} км/ч`);

  if (meteo.forecast7days.length > 0) {
    lines.push(`\n=== Прогноз 7 дней ===`);
    for (const d of meteo.forecast7days) {
      lines.push(`- ${d.date}: ${d.tmin.toFixed(0)}…${d.tmax.toFixed(0)}°C, осадки ${d.precipMm.toFixed(1)} мм`);
    }
  }

  const s = meteo.season;
  if (s) {
    lines.push(`\n=== Сезон ${s.year - 1}/${s.year} ===`);
    lines.push(`Снежный экв: ${s.snowWaterEquivMm} мм (всего ${s.totalWinterSnowfallCm} см снегопадов)`);
    lines.push(`Сход снега: ${s.snowMeltDate ?? "—"}, прогрев почвы (+8°C на 28-100 см): ${s.soilWarmDate ?? "—"}`);
    lines.push(`Минимум зимней t°: ${s.minWinterC} °C, макс. снег: ${s.maxSnowDepthCm} см`);
    lines.push(`Макс. ветер весной: ${s.springMaxWindKmh} км/ч (${s.springWindStress ? "«чёрные бури»" : "норма"})`);
    lines.push(`Осадки авг–сен (уборка): ${s.augSepRainfallMm} мм`);
  }

  const lt = meteo.longTerm;
  if (lt) {
    lines.push(`\n=== Долгосрочные осадки ${lt.fromYear}–${lt.toYear} ===`);
    lines.push(`Многолетнее годовое среднее: ${lt.multiYearAnnualAvg} мм`);
    lines.push(`Среднее по месяцам (мм):`);
    const avgRow = lt.multiYearMonthlyAvg.map((m) => `${MONTH_NAMES_RU[m.month - 1]}=${m.mm}`).join(", ");
    lines.push(`  ${avgRow}`);
    lines.push(`\nГодовые суммы:`);
    for (const yr of lt.yearly) {
      const tag = yr.partial ? " (YTD)" : "";
      const sign = yr.vsAvgPct > 0 ? "+" : "";
      lines.push(`- ${yr.year}${tag}: ${yr.mm} мм (Δ ${sign}${yr.vsAvgPct.toFixed(0)}% от ср.), дождливых дней ${yr.rainyDays}`);
    }
    lines.push(`\nПомесячный разрез (мм по годам):`);
    // Группируем по годам в формате y=jan/feb/.../dec
    const byYear = new Map<number, Map<number, number>>();
    for (const m of lt.monthly) {
      const yMap = byYear.get(m.year) ?? new Map<number, number>();
      yMap.set(m.month, m.mm);
      byYear.set(m.year, yMap);
    }
    for (const [y, yMap] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
      const cells: string[] = [];
      for (let m = 1; m <= 12; m++) {
        const v = yMap.get(m);
        cells.push(v == null ? "—" : `${MONTH_NAMES_RU[m - 1]}=${v}`);
      }
      lines.push(`- ${y}: ${cells.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// Контекст для инспекторского дашборда: агрегаты по портфелю + разрез по типам субсидий.
// Не содержит подробностей по каждому хозяйству — только сводные цифры, чтобы влезть в один запрос.
export function buildPortfolioContext(): string {
  const allApps = FARMERS.flatMap((f) => buildFarmerApplications(f.id));
  const verdicts = FARMERS.map((f) => verifyFarmer(f.id));
  const totalSubsidy = verdicts.reduce((s, v) => s + v.totalSubsidyTenge, 0);
  const totalRisk = verdicts.reduce((s, v) => s + v.totalRiskTenge, 0);
  const findingsCount = verdicts.reduce((s, v) => s + v.findings.length, 0);

  const lines: string[] = [];
  lines.push(`=== Портфель субсидий АПК (Казахстан, демо) ===`);
  lines.push(`Хозяйств в реестре: ${FARMERS.length}`);
  lines.push(`Общая сумма субсидий: ${totalSubsidy} ₸`);
  lines.push(`Под риском возврата: ${totalRisk} ₸ (${totalSubsidy ? ((totalRisk / totalSubsidy) * 100).toFixed(1) : 0}%)`);
  lines.push(`Сработало правил верификации: ${findingsCount}`);
  lines.push(`Распределение решений: к возврату ${verdicts.filter((v) => v.decision === "recovery").length}, аудит ${verdicts.filter((v) => v.decision === "audit").length}, проверить ${verdicts.filter((v) => v.decision === "review").length}, чисто ${verdicts.filter((v) => v.decision === "clear").length}`);

  lines.push(`\n=== Разбивка по типам субсидий ===`);
  for (const row of breakdownByCategory(allApps)) {
    const share = row.amount > 0 ? ((row.riskTenge / row.amount) * 100).toFixed(1) : "0";
    lines.push(`- ${SUBSIDY_CATEGORY_LABEL[row.category]}: ${row.applicationsCount} заявок, сумма ${row.amount} ₸, риск ${row.riskTenge} ₸ (доля ${share}% от суммы), не принято ${row.pendingCount}`);
  }

  lines.push(`\n=== Топ-нарушители (по сумме под риском) ===`);
  const ranked = verdicts
    .map((v, i) => ({ farmer: FARMERS[i], verdict: v }))
    .filter((x) => x.verdict.totalRiskTenge > 0)
    .sort((a, b) => b.verdict.totalRiskTenge - a.verdict.totalRiskTenge)
    .slice(0, 5);
  if (ranked.length === 0) lines.push(`Нет хозяйств с риском.`);
  for (const x of ranked) {
    const codes = x.verdict.findings.map((f) => f.code).join(", ");
    lines.push(`- ${x.farmer.legalName} (БИН ${x.farmer.bin}, ${x.farmer.region.oblast}): риск ${x.verdict.totalRiskTenge} ₸, правила: ${codes}`);
  }

  return lines.join("\n");
}
