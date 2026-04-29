import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveFarmerSession, farmerQuery } from "@/lib/farmer-context";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { meteoFor } from "@/lib/mock/meteo";
import { computeExpectedYield } from "@/lib/verify/crop";
import { CROP_LABEL } from "@/lib/types";
import { SOIL_REQUIREMENTS } from "@/lib/norms";
import { estimateYield } from "@/lib/yield-estimate";
import { Card, CardHeader, SourcePill, Stat } from "@/components/ui";
import { FarmerSwitcher } from "@/components/FarmerSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import type { UserField } from "@/lib/users-store";
import { OBLAST_NAMES, GIPROZEM_LAYERS } from "@/lib/giprozem-catalog";
import { coordsForKato } from "@/lib/region-coords";
import { computePhenologyAll, fmtRuShort, type PhenologyForCrop, type PhenologyWindow } from "@/lib/phenology";

function pastYearsDynamics(currentHumus: number, currentP: number) {
  return [
    { year: 2019, humus: +(currentHumus + 0.4).toFixed(2), p: Math.round(currentP + 5) },
    { year: 2021, humus: +(currentHumus + 0.2).toFixed(2), p: Math.round(currentP + 2) },
    { year: 2024, humus: currentHumus,                      p: currentP },
  ];
}

export default async function PassportPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const session = await resolveFarmerSession(as);
  if (!session) redirect("/login");

  const isReal = session.kind === "real";
  const farmer = session.farmer;
  const q = isReal ? "" : farmerQuery(farmer.id);

  // ── REAL MODE: рендерим из Гипрозем-привязок пользователя ──
  if (isReal) {
    const userFields = session.user.fields;
    return (
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-foreground/60">Цифровой паспорт · ваши хозяйства из Гипрозема</div>
              <h1 className="text-xl font-bold tracking-tight mt-1">{farmer.legalName}</h1>
              <div className="text-sm text-foreground/70 mt-0.5">{userFields.length} привязок · {userFields.reduce((s, f) => s + f.parcels, 0)} участков</div>
            </div>
            <LogoutButton />
          </div>
        </Card>

        {userFields.length === 0 ? (
          <Card className="p-6 text-center text-foreground/60">
            У вас не привязаны хозяйства. <Link href="/register" className="text-accent underline">Перерегистрируйтесь</Link>, чтобы прикрепить через Гипрозем.
          </Card>
        ) : (
          <div className="space-y-4">
            {userFields.map((uf) => <RealFieldCard key={`${uf.nazvxoz}-${uf.layerId}`} uf={uf} />)}
          </div>
        )}

        <div className="text-center">
          <Link href="/farmer" className="text-sm text-foreground/60 hover:underline">← В кабинет</Link>
        </div>
      </div>
    );
  }

  // ── DEMO MODE (старый код) ──
  const field = fieldFor(farmer.id);
  const season = seasonFor(farmer.id);
  const meteo = field ? meteoFor(field.region.katoCode, season?.year ?? 2024) : undefined;
  const expectedClassic = field && season ? computeExpectedYield(field, season, meteo) : null;
  const yld = field
    ? estimateYield(
        { n: field.nitrogenMgKg, p: field.phosphorusMgKg, k: field.potassiumMgKg, gum: field.humusPct, ph: 6.8 },
        season?.crop ?? "wheat_spring",
        field.areaHa
      )
    : null;
  const dyn = field ? pastYearsDynamics(field.humusPct, field.phosphorusMgKg) : [];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-foreground/60">Цифровой паспорт участка · демо</div>
            <h1 className="text-xl font-bold tracking-tight mt-1">{farmer.legalName}</h1>
            <div className="text-sm text-foreground/70 mt-0.5">{farmer.region.oblast}, {farmer.region.rayon}</div>
          </div>
          <FarmerSwitcher activeId={farmer.id} />
        </div>
      </Card>

      {!field ? (
        <Card className="p-6 text-center text-foreground/60">
          У вашего хозяйства не зарегистрировано полей в ЕГКН.
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={`Поле · кадастр ${field.cadastralNumber}`}
              subtitle={`${field.areaHa.toLocaleString("ru-KZ")} га · балл бонитета ${field.bonitet} · ${field.region.rayon}`}
              action={<SourcePill source={field.source} />}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
              <Param label="Гумус"    value={`${field.humusPct} %`} okIf={field.humusPct >= SOIL_REQUIREMENTS.humusPctMin} />
              <Param label="Фосфор P" value={`${field.phosphorusMgKg} мг/кг`} okIf={field.phosphorusMgKg >= SOIL_REQUIREMENTS.phosphorusMgKgMin} />
              <Param label="Калий K"  value={`${field.potassiumMgKg} мг/кг`} okIf={field.potassiumMgKg >= SOIL_REQUIREMENTS.potassiumMgKgMin} />
              <Param label="Азот N"   value={`${field.nitrogenMgKg} мг/кг`} okIf={field.nitrogenMgKg >= 60} />
              <Param label="Медь Cu"  value={`${field.copperMgKg} мг/кг`}  okIf={field.copperMgKg >= SOIL_REQUIREMENTS.copperMgKgMin} />
              <Param label="Цинк Zn"  value={`${field.zincMgKg} мг/кг`}    okIf={field.zincMgKg >= SOIL_REQUIREMENTS.zincMgKgMin} />
            </div>
          </Card>

          <section className="grid lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader title="Динамика по годам" subtitle="Гумус и фосфор за последние обследования (Гипрозем)" />
              <div className="px-5 pb-4">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-foreground/60">
                    <tr><th className="text-left py-1">Год</th><th className="text-right py-1">Гумус %</th><th className="text-right py-1">Тренд</th><th className="text-right py-1">P мг/кг</th><th className="text-right py-1">Тренд</th></tr>
                  </thead>
                  <tbody>
                    {dyn.map((d, i) => {
                      const prev = i > 0 ? dyn[i-1] : null;
                      const dh = prev ? d.humus - prev.humus : 0;
                      const dp = prev ? d.p - prev.p : 0;
                      const arr = (v: number) => v > 0.05 ? "↑" : v < -0.05 ? "↓" : "→";
                      const cls = (v: number) => v > 0.05 ? "text-emerald-700" : v < -0.05 ? "text-rose-700" : "text-foreground/50";
                      return (
                        <tr key={d.year} className="border-t border-border">
                          <td className="py-2 font-mono">{d.year}</td>
                          <td className="text-right tabular-nums">{d.humus.toFixed(2)}</td>
                          <td className={`text-right ${cls(dh)}`}>{prev ? arr(dh) : "—"}</td>
                          <td className="text-right tabular-nums">{d.p}</td>
                          <td className={`text-right ${cls(dp)}`}>{prev ? arr(dp) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardHeader title="Потенциал и прогноз" subtitle="Что земля может дать с учётом агрохимии и погоды" />
              <div className="grid grid-cols-2 gap-3 p-5">
                {expectedClassic && (
                  <Stat label="Потенциал поля" value={`${expectedClassic.expected} ц/га`} sub={`эталон ${expectedClassic.base}`} />
                )}
                {yld && (
                  <Stat label="Лимитирующий" value={yld.limiting.name} sub={`${yld.limiting.value}`}
                    accent={yld.limiting.status === "crit" ? "high" : yld.limiting.status === "warn" ? "warn" : "ok"} />
                )}
                <Stat label="Площадь" value={`${field.areaHa} га`} />
                {yld?.expectedHaTotal != null && <Stat label="Прогноз сбора" value={`${yld.expectedHaTotal.toFixed(0)} т`} />}
              </div>
            </Card>
          </section>

          <PhenologyBlock
            year={season?.year ?? new Date().getFullYear()}
            lat={coordsForKato(field.region.katoCode)?.lat ?? 52}
            label={`${field.region.rayon}, ${field.region.oblast}`}
          />

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Сверить с реальными данными Гипрозема</div>
                <div className="text-xs text-foreground/60 mt-1">
                  Откройте свой ИНН в порте agrohimobsledования — получите актуальные слои всех ваших участков.
                </div>
              </div>
              <Link
                href={`/giprozem?q=${encodeURIComponent(farmer.legalName.replace(/^(ТОО|КХ|ИП|АО)\s+«?/, "").replace(/[«»"]/g, ""))}`}
                className="text-sm bg-emerald-600 text-white px-3 py-2 rounded hover:bg-emerald-700"
              >
                Открыть в Гипрозем live →
              </Link>
            </div>
          </Card>
        </>
      )}

      <div className="text-center">
        <Link href={`/farmer${q}`} className="text-sm text-foreground/60 hover:underline">← Вернуться в кабинет</Link>
      </div>
    </div>
  );
}

function RealFieldCard({ uf }: { uf: UserField }) {
  const oblastName = OBLAST_NAMES[uf.oblastCode] ?? uf.oblastCode;
  const a = uf.sample ?? {};
  const yld = estimateYield(
    { n: a.n ?? null, p: a.p ?? null, k: a.k ?? null, gum: a.gum ?? null, ph: a.ph ?? null },
    "wheat_spring",
    a.s ?? undefined
  );
  // Координаты центра слоя Гипрозема — для фенологического сдвига по широте.
  // Если слой не найден (что маловероятно) — fallback на 52° (северный пояс).
  const layer = GIPROZEM_LAYERS.find((l) => l.id === uf.layerId);
  const lat = layer?.centroid[0] ?? 52;
  return (
    <Card>
      <CardHeader
        title={uf.nazvxoz}
        subtitle={`${oblastName} · слой ${uf.layerName} · ${uf.parcels} участок(ов) · обследование ${a.yearob ?? "?"}`}
        action={
          <Link href={`/giprozem?q=${encodeURIComponent(uf.nazvxoz)}`} className="text-xs text-accent underline">
            открыть в Гипрозем live →
          </Link>
        }
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
        <Param label="Гумус"    value={a.gum != null ? `${a.gum.toFixed(2)} %` : "—"}     okIf={(a.gum ?? 0) >= SOIL_REQUIREMENTS.humusPctMin} />
        <Param label="Фосфор P" value={a.p != null ? `${a.p.toFixed(1)} мг/кг` : "—"}    okIf={(a.p ?? 0) >= SOIL_REQUIREMENTS.phosphorusMgKgMin} />
        <Param label="Калий K"  value={a.k != null ? `${a.k.toFixed(0)} мг/кг` : "—"}    okIf={(a.k ?? 0) >= SOIL_REQUIREMENTS.potassiumMgKgMin} />
        <Param label="Азот N"   value={a.n != null ? `${a.n.toFixed(1)} мг/кг` : "—"}    okIf={(a.n ?? 0) >= 60} />
        <Param label="pH"       value={a.ph != null ? a.ph.toFixed(2) : "—"}             okIf={(a.ph ?? 0) >= 5.5 && (a.ph ?? 0) <= 8.0} />
        <Param label="Площадь"  value={a.s != null ? `${a.s.toFixed(0)} га` : "—"}        okIf={true} />
      </div>
      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Бонитет (≈ по гумусу)" value={`${yld.bonitetEst.toFixed(0)}`} />
          <Stat
            label="Ожидаемый ц/га (пшеница яр.)"
            value={`${yld.expected}`}
            sub={`лимит: ${yld.limiting.name}`}
            accent={yld.limiting.status === "crit" ? "high" : yld.limiting.status === "warn" ? "warn" : "ok"}
          />
          {yld.expectedHaTotal != null && <Stat label="Прогноз сбора" value={`${yld.expectedHaTotal} т`} />}
        </div>
      </div>
      <div className="px-5 pb-5">
        <PhenologyBlock year={new Date().getFullYear()} lat={lat} label={`${oblastName} (центроид слоя)`} compact />
      </div>
    </Card>
  );
}

function Param({ label, value, okIf }: { label: string; value: string; okIf: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${okIf ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}>
      <div className="text-[11px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={`text-base font-bold mt-0.5 ${okIf ? "text-emerald-900" : "text-rose-900"}`}>{value}</div>
      <div className={`text-[11px] mt-1 ${okIf ? "text-emerald-700" : "text-rose-700"}`}>{okIf ? "в норме" : "ниже нормы"}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Календарь полевых работ — оптимальные сроки сева, гербицидной, уборки.
// `compact`: внутри RealFieldCard рендерим без обёртки <Card> (карточка уже
// есть снаружи) — иначе двойная рамка.
// ────────────────────────────────────────────────────────────────────────────
function PhenologyBlock({ year, lat, label, compact = false }: { year: number; lat: number; label: string; compact?: boolean }) {
  const all = computePhenologyAll(year, lat);
  const inner = (
    <>
      <div className="px-5 pt-4 pb-1">
        <div className="text-sm font-semibold tracking-tight">Календарь полевых работ · {year}</div>
        <div className="text-xs text-foreground/60 mt-0.5">{label} · по агрономическим нормам и широте {lat.toFixed(1)}°</div>
      </div>
      <div className="p-4 pt-3 space-y-2.5">
        {all.map((p) => <PhenoRow key={p.crop} p={p} />)}
      </div>
      <div className="px-5 pb-4 text-[11px] text-foreground/55 italic">
        Оценка по нормам региона. Не учитывает текущий сезон — окно сева может смещаться по факту прогрева почвы.
      </div>
    </>
  );
  if (compact) {
    return <div className="border border-border-soft rounded-2xl bg-muted/30">{inner}</div>;
  }
  return <Card>{inner}</Card>;
}

function PhenoRow({ p }: { p: PhenologyForCrop }) {
  return (
    <div className="border border-border-soft rounded-xl p-3 bg-card">
      <div className="text-sm font-semibold mb-2">{CROP_LABEL[p.crop]}</div>
      <div className="grid grid-cols-3 gap-2">
        <PhenoCell title="Сев"          win={p.sowing}  color="emerald" />
        <PhenoCell title="Гербицидная"  win={p.weeding} color="amber" />
        <PhenoCell title="Уборка"       win={p.harvest} color="sky" />
      </div>
    </div>
  );
}

function PhenoCell({ title, win, color }: { title: string; win: PhenologyWindow; color: "emerald" | "amber" | "sky" }) {
  const cls: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber:   "bg-amber-50 border-amber-200 text-amber-900",
    sky:     "bg-sky-50 border-sky-200 text-sky-900",
  };
  return (
    <div className={`border rounded-lg px-3 py-2 ${cls[color]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{title}</div>
      <div className="text-base font-bold leading-tight mt-0.5">{fmtRuShort(win.optimal)}</div>
      <div className="text-[10.5px] mt-0.5 opacity-80">окно: {fmtRuShort(win.from)} – {fmtRuShort(win.to)}</div>
      <div className="text-[10px] mt-1 italic opacity-70 leading-tight">{win.hint}</div>
    </div>
  );
}
