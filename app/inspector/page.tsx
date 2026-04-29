import Link from "next/link";
import { FARMERS } from "@/lib/mock/farmers";
import { verifyFarmer } from "@/lib/verify";
import { Card, CardHeader, CategoryBadge, DecisionBadge, FarmerLink, SeverityBadge, Stat, formatTenge } from "@/components/ui";
import { AiInsight } from "@/components/AiInsight";
import { buildFarmerApplications, breakdownByCategory, SUBSIDY_CATEGORY_GROUP } from "@/lib/subsidies";
import { IconBuilding, IconCoin, IconAlert, IconShield, IconChart, IconSparkle, IconLayers } from "@/components/Icon";

const SECTOR_LABEL: Record<string, string> = {
  crop: "Земледелие",
  livestock: "Животноводство",
  mixed: "Смешанное",
};

export default function DashboardPage() {
  const verdicts = FARMERS.map((f) => ({ farmer: f, verdict: verifyFarmer(f.id) }));

  const totalSubsidy = verdicts.reduce((s, v) => s + v.verdict.totalSubsidyTenge, 0);
  const totalRisk = verdicts.reduce((s, v) => s + v.verdict.totalRiskTenge, 0);
  const findingsCount = verdicts.reduce((s, v) => s + v.verdict.findings.length, 0);
  const recoveryCount = verdicts.filter((v) => v.verdict.decision === "recovery").length;
  const auditCount = verdicts.filter((v) => v.verdict.decision === "audit").length;
  const cleanCount = verdicts.filter((v) => v.verdict.decision === "clear").length;

  const portfolioApps = FARMERS.flatMap((f) => buildFarmerApplications(f.id));
  const portfolioBreakdown = breakdownByCategory(portfolioApps);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft p-6 sm:p-8">
        <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-rose-300 opacity-15 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-dots opacity-40 pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-foreground-soft font-medium px-2.5 py-1 rounded-full border border-border bg-card">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Демо-данные синхронизированы с госисточниками
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mt-3 leading-tight">
            AI-форензика субсидий <span className="text-gradient-accent">АПК Казахстана</span>
          </h1>
          <p className="text-sm sm:text-base text-foreground-soft mt-2.5 max-w-3xl leading-relaxed">
            Платформа сопоставляет данные ИСЖ, Plem.kz, VETIS, Гипрозема, ЕГКН, Qoldau и Казгидромета и выявляет признаки нецелевого использования
            субсидий: приписки урожая и веса, фиктивный посев, перенаселение пастбищ, разрывы между ветеринарной отчётностью и заявками на корм.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={<IconBuilding size={14} />} label="Хозяйств в реестре" value={FARMERS.length} sub="Источник: Qoldau" />
        <Stat icon={<IconCoin size={14} />} label="Общая сумма субсидий" value={formatTenge(totalSubsidy)} sub="2024 год" />
        <Stat icon={<IconAlert size={14} />} label="Под риском возврата" value={formatTenge(totalRisk)} sub="оценка AI" accent={totalRisk > 0 ? "high" : "ok"} />
        <Stat icon={<IconShield size={14} />} label="Сработало правил" value={findingsCount} sub={`по ${verdicts.filter(v => v.verdict.findings.length > 0).length} хозяйствам`} accent={findingsCount > 0 ? "warn" : "ok"} />
        <Stat icon={<IconChart size={14} />} label="К возврату / Аудит / Чисто" value={`${recoveryCount} / ${auditCount} / ${cleanCount}`} sub="распределение по решению" />
      </section>

      {portfolioBreakdown.length > 0 && (
        <Card>
          <CardHeader
            title="Аналитика по типам субсидий"
            subtitle="Разбивка портфеля по направлениям господдержки. Доля риска показывает, какие категории требуют внимания комиссии."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10.5px] uppercase tracking-wider text-foreground-soft bg-muted-2/80 text-left sticky top-0">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Тип</th>
                  <th className="px-3 py-2.5 font-medium">Группа</th>
                  <th className="px-3 py-2.5 font-medium text-right">Заявок</th>
                  <th className="px-3 py-2.5 font-medium text-right">Сумма</th>
                  <th className="px-3 py-2.5 font-medium text-right">Риск ₸</th>
                  <th className="px-3 py-2.5 font-medium">Доля риска</th>
                </tr>
              </thead>
              <tbody>
                {portfolioBreakdown.map((row) => {
                  const riskShare = row.amount > 0 ? row.riskTenge / row.amount : 0;
                  return (
                    <tr key={row.category} className="border-t border-border-soft align-top hover:bg-muted-2/40 transition">
                      <td className="px-5 py-3"><CategoryBadge category={row.category} /></td>
                      <td className="px-3 py-3 text-xs text-foreground/70">
                        {SUBSIDY_CATEGORY_GROUP[row.category] === "crop" ? "Земледелие" :
                         SUBSIDY_CATEGORY_GROUP[row.category] === "livestock" ? "Животноводство" : "Общее"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.applicationsCount}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatTenge(row.amount)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {row.riskTenge > 0 ? <span className="text-rose-700 font-medium">{formatTenge(row.riskTenge)}</span> : <span className="text-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-3"><RiskShareBar share={riskShare} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AiInsight
        mode="inspector_portfolio"
        description="OpenAI разберёт портфель субсидий: какие категории дают больше всего риска, какие фермеры и почему. Помимо правил движка верификации."
        buttonLabel="Сгенерировать инсайты по портфелю"
      />

      <Card>
        <CardHeader title="Реестр получателей субсидий" subtitle="Сортировка по риску. Нажмите на хозяйство, чтобы открыть полное досье и трекинг источников." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60">
              <tr className="text-left">
                <th className="px-5 py-2.5 font-medium">Хозяйство</th>
                <th className="px-3 py-2.5 font-medium">Регион</th>
                <th className="px-3 py-2.5 font-medium">Сектор</th>
                <th className="px-3 py-2.5 font-medium text-right">Субсидия</th>
                <th className="px-3 py-2.5 font-medium text-right">Риск ₸</th>
                <th className="px-3 py-2.5 font-medium">Сработало правил</th>
                <th className="px-3 py-2.5 font-medium">Эффективность</th>
                <th className="px-3 py-2.5 font-medium">Решение</th>
              </tr>
            </thead>
            <tbody>
              {verdicts
                .sort((a, b) => b.verdict.riskScore - a.verdict.riskScore)
                .map(({ farmer, verdict }, idx) => (
                  <tr key={farmer.id} className={`border-t border-border-soft hover:bg-muted-2/50 transition ${idx % 2 === 0 ? "bg-card" : "bg-muted-2/30"}`}>
                    <td className="px-5 py-3.5 align-top">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center font-mono text-[10px] font-bold border border-emerald-100 shrink-0">
                          {farmer.id.replace("F-", "")}
                        </span>
                        <div>
                          <FarmerLink id={farmer.id}>{farmer.legalName}</FarmerLink>
                          <div className="text-[11px] text-foreground-soft">{farmer.ownerFio} · БИН/ИИН {farmer.bin}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 align-top text-xs text-foreground/80">
                      {farmer.region.oblast}<br />
                      <span className="text-foreground-soft">{farmer.region.rayon} · КАТО {farmer.region.katoCode}</span>
                    </td>
                    <td className="px-3 py-3.5 align-top text-xs">{SECTOR_LABEL[farmer.sector]}</td>
                    <td className="px-3 py-3.5 align-top text-right tabular-nums">{formatTenge(verdict.totalSubsidyTenge)}</td>
                    <td className="px-3 py-3.5 align-top text-right tabular-nums">
                      {verdict.totalRiskTenge > 0 ? <span className="text-rose-700 font-semibold">{formatTenge(verdict.totalRiskTenge)}</span> : <span className="text-foreground-soft/60">—</span>}
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      {verdict.findings.length === 0 ? (
                        <span className="text-foreground-soft/60 text-xs">нет нарушений</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {verdict.findings.map((f, i) => (
                            <SeverityBadge key={i} s={f.severity} label={shortRule(f.code)} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <EffBar value={verdict.efficiencyScore} />
                    </td>
                    <td className="px-3 py-3.5 align-top"><DecisionBadge d={verdict.decision} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center"><IconLayers size={16} /></span>
            <div className="text-sm font-semibold tracking-tight">Как работает движок</div>
          </div>
          <ol className="space-y-2.5">
            {[
              <>Подтягиваем кадастр и КАТО из <Link className="text-accent hover:underline" href="/inspector/sources">ЕГКН</Link></>,
              "Накладываем агрохимию из Гипрозема и метеоданные Казгидромета/Agrodata",
              "Сверяем с заявками Qoldau, отчётностью БНС, журналами ИСЖ/VETIS/Plem.kz",
              "Запускаем правила биологических потолков и пороговых аномалий",
              "Каждое нарушение содержит ссылки на исходные документы — комиссия может проверить",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-foreground/85">
                <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 grid place-items-center text-[11px] font-bold border border-emerald-100">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 grid place-items-center"><IconAlert size={16} /></span>
            <div className="text-sm font-semibold tracking-tight">Покрываемые риск-кейсы</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {[
              "Приписки урожая",
              "Фиктивный посев",
              "Племенные быки «на бумаге»",
              "Перегруз пастбищ",
              "ADG > биол. потолка",
              "Разрыв веса реализации",
              "Низкая вакцинация",
              "Аном. низкий падёж",
            ].map((c) => (
              <div key={c} className="flex items-center gap-2 text-sm text-foreground/85 px-2.5 py-1.5 rounded-lg bg-muted-2/60 border border-border-soft">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                {c}
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function RiskShareBar({ share }: { share: number }) {
  const pct = Math.min(100, Math.round(share * 100));
  const color = pct >= 30 ? "bg-rose-500" : pct >= 10 ? "bg-amber-500" : pct > 0 ? "bg-sky-500" : "bg-muted";
  return (
    <div className="flex items-center gap-2 min-w-30">
      <div className="w-20 h-1.5 rounded bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-foreground/70">{pct}%</span>
    </div>
  );
}

function EffBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 45 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2 min-w-30">
      <div className="w-16 h-1.5 rounded bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums w-8">{value}</span>
    </div>
  );
}

function shortRule(code: string): string {
  const m: Record<string, string> = {
    CROP_BIOLOGICAL_CEILING: "потолок урожая",
    CROP_REGIONAL_OUTLIER: "региональный отрыв",
    CROP_MOISTURE_INCONSISTENCY: "влагозапас",
    CROP_AGROCHEM_DEFICIT: "дефицит P/Cu",
    CROP_FERTILIZER_GAP: "разрыв удобрений",
    CROP_FAKE_SOWING: "фикт. посев",
    LIV_BULL_REPRO_GAP: "плембык/приплод",
    LIV_GENETIC_NO_GAIN: "ген. без эффекта",
    LIV_ADG_OVER_CEILING: "ADG > потолка",
    LIV_FEED_TO_GROWTH: "корма vs привес",
    LIV_PASTURE_OVERLOAD: "перегруз пастбищ",
    LIV_WINTER_FEED_GAP: "зима/корма/падёж",
    LIV_VET_GAP: "вет. разрыв",
    LIV_SALE_WEIGHT_FRAUD: "вес реализации",
  };
  return m[code] ?? code;
}
