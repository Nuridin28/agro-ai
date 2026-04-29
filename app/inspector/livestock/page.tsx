import { FARMERS } from "@/lib/mock/farmers";
import { herdFor, pastureFor, bullsFor, saleDeclarationFor } from "@/lib/mock/livestock";
import { meteoFor } from "@/lib/mock/meteo";
import { BREED_LABEL } from "@/lib/types";
import { BREED_NORMS } from "@/lib/norms";
import { verifyFarmer } from "@/lib/verify";
import { Card, CardHeader, DecisionBadge, FarmerLink, SeverityBadge, SourcePill, Stat, formatTenge } from "@/components/ui";

export default function LivestockPage() {
  const rows = FARMERS
    .filter((f) => f.sector === "livestock" || f.sector === "mixed")
    .map((f) => {
      const herd = herdFor(f.id);
      if (!herd) return null;
      const pasture = pastureFor(f.id);
      const bulls = bullsFor(f.id);
      const sale = saleDeclarationFor(f.id);
      const meteo = pasture ? meteoFor(pasture.region.katoCode, herd.year) : undefined;
      const verdict = verifyFarmer(f.id);
      const livFindings = verdict.findings.filter((x) => x.code.startsWith("LIV_"));
      const breed = bulls[0]?.breed ?? "kazakh_white_head";
      const norm = BREED_NORMS[breed];
      const repro = (herd.calvesBornHead / Math.max(1, herd.cowsHead)) * 100;
      const ceilingHead = pasture ? pasture.areaHa * pasture.carryingCapacityHeadHa : null;
      return { f, herd, pasture, bulls, sale, meteo, verdict, livFindings, breed, norm, repro, ceilingHead };
    })
    .filter(Boolean) as Array<{
      f: typeof FARMERS[number];
      herd: NonNullable<ReturnType<typeof herdFor>>;
      pasture: ReturnType<typeof pastureFor>;
      bulls: ReturnType<typeof bullsFor>;
      sale: ReturnType<typeof saleDeclarationFor>;
      meteo: ReturnType<typeof meteoFor>;
      verdict: ReturnType<typeof verifyFarmer>;
      livFindings: ReturnType<typeof verifyFarmer>["findings"];
      breed: keyof typeof BREED_NORMS;
      norm: typeof BREED_NORMS[keyof typeof BREED_NORMS];
      repro: number;
      ceilingHead: number | null;
    }>;

  const totalSubsidy = rows.reduce((s, r) => s + r.herd.subsidyTenge, 0);
  const totalRisk = rows.reduce((s, r) => s + r.livFindings.reduce((t, x) => t + (x.riskTenge ?? 0), 0), 0);
  const totalHeads = rows.reduce((s, r) => s + r.herd.cowsHead + r.herd.bullsHead, 0);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Модуль «Животноводство»</h1>
        <p className="text-sm text-foreground/70 mt-1 max-w-3xl">
          Сопоставление паспортов животных (ИСЖ), племенных свидетельств (Plem.kz), журналов вакцинации (VETIS), нагрузки на пастбище (Гипрозем),
          объёмов закупа кормов (Qoldau) и метеоусловий (Казгидромет). Биологические потолки взяты из ИАС/Plem.kz.
        </p>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Хозяйств" value={rows.length} />
        <Stat label="Поголовье" value={`${totalHeads.toLocaleString("ru-KZ")} гол.`} />
        <Stat label="Субсидии" value={formatTenge(totalSubsidy)} />
        <Stat label="Под риском" value={formatTenge(totalRisk)} accent={totalRisk > 0 ? "high" : "ok"} />
      </section>

      <Card>
        <CardHeader title="Сводка по хозяйствам · 2024" subtitle="Колонки сравниваются с биологическим эталоном породы и нормой нагрузки на пастбище" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left">
              <tr>
                <th className="px-5 py-2 font-medium">Хозяйство</th>
                <th className="px-3 py-2 font-medium">Порода</th>
                <th className="px-3 py-2 font-medium text-right">Поголовье / потолок</th>
                <th className="px-3 py-2 font-medium text-right">Приплод /100</th>
                <th className="px-3 py-2 font-medium text-right">ADG факт / max</th>
                <th className="px-3 py-2 font-medium text-right">Вес: Qoldau ↔ ИСЖ</th>
                <th className="px-3 py-2 font-medium">Вакцинация</th>
                <th className="px-3 py-2 font-medium">Решение</th>
              </tr>
            </thead>
            <tbody>
              {rows.sort((a, b) => b.verdict.riskScore - a.verdict.riskScore).map(({ f, herd, pasture, bulls, sale, verdict, livFindings, breed, norm, repro, ceilingHead }) => {
                const totalHead = herd.cowsHead + herd.bullsHead;
                const overload = ceilingHead && totalHead > ceilingHead * 1.5;
                const reproBad = repro < norm.reproPer100Cows.min;
                const adgBad = herd.declaredAdgKgDay > norm.adgKgDay.max;
                const weightBad = sale && sale.declaredWeightKg > herd.avgSaleWeightKg + 30;
                return (
                  <tr key={f.id} className="border-t border-border align-top">
                    <td className="px-5 py-3">
                      <FarmerLink id={f.id}>{f.legalName}</FarmerLink>
                      <div className="text-xs text-foreground/60">{f.region.rayon}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {BREED_LABEL[breed]}<br />
                      <span className="text-foreground/60">{bulls.length} плем. быка</span>
                      {bulls[0] && <div className="mt-1"><SourcePill source={bulls[0].plemSource} /></div>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className={overload ? "text-rose-700 font-semibold" : ""}>{totalHead}</div>
                      <div className="text-xs text-foreground/60">
                        потолок {ceilingHead ? Math.round(ceilingHead) : "—"}
                      </div>
                      {pasture && <div className="mt-1 text-right"><SourcePill source={pasture.giprozemSource} /></div>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className={reproBad ? "text-rose-700 font-semibold" : ""}>{repro.toFixed(1)}</div>
                      <div className="text-xs text-foreground/60">мин. {norm.reproPer100Cows.min}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className={adgBad ? "text-rose-700 font-semibold" : ""}>{herd.declaredAdgKgDay}</div>
                      <div className="text-xs text-foreground/60">max {norm.adgKgDay.max}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className={weightBad ? "text-rose-700 font-semibold" : ""}>
                        {sale ? `${sale.declaredWeightKg}` : "—"} <span className="text-foreground/50">↔</span> {herd.avgSaleWeightKg}
                      </div>
                      <div className="text-xs text-foreground/60">кг</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className={herd.vaccinationCoveragePct < 80 ? "text-rose-700 font-semibold" : ""}>{herd.vaccinationCoveragePct}%</div>
                      <div className="mt-1"><SourcePill source={herd.vetSource} /></div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <DecisionBadge d={verdict.decision} />
                        {livFindings.map((x, i) => <SeverityBadge key={i} s={x.severity} />)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
