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
import { verifyFarmerWithSatellite } from "@/lib/verify";
import { Card, CardHeader, CategoryBadge, DecisionBadge, RiskScoreCard, SourcePill, formatTenge } from "@/components/ui";
import { FindingCard } from "@/components/FindingCard";
import { AiInsight } from "@/components/AiInsight";
import { SatelliteSection } from "@/components/SatelliteSection";
import { SatelliteCardSkeleton } from "@/components/SatelliteCardSkeleton";
import { buildFarmerApplications, type SubsidyApplication } from "@/lib/subsidies";
import { getStoredApplicationsFor } from "@/lib/applications-store";
import { findById as findUserById, type User } from "@/lib/users-store";
import { OBLAST_NAMES, findLayer } from "@/lib/giprozem-catalog";
import { RealMeteoCard } from "@/components/RealMeteoCard";
import { RealMeteoSkeleton } from "@/components/RealMeteoSkeleton";
import { checkUserApplication, sortBySeverity, declarationToText, type CheckSeverity, type NDVISummaryForCheck, type SARSummaryForCheck } from "@/lib/applications-check";
import { fetchSeason } from "@/lib/real-meteo";
import { getSatelliteProvider } from "@/lib/satellite";
import { computeFeatures } from "@/lib/satellite/ndvi";
import { getSAREvents, isSARConfigured, polygonKey } from "@/lib/satellite/sar";
import { polygonAreaHa, polygonBboxDims } from "@/lib/satellite/geo";
import { db } from "@/lib/db";
import { fieldCoherenceJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { FieldPolygon } from "@/lib/satellite/types";

export function generateStaticParams() {
  return FARMERS.map((f) => ({ id: f.id }));
}

export default async function FarmerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sat?: string }>;
}) {
  const { id } = await params;
  const { sat } = await searchParams;

  // Реальный пользователь: id вида "U-xxxxxxxx". У него нет мок-полей/сезонов/
  // verdict, зато есть привязки Гипрозема и поданные через форму заявки.
  if (id.startsWith("U-")) {
    const user = await findUserById(id.slice(2));
    if (!user) notFound();
    return <RealUserPage user={user} farmerId={id} satParam={sat} />;
  }

  const farmer = findFarmer(id);
  if (!farmer) notFound();

  // Verdict с подключёнными спутниковыми проверками (NDVI + SAR + inactivity).
  // Async: страница ждёт SH/CDSE, но это уже общий кеш (на диске и в Postgres),
  // повторные открытия — мгновенно. Спутниковая карточка стримится отдельно
  // через <Suspense>, чтобы заголовок и заявки появлялись до завершения NDVI.
  const verdict = await verifyFarmerWithSatellite(farmer.id);
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

  // Мок-история заявок (из verify-движка) + поданные через форму (Postgres).
  // Заявки от фермера показываем сверху таблицы.
  const mockApps = buildFarmerApplications(farmer.id);
  const stored = await getStoredApplicationsFor(farmer.id);
  const userApps: SubsidyApplication[] = stored.map((s) => ({
    id: s.id,
    farmerId: s.farmerId,
    category: s.category,
    type: s.type,
    scope: s.scope,
    amount: s.amount,
    riskTenge: 0,
    status: s.status,
    date: s.date,
  }));
  const applications = [...userApps, ...mockApps];

  return (
    <div className="space-y-6">
      <nav className="text-xs text-foreground/60">
        <Link className="hover:underline" href="/inspector">Дашборд</Link> / <span>{farmer.legalName}</span>
      </nav>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-start gap-4 md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight wrap-break-word">{farmer.legalName}</h1>
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
          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full md:w-auto md:min-w-80">
            <Mini label="Субсидии" value={formatTenge(verdict.totalSubsidyTenge)} />
            <Mini label="Риск ₸" value={verdict.totalRiskTenge > 0 ? formatTenge(verdict.totalRiskTenge) : "—"} accent={verdict.totalRiskTenge > 0 ? "high" : undefined} />
            <RiskScoreCard value={verdict.riskScore} />
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

// ────────────────────────────────────────────────────────────────────────────
// Досье реального пользователя (зарегистрированного через /register).
// Использует данные привязки Гипрозема:
//  - агрохимию (n/p/k/gum) для проверок заявок
//  - polygon4326 (если сохранён при регистрации) для NDVI-мониторинга
//  - centroid слоя Гипрозема для реального метео через Open-Meteo
// ────────────────────────────────────────────────────────────────────────────
async function RealUserPage({ user, farmerId, satParam }: { user: User; farmerId: string; satParam?: string }) {
  const stored = await getStoredApplicationsFor(farmerId);
  const totalRequested = stored.reduce((s, a) => s + a.amount, 0);
  const firstField = user.fields[0];
  const oblast = firstField ? OBLAST_NAMES[firstField.oblastCode] ?? "—" : "—";
  const layer = firstField ? findLayer(firstField.layerId) : null;

  // Парсим ?sat=fi:pi — индексы UserField и Parcel внутри неё. Это значит,
  // что инспектор нажал «Посмотреть со спутника» именно для этого parcel'а.
  // Только тогда фетчим NDVI/SAR/Coherence. Без этого параметра — никаких
  // спутниковых запросов на странице (lazy-загрузка).
  let activeParcel: { fi: number; pi: number; polygon: FieldPolygon } | null = null;
  if (satParam && /^\d+:\d+$/.test(satParam)) {
    const [fi, pi] = satParam.split(":").map(Number);
    const field = user.fields[fi];
    const parcel = field?.parcels?.[pi];
    if (parcel?.polygon4326 && parcel.polygon4326.length >= 4) {
      activeParcel = { fi, pi, polygon: parcel.polygon4326 as FieldPolygon };
    }
  }
  // Сезон для NDVI/метео. ВСЕГДА используем «последний завершённый сезон»:
  // если сейчас до октября — текущая вегетация ещё в разгаре или не началась,
  // у Sentinel-2 в архиве нет полного ряда снимков → показываем прошлый год.
  // Если фермер задекларировал посев на будущее (например, на 2026-04-29 в
  // апреле 2026) — всё равно показываем 2025, иначе SH вернёт INSUFFICIENT_DATA.
  const now = new Date();
  const seasonYear = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  // Подгружаем сезонное метео ОДИН раз — используется и в карточке метео,
  // и в проверке заявок (фиктивный посев / дефицит влаги).
  const seasonMeteo = layer
    ? await fetchSeason(layer.centroid[0], layer.centroid[1], seasonYear).catch(() => null)
    : null;

  // Baseline для спутниковой проверки. ВАЖНО: должен попадать в seasonYear,
  // иначе мы сравниваем декларацию одного года с NDVI другого года.
  const seasonDecl = stored.find(
    (a) => a.cropDeclaration?.declaredSowingDate?.startsWith(`${seasonYear}-`),
  )?.cropDeclaration?.declaredSowingDate;
  const baselineDate = seasonDecl ?? `${seasonYear}-05-15`;
  const useDeclForCheck = !!seasonDecl;

  // NDVI и SAR-сводки. Фетчим ТОЛЬКО если инспектор открыл конкретный parcel
  // через ?sat=fi:pi. Без активного parcel'а — спутник не дёргается, страница
  // грузится мгновенно. Прежнее поведение «авто-фетч для firstField»
  // удалено по требованию lazy-загрузки.
  let ndviSummary: NDVISummaryForCheck | undefined;
  let sarSummary: SARSummaryForCheck | undefined;
  if (activeParcel) {
    const startDate = `${seasonYear}-04-01`;
    const endDate   = `${seasonYear}-10-15`;
    const [ndviRes, sarEvents] = await Promise.all([
      getSatelliteProvider().getNDVITimeseries(activeParcel.polygon, startDate, endDate).catch(() => null),
      isSARConfigured() ? getSAREvents(activeParcel.polygon, startDate, endDate).catch(() => null) : Promise.resolve(null),
    ]);
    if (ndviRes) {
      const features = computeFeatures(ndviRes);
      if (features) {
        ndviSummary = {
          harvestDate: features.harvestDate,
          harvestDetected: features.harvestDetected,
          peakDate: features.peakDate,
          ndviMax: features.ndviMax,
        };
      }
    }
    if (sarEvents) {
      sarSummary = {
        harvestDate: sarEvents.summary.harvestEvent?.date ?? null,
        harvestConfidence: sarEvents.summary.harvestEvent?.confidence,
        inactivity: sarEvents.summary.inactivity,
        vhSeasonStdevDb: sarEvents.summary.vhSeasonStdevDb,
        tillageEventsCount: sarEvents.summary.tillageEvents.length,
      };
    }
  }

  return (
    <div className="space-y-6">
      <nav className="text-xs text-foreground/60">
        <Link className="hover:underline" href="/inspector">Дашборд</Link> / <span>{user.farmName}</span>
      </nav>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-start gap-4 md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight wrap-break-word">{user.farmName}</h1>
              <span className="text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-md border bg-sky-100 text-sky-900 border-sky-300">
                САМОРЕГИСТРАЦИЯ
              </span>
            </div>
            <div className="text-sm text-foreground/70 mt-1">
              {user.ownerFio ?? user.email}
              {user.bin && user.bin !== "—" && <> · БИН/ИИН <span className="font-mono">{user.bin}</span></>}
            </div>
            <div className="text-sm text-foreground/70 mt-0.5">
              {oblast}{layer ? `, ${layer.name}` : ""} · зарегистрирован{user.createdAt ? ` ${user.createdAt.slice(0, 10)}` : ""}
            </div>
            <div className="text-xs text-foreground/55 mt-1.5 font-mono">{farmerId}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full md:w-auto md:min-w-80">
            <Mini label="Привязок Гипрозема" value={user.fields.length} />
            <Mini
              label="Общая площадь"
              value={(() => {
                const totalHa = user.fields.reduce((sum, f) => {
                  for (const p of f.parcels ?? []) {
                    if (p.polygon4326 && p.polygon4326.length >= 4) {
                      sum += polygonAreaHa(p.polygon4326 as FieldPolygon);
                    }
                  }
                  return sum;
                }, 0);
                return totalHa > 0 ? `${totalHa.toFixed(1)} га` : "—";
              })()}
            />
            <Mini label="Подано на сумму" value={formatTenge(totalRequested)} />
          </div>
        </div>
      </Card>

      {stored.length > 0 && (
        <Card>
          <CardHeader
            title={`Заявки на субсидии · ${stored.length}`}
            subtitle="Поданы через кабинет фермера. Каждая заявка с декларацией урожая прогоняется через автоматический фрод-чек."
          />
          <div className="space-y-3 p-4">
            {stored.map((a) => {
              const decl = a.cropDeclaration;
              const warnings = decl
                ? sortBySeverity(checkUserApplication(a, firstField, seasonMeteo ?? undefined, ndviSummary, sarSummary))
                : [];
              const sevWeight: Record<CheckSeverity, number> = { critical: 4, high: 3, warn: 2, info: 1, ok: 0 };
              const topSev = warnings.reduce<CheckSeverity>(
                (acc, w) => (sevWeight[w.severity] > sevWeight[acc] ? w.severity : acc),
                "ok",
              );
              const borderCls =
                topSev === "critical" ? "border-rose-300 bg-rose-50/50" :
                topSev === "high"     ? "border-orange-300 bg-orange-50/50" :
                topSev === "warn"     ? "border-amber-300 bg-amber-50/50" :
                                        "border-border bg-card";
              return (
                <div key={a.id} className={`border rounded-xl p-4 ${borderCls}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CategoryBadge category={a.category} />
                        <span className="font-mono text-xs text-foreground/70">{a.id}</span>
                        <span className="text-[11px] font-medium border border-amber-300 bg-amber-100 text-amber-900 rounded px-2 py-0.5">{a.status}</span>
                      </div>
                      <div className="text-sm text-foreground/85 mt-1.5">{a.scope}</div>
                      {decl && (
                        <div className="text-[11px] text-foreground/60 mt-1 font-mono">{declarationToText(decl)}</div>
                      )}
                      <div className="text-[11px] text-foreground/55 mt-0.5">подана {a.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold tabular-nums">{formatTenge(a.amount)}</div>
                      <div className="text-[11px] text-foreground/55">сумма заявки</div>
                    </div>
                  </div>
                  {decl ? (
                    warnings.length > 0 ? (
                      <div className="mt-3 border-t border-border-soft pt-3 space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-foreground/60">Авто-проверка · сработало правил: {warnings.length}</div>
                        {warnings.map((w, i) => <WarningRow key={i} warning={w} />)}
                      </div>
                    ) : (
                      <div className="mt-3 border-t border-border-soft pt-3 text-xs text-emerald-800">
                        ✓ Авто-проверка: декларация согласована с агрохимией{seasonMeteo ? " и метео" : ""} — заявку можно одобрять.
                      </div>
                    )
                  ) : (
                    <div className="mt-3 border-t border-border-soft pt-3 text-[11px] text-foreground/55 italic">
                      Декларация урожая не предоставлена — авто-проверка по этой заявке недоступна.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {layer && (
        <Suspense fallback={<RealMeteoSkeleton />}>
          <RealMeteoCard
            lat={layer.centroid[0]}
            lng={layer.centroid[1]}
            year={seasonYear}
            label={`центр района ${layer.name}`}
          />
        </Suspense>
      )}

      {user.fields.length > 0 ? (
        <Card>
          <CardHeader
            title={`Поля фермера · ${user.fields.reduce((s, f) => s + (f.parcels?.length ?? 0), 0)}`}
            subtitle="Все участки хозяйств, прикреплённые при регистрации. Площадь — геодезически из polygon4326. «Посмотреть со спутника» дёргает NDVI/SAR/Coherence по конкретному участку (не на все сразу)."
          />
          <div className="p-4 space-y-5">
            {user.fields.map((f, fi) => (
              <FieldGroupCard
                key={fi}
                fi={fi}
                field={f}
                farmerId={farmerId}
                activeParcelIdx={activeParcel?.fi === fi ? activeParcel.pi : null}
                activeParcelBaseline={activeParcel?.fi === fi ? baselineDate : undefined}
                activeParcelYear={seasonYear}
                checkAgainstDeclaration={useDeclForCheck}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-6 bg-amber-50/60 border-amber-200">
          <div className="font-semibold text-amber-900">Нет привязанных хозяйств Гипрозема</div>
          <div className="text-sm text-amber-900/80 mt-1">
            Полная фрод-проверка (агрохимия + спутник + метео) станет доступна, когда фермер привяжет участок при регистрации.
          </div>
        </Card>
      )}

    </div>
  );
}

function WarningRow({ warning }: { warning: import("@/lib/applications-check").CheckWarning }) {
  const cls: Record<CheckSeverity, string> = {
    critical: "bg-rose-100 text-rose-900 border-rose-300",
    high:     "bg-orange-100 text-orange-900 border-orange-300",
    warn:     "bg-amber-100 text-amber-900 border-amber-300",
    info:     "bg-sky-100 text-sky-900 border-sky-300",
    ok:       "bg-emerald-100 text-emerald-900 border-emerald-300",
  };
  const label: Record<CheckSeverity, string> = {
    critical: "критично", high: "высокий риск", warn: "внимание", info: "инфо", ok: "норма",
  };
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className={`shrink-0 mt-0.5 inline-flex items-center text-[10px] font-medium border rounded-full px-2 py-0.5 ${cls[warning.severity]}`}>
        {label[warning.severity]}
      </span>
      <div className="flex-1">
        <div className="font-medium text-foreground/90">{warning.title}</div>
        <div className="text-foreground/70 mt-0.5">{warning.detail}</div>
        <div className="text-[10px] text-foreground/50 font-mono mt-0.5">{warning.code}</div>
      </div>
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

// ────────────────────────────────────────────────────────────────────────────
// Карточка одной привязки Гипрозема (одно хозяйство в одном районе). Внутри —
// список всех parcel'ов (реальных участков), каждый со своими координатами,
// площадью и кнопкой «Посмотреть со спутника» (LazySatelliteButton).
// ────────────────────────────────────────────────────────────────────────────
function FieldGroupCard({
  fi,
  field,
  farmerId,
  activeParcelIdx,
  activeParcelBaseline,
  activeParcelYear,
  checkAgainstDeclaration,
}: {
  fi: number;
  field: import("@/lib/users-store").UserField;
  farmerId: string;
  activeParcelIdx: number | null;
  activeParcelBaseline?: string;
  activeParcelYear: number;
  checkAgainstDeclaration: boolean;
}) {
  const parcels = field.parcels ?? [];
  return (
    <div className="border border-border-soft rounded-xl bg-muted/20">
      <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-medium">{field.nazvxoz}</div>
          <div className="text-[11px] text-foreground/60 mt-0.5">
            Слой <span className="font-mono">{field.layerName}</span> ·
            оба́ласть {field.oblastCode} · участков {parcels.length}
          </div>
        </div>
        <div className="text-[11px] text-foreground/70 font-mono">
          гумус {field.sample?.gum ?? "—"} · P {field.sample?.p ?? "—"} ·
          N {field.sample?.n ?? "—"} · K {field.sample?.k ?? "—"}
        </div>
      </div>
      <div className="divide-y divide-border-soft">
        {parcels.length === 0 ? (
          <div className="px-5 py-3 text-xs text-foreground/60">
            Контуры участков не сохранились при регистрации (старая запись).
            Перерегистрируйте хозяйство — мы подтянем все parcel-ы из Гипрозема.
          </div>
        ) : (
          parcels.map((p, pi) => (
            <ParcelRow
              key={pi}
              fi={fi}
              pi={pi}
              parcel={p}
              farmerId={farmerId}
              isActive={activeParcelIdx === pi}
              baselineDate={activeParcelBaseline}
              year={activeParcelYear}
              checkAgainstDeclaration={checkAgainstDeclaration}
            />
          ))
        )}
      </div>
    </div>
  );
}

async function ParcelRow({
  fi,
  pi,
  parcel,
  farmerId,
  isActive,
  baselineDate,
  year,
  checkAgainstDeclaration,
}: {
  fi: number;
  pi: number;
  parcel: import("@/lib/users-store").Parcel;
  farmerId: string;
  isActive: boolean;
  baselineDate?: string;
  year: number;
  checkAgainstDeclaration: boolean;
}) {
  const polygon = parcel.polygon4326 as FieldPolygon;
  const areaHa = polygonAreaHa(polygon);
  const bbox = polygonBboxDims(polygon);
  // Центроид (для отображения координат) — простое среднее.
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of polygon) { sumLng += lng; sumLat += lat; }
  const cLng = sumLng / polygon.length;
  const cLat = sumLat / polygon.length;

  // Статус HyP3-джобов для этого parcel'а (по fieldKey). Считаем сколько в
  // обработке (PENDING/RUNNING) и сколько готово (DONE) — показываем
  // инспектору, что Coherence обрабатывается в фоне.
  const fieldKey = polygonKey(polygon);
  const jobs = await db
    .select({ status: fieldCoherenceJobs.status })
    .from(fieldCoherenceJobs)
    .where(eq(fieldCoherenceJobs.fieldKey, fieldKey))
    .catch(() => [] as { status: string }[]);
  const jobCounts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  const inProgress = (jobCounts.PENDING ?? 0) + (jobCounts.RUNNING ?? 0);
  const ready = (jobCounts.DONE ?? 0);

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <div className="font-medium flex items-center gap-2 flex-wrap">
            Участок №{pi + 1}
            {parcel.cadastralNumber && (
              <span className="text-[11px] font-mono text-foreground/60">
                кад. {parcel.cadastralNumber}
              </span>
            )}
            {inProgress > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-sky-50 border-sky-200 text-sky-900">
                ⏳ Coherence: {inProgress} в обработке
              </span>
            )}
            {ready > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-900">
                ✓ Coherence готов: {ready}
              </span>
            )}
          </div>
          <div className="text-[11px] text-foreground/65 mt-0.5 font-mono">
            {areaHa.toFixed(1)} га · {Math.round(bbox.widthM)}×{Math.round(bbox.heightM)} м ·
            центр {cLat.toFixed(4)}°N, {cLng.toFixed(4)}°E
          </div>
          {parcel.sample && (parcel.sample.gum != null || parcel.sample.p != null) && (
            <div className="text-[11px] text-foreground/65 mt-0.5">
              per-parcel агрохимия: гумус {parcel.sample.gum ?? "—"} · P {parcel.sample.p ?? "—"} ·
              N {parcel.sample.n ?? "—"} · K {parcel.sample.k ?? "—"}
            </div>
          )}
        </div>
        <div>
          {isActive ? (
            <Link
              href={`/inspector/farmers/${farmerId}`}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-accent/40 bg-accent/10 text-accent"
            >
              ✕ Закрыть спутник
            </Link>
          ) : (
            <Link
              href={`/inspector/farmers/${farmerId}?sat=${fi}:${pi}`}
              className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-border bg-card hover:border-accent hover:bg-accent/5 transition"
            >
              ▶ Посмотреть со спутника
            </Link>
          )}
        </div>
      </div>
      {isActive && baselineDate && (
        <div className="mt-3">
          <Suspense fallback={<SatelliteCardSkeleton />}>
            <SatelliteSection
              polygon={polygon}
              baselineDate={baselineDate}
              year={year}
              checkAgainstDeclaration={checkAgainstDeclaration}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
