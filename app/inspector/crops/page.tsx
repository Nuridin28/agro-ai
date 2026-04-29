import { FARMERS } from "@/lib/mock/farmers";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { meteoFor } from "@/lib/mock/meteo";
import { CROP_LABEL } from "@/lib/types";
import { CROP_NORMS } from "@/lib/norms";
import { computeExpectedYield } from "@/lib/verify/crop";
import { verifyFarmer } from "@/lib/verify";
import { Card, CardHeader, DecisionBadge, FarmerLink, SeverityBadge, SourcePill, Stat, formatTenge } from "@/components/ui";

export default function CropsPage() {
  const rows = FARMERS
    .filter((f) => f.sector === "crop" || f.sector === "mixed")
    .map((f) => {
      const field = fieldFor(f.id);
      const season = seasonFor(f.id);
      if (!field || !season) return null;
      const meteo = meteoFor(field.region.katoCode, season.year);
      const exp = computeExpectedYield(field, season, meteo);
      const verdict = verifyFarmer(f.id);
      const cropFindings = verdict.findings.filter((x) => x.code.startsWith("CROP_"));
      return { f, field, season, meteo, exp, verdict, cropFindings };
    })
    .filter(Boolean) as Array<{
      f: typeof FARMERS[number];
      field: NonNullable<ReturnType<typeof fieldFor>>;
      season: NonNullable<ReturnType<typeof seasonFor>>;
      meteo: ReturnType<typeof meteoFor>;
      exp: ReturnType<typeof computeExpectedYield>;
      verdict: ReturnType<typeof verifyFarmer>;
      cropFindings: ReturnType<typeof verifyFarmer>["findings"];
    }>;

  const totalSubsidy = rows.reduce((s, r) => s + r.season.subsidyTenge, 0);
  const totalRisk = rows.reduce((s, r) => s + r.cropFindings.reduce((t, x) => t + (x.riskTenge ?? 0), 0), 0);
  const totalArea = rows.reduce((s, r) => s + r.field.areaHa, 0);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Модуль «Земледелие»</h1>
        <p className="text-sm text-foreground/70 mt-1 max-w-3xl">
          Сезон 2024 года. Эталон — биологическая норма по культуре (БНС/КазНИИЗиР), скорректированная на бонитет (Гипрозем),
          влагозарядку (Казгидромет: снежный покров, прогрев почвы) и агрохимию (P, Cu, гумус). Заявленный сбор сравнивается с расчётным потолком.
        </p>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Хозяйств" value={rows.length} />
        <Stat label="Общая площадь" value={`${totalArea.toLocaleString("ru-KZ")} га`} />
        <Stat label="Субсидии" value={formatTenge(totalSubsidy)} />
        <Stat label="Под риском" value={formatTenge(totalRisk)} accent={totalRisk > 0 ? "high" : "ok"} />
      </section>

      <Card>
        <CardHeader title="Сравнение заявленных сборов с расчётным потенциалом" subtitle="Источники: Гипрозем (агрохимия), ЕГКН (кадастр), Казгидромет/Agrodata (метео), Qoldau/БНС (заявка и сбор)" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left">
              <tr>
                <th className="px-5 py-2 font-medium">Хозяйство</th>
                <th className="px-3 py-2 font-medium">Поле / культура</th>
                <th className="px-3 py-2 font-medium">Бонитет / P / Cu</th>
                <th className="px-3 py-2 font-medium">Влагозарядка</th>
                <th className="px-3 py-2 font-medium text-right">Расчёт</th>
                <th className="px-3 py-2 font-medium text-right">Заявлено</th>
                <th className="px-3 py-2 font-medium">Решение</th>
              </tr>
            </thead>
            <tbody>
              {rows.sort((a, b) => b.verdict.riskScore - a.verdict.riskScore).map(({ f, field, season, meteo, exp, verdict, cropFindings }) => (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className="px-5 py-3">
                    <FarmerLink id={f.id}>{f.legalName}</FarmerLink>
                    <div className="text-xs text-foreground/60">{f.region.rayon}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-xs">{field.cadastralNumber}</div>
                    <div className="text-xs text-foreground/70">{CROP_LABEL[season.crop]} · {field.areaHa} га</div>
                    <div className="mt-1"><SourcePill source={field.source} /></div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div>балл {field.bonitet} · P {field.phosphorusMgKg} · Cu {field.copperMgKg}</div>
                    <div className="mt-1"><SourcePill source={field.agroSource} /></div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {meteo ? (
                      <>
                        <div>SW {meteo.swEqMm} мм{meteo.springWindStress ? " · бури" : ""}</div>
                        <div>прогрев {meteo.soilWarmDate}</div>
                        <div className="mt-1"><SourcePill source={meteo.source} /></div>
                      </>
                    ) : <span className="text-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div>{exp.expected} ц/га</div>
                    <div className="text-xs text-foreground/60">эталон {CROP_NORMS[season.crop].baseYieldCentnersHa}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className={season.declaredYieldCha > exp.expected * 1.3 ? "text-rose-700 font-semibold" : ""}>{season.declaredYieldCha} ц/га</div>
                    <div className="text-xs text-foreground/60">субс. {formatTenge(season.subsidyTenge)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <DecisionBadge d={verdict.decision} />
                      {cropFindings.map((x, i) => <SeverityBadge key={i} s={x.severity} />)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
