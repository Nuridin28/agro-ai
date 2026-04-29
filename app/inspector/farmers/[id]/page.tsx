import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findFarmer, FARMERS } from "@/lib/mock/farmers";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { herdFor, pastureFor, bullsFor, saleDeclarationFor } from "@/lib/mock/livestock";
import { meteoFor } from "@/lib/mock/meteo";
import { CROP_LABEL, BREED_LABEL } from "@/lib/types";
import { CROP_NORMS, BREED_NORMS } from "@/lib/norms";
import { computeExpectedYield } from "@/lib/verify/crop";
import { verifyFarmer } from "@/lib/verify";
import { Card, CardHeader, CategoryBadge, DecisionBadge, SourcePill, formatTenge } from "@/components/ui";
import { FindingCard } from "@/components/FindingCard";
import { AiInsight } from "@/components/AiInsight";
import { SatelliteSection } from "@/components/SatelliteSection";
import { SatelliteCardSkeleton } from "@/components/SatelliteCardSkeleton";
import { buildFarmerApplications } from "@/lib/subsidies";

export function generateStaticParams() {
  return FARMERS.map((f) => ({ id: f.id }));
}

export default async function FarmerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmer = findFarmer(id);
  if (!farmer) notFound();

  // Базовый verdict считаем синхронно (без спутника) — чтобы первая отрисовка
  // страницы (метео, агрохимия, заявки) не блокировалась SH-вызовами.
  // Спутниковая карточка стримится отдельно через <Suspense>.
  const verdict = verifyFarmer(farmer.id);
  const field = fieldFor(farmer.id);
  const season = seasonFor(farmer.id);
  const herd = herdFor(farmer.id);
  const pasture = pastureFor(farmer.id);
  const bulls = bullsFor(farmer.id);
  const sale = saleDeclarationFor(farmer.id);
  const meteo = field
    ? meteoFor(field.region.katoCode, season?.year ?? 2024)
    : pasture
    ? meteoFor(pasture.region.katoCode, herd?.year ?? 2024)
    : undefined;

  const cropFindings = verdict.findings.filter((f) => f.code.startsWith("CROP_"));
  const livestockFindings = verdict.findings.filter((f) => f.code.startsWith("LIV_"));
  const applications = buildFarmerApplications(farmer.id);

  return (
    <div className="space-y-6">
      <nav className="text-xs text-foreground/60">
        <Link className="hover:underline" href="/inspector">Дашборд</Link> / <span>{farmer.legalName}</span>
      </nav>

      <Card className="p-6">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{farmer.legalName}</h1>
              <DecisionBadge d={verdict.decision} />
            </div>
            <div className="text-sm text-foreground/70 mt-1">
              {farmer.ownerFio} · БИН/ИИН <span className="font-mono">{farmer.bin}</span>
            </div>
            <div className="text-sm text-foreground/70 mt-0.5">
              {farmer.region.oblast}, {farmer.region.rayon}, {farmer.region.okrug ?? "—"} · КАТО <span className="font-mono">{farmer.region.katoCode}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <SourcePill source={farmer.source} />
              <a
                href={`/giprozem?q=${encodeURIComponent(extractKeyword(farmer.legalName))}`}
                className="text-xs text-accent underline underline-offset-2"
                title="Запросить агрохимию live из portal.giprozem.kz"
              >Проверить в Giprozem live →</a>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-72">
            <Mini label="Субсидии" value={formatTenge(verdict.totalSubsidyTenge)} />
            <Mini label="Риск ₸" value={verdict.totalRiskTenge > 0 ? formatTenge(verdict.totalRiskTenge) : "—"} accent={verdict.totalRiskTenge > 0 ? "high" : undefined} />
            <Mini label="Эффективность" value={`${verdict.efficiencyScore}/100`} />
          </div>
        </div>
      </Card>

      <AiInsight
        farmerId={farmer.id}
        mode="inspector_summary"
        description="Получите от OpenAI развёрнутое заключение для комиссии: суть нарушений, цифры, источники — на естественном языке."
        buttonLabel="Сгенерировать разбор для комиссии"
      />

      {applications.length > 0 && (
        <Card>
          <CardHeader
            title="Заявки на субсидии · по типам"
            subtitle="Каждая заявка — отдельное направление поддержки. Риск ₸ привязан к коду нарушения движка верификации."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">Тип субсидии</th>
                  <th className="px-3 py-2 font-medium">Объект</th>
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium text-right">Сумма</th>
                  <th className="px-3 py-2 font-medium text-right">Риск ₸</th>
                  <th className="px-3 py-2 font-medium">Источник</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} className="border-t border-border align-top">
                    <td className="px-5 py-3">
                      <CategoryBadge category={a.category} />
                      <div className="text-[11px] text-foreground/60 mt-1">{a.type}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground/80">{a.scope}</td>
                    <td className="px-3 py-3 font-mono text-xs">{a.date}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatTenge(a.amount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {a.riskTenge > 0 ? <span className="text-rose-700 font-medium">{formatTenge(a.riskTenge)}</span> : <span className="text-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-3">{a.source ? <SourcePill source={a.source} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Findings */}
      {verdict.findings.length === 0 ? (
        <Card className="p-6 bg-emerald-50 border-emerald-200">
          <div className="text-emerald-900 font-semibold">Признаков нецелевого использования субсидий не выявлено</div>
          <div className="text-sm text-emerald-800/80 mt-1">Заявленные показатели согласуются с метеоусловиями, агрохимией и нормативами Гипрозема/Plem.kz.</div>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Выявленные нарушения · {verdict.findings.length}</h2>
          <div className="grid gap-3">
            {verdict.findings.map((f, i) => <FindingCard key={i} finding={f} />)}
          </div>
        </section>
      )}

      {/* Crop block */}
      {field && season && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            Земледелие
            {cropFindings.length > 0 && <span className="text-xs text-rose-700">{cropFindings.length} нарушений</span>}
          </h2>
          <div className="grid lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader title={`Поле ${field.cadastralNumber}`} subtitle={`${field.areaHa.toLocaleString("ru-KZ")} га • балл бонитета ${field.bonitet}`} action={<SourcePill source={field.source} />} />
              <DList rows={[
                ["Гумус", `${field.humusPct} %`, field.agroSource],
                ["Азот N", `${field.nitrogenMgKg} мг/кг`, field.agroSource],
                ["Фосфор P", `${field.phosphorusMgKg} мг/кг`, field.agroSource],
                ["Калий K", `${field.potassiumMgKg} мг/кг`, field.agroSource],
                ["Медь Cu", `${field.copperMgKg} мг/кг`, field.agroSource],
                ["Цинк Zn", `${field.zincMgKg} мг/кг`, field.agroSource],
              ]} />
            </Card>

            <Card>
              <CardHeader title={`Сезон ${season.year} · ${CROP_LABEL[season.crop]}`} subtitle={`Субсидия ${formatTenge(season.subsidyTenge)}`} action={<SourcePill source={season.declSource} />} />
              <DList rows={[
                ["Заявленный сбор", `${season.declaredYieldCha} ц/га`, season.yieldSource],
                ["Эталон БНС для культуры", `${CROP_NORMS[season.crop].baseYieldCentnersHa} ц/га`, season.yieldSource],
                ["Расчёт ожидаемого", expectedSummary(field, season, meteo), field.agroSource],
                ["Внесено удобрений", `${season.fertilizerKgHa} кг/га`, season.declSource],
                ["Норма высева", `${season.seedKgHa} кг/га`, season.declSource],
                ["Дата посева", season.declaredSowingDate, season.declSource],
              ]} />
            </Card>

            <Suspense fallback={<SatelliteCardSkeleton className="lg:col-span-2" />}>
              <SatelliteSection farmerId={farmer.id} className="lg:col-span-2" />
            </Suspense>

            {meteo && (
              <Card className="lg:col-span-2">
                <CardHeader title={`Метеосезон ${meteo.year}-${meteo.year + 1}`} subtitle={`КАТО ${meteo.regionKato} · Казгидромет + Agrodata`} action={<div className="flex gap-1"><SourcePill source={meteo.source} /><SourcePill source={meteo.agrodataSource} /></div>} />
                <DList rows={[
                  ["Снежный покров (вод. экв.)", `${meteo.swEqMm} мм`, meteo.source],
                  ["Сход снега",                  meteo.snowMeltDate, meteo.source],
                  ["Прогрев почвы до +8°C",      meteo.soilWarmDate, meteo.source],
                  ["Весенние «черные бури»",     meteo.springWindStress ? "Зафиксированы" : "Нет", meteo.source],
                  ["Осадки авг–сен",              `${meteo.augSepRainfallMm} мм`, meteo.source],
                  ["Минимум зимней температуры", `${meteo.minWinterC} °C`, meteo.source],
                  ["Максимум высоты снега",       `${meteo.maxSnowDepthCm} см`, meteo.source],
                ]} />
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Livestock block */}
      {herd && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            Животноводство
            {livestockFindings.length > 0 && <span className="text-xs text-rose-700">{livestockFindings.length} нарушений</span>}
          </h2>
          <div className="grid lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader title={`Стадо ${herd.year}`} subtitle={`Субсидия ${formatTenge(herd.subsidyTenge)}`} action={<SourcePill source={herd.source} />} />
              <DList rows={[
                ["Маточное поголовье",  `${herd.cowsHead} гол.`, herd.source],
                ["Быки-производители",   `${herd.bullsHead} гол.`, herd.source],
                ["Приплод за год",       `${herd.calvesBornHead} тел.`, herd.source],
                ["Падёж",                `${herd.mortalityHead} гол.`, herd.source],
                ["Реализовано на убой",  `${herd.soldHead} гол.`, herd.source],
                ["Средний вес продажи (ИСЖ)", `${herd.avgSaleWeightKg} кг`, herd.source],
                ["Заявленный вес для субсидии", sale ? `${sale.declaredWeightKg} кг` : "—", sale?.source ?? herd.qoldauSource],
                ["Заявленный привес",    `${herd.declaredAdgKgDay} кг/сут`, herd.qoldauSource],
                ["Закуплено кормов",     `${herd.feedSubsidyKgPerHead} кг/гол`, herd.qoldauSource],
                ["Охват вакцинации (VETIS)", `${herd.vaccinationCoveragePct}%`, herd.vetSource],
              ]} />
            </Card>

            {pasture && (
              <Card>
                <CardHeader title={`Пастбище ${pasture.cadastralNumber}`} subtitle={`${pasture.areaHa} га · ${pasture.vegetationType.replace(/_/g, " ")}`} action={<SourcePill source={pasture.source} />} />
                <DList rows={[
                  ["Балл бонитета",     `${pasture.bonitet}`, pasture.giprozemSource],
                  ["Норма нагрузки",    `${pasture.carryingCapacityHeadHa} гол./га`, pasture.giprozemSource],
                  ["Потолок поголовья", `${(pasture.areaHa * pasture.carryingCapacityHeadHa).toFixed(0)} гол.`, pasture.giprozemSource],
                  ["Фактически на пастбище", `${herd.cowsHead + herd.bullsHead} гол.`, herd.source],
                ]} />
              </Card>
            )}

            {bulls.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader
                  title={`Племенные быки в ИАС · ${bulls.length}`}
                  subtitle={`Порода: ${BREED_LABEL[bulls[0].breed]} · потолок ADG ${BREED_NORMS[bulls[0].breed].adgKgDay.max} кг/сут · мин. приплод ${BREED_NORMS[bulls[0].breed].reproPer100Cows.min}/100`}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left">
                      <tr>
                        <th className="px-5 py-2 font-medium">ИНЖ</th>
                        <th className="px-3 py-2 font-medium">Свидетельство</th>
                        <th className="px-3 py-2 font-medium">Куплен</th>
                        <th className="px-3 py-2 font-medium text-right">Цена</th>
                        <th className="px-3 py-2 font-medium text-right">Субсидия</th>
                        <th className="px-3 py-2 font-medium">Источники</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulls.map((b) => (
                        <tr key={b.inj} className="border-t border-border">
                          <td className="px-5 py-2 font-mono">{b.inj}</td>
                          <td className="px-3 py-2 font-mono text-xs">{b.plemCertId}</td>
                          <td className="px-3 py-2">{b.purchasedAt}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatTenge(b.costTenge)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatTenge(b.subsidyTenge)}</td>
                          <td className="px-3 py-2 flex gap-1"><SourcePill source={b.source} /><SourcePill source={b.plemSource} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// Берём из «ТОО Кызылжар-Агро» → «Кызылжар-Агро» (отрезаем юр.префикс).
// Используется как параметр поиска для Giprozem (LIKE %X%).
function extractKeyword(legalName: string): string {
  return legalName.replace(/^(ТОО|КХ|ИП|АО|ТОВ|КФХ)\s+/i, "").replace(/[«»"]/g, "").trim();
}

function expectedSummary(field: any, season: any, meteo: any) {
  const e = computeExpectedYield(field, season, meteo);
  return `${e.expected} ц/га (бонитет ${(e.bonitetCoef * 100).toFixed(0)}% · влага ${(e.moistureCoef * 100).toFixed(0)}% · агрохимия ${(e.agrochemCoef * 100).toFixed(0)}%)`;
}

function Mini({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "high" }) {
  return (
    <div className="border border-border rounded-lg px-3 py-2 bg-muted/40">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${accent === "high" ? "text-rose-700" : ""}`}>{value}</div>
    </div>
  );
}

function DList({ rows }: { rows: [string, React.ReactNode, any][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v, s], i) => (
          <tr key={i} className="border-t border-border first:border-t-0">
            <td className="px-5 py-2 text-foreground/70 w-2/5 align-top">{k}</td>
            <td className="px-3 py-2 align-top">{v}</td>
            <td className="px-3 py-2 align-top text-right">{s ? <SourcePill source={s} /> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
