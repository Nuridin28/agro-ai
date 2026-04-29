import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveFarmerSession, farmerQuery } from "@/lib/farmer-context";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { pastureFor, herdFor } from "@/lib/mock/livestock";
import { coordsForKato, type KatoPoint } from "@/lib/region-coords";
import { fetchRealMeteo, decodeWeatherCode, type RealMeteo, type LongTermPrecip } from "@/lib/real-meteo";
import { Card, CardHeader, Stat } from "@/components/ui";
import { FarmerSwitcher } from "@/components/FarmerSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import { AiInsight } from "@/components/AiInsight";
import { expectedWinterFeedKgPerHead } from "@/lib/norms";
import { findLayer, OBLAST_NAMES } from "@/lib/giprozem-catalog";
import type { UserField } from "@/lib/users-store";

const LONG_TERM_YEARS = 6;

interface Notice {
  level: "info" | "warn" | "alert";
  title: string;
  body: string;
  ndoc?: string;
}

function buildNotices(meteo: RealMeteo, hasCrop: boolean, hasLivestock: boolean): Notice[] {
  const out: Notice[] = [];
  const s = meteo.season;
  const c = meteo.current;

  if (c.snowDepthCm != null && c.snowDepthCm > 30) {
    out.push({ level: "info", title: "Сейчас на полях глубокий снег",
      body: `Текущий снежный покров — ${c.snowDepthCm.toFixed(0)} см. Учитывайте при планировании весенних работ.` });
  }
  if (c.temperatureC != null && c.temperatureC < -25) {
    out.push({ level: "warn", title: "Текущая температура критическая",
      body: `Сейчас ${c.temperatureC.toFixed(1)}°C. Если содержите скот — увеличьте суточный рацион на 20–30%.` });
  }

  if (s) {
    if (hasCrop) {
      if (s.snowWaterEquivMm < 100) {
        out.push({ level: "alert", title: "Дефицит влаги (Natural Loss · засуха)",
          body: `За зиму ${s.year - 1}/${s.year} выпало ${s.totalWinterSnowfallCm.toFixed(0)} см снега, водный эквивалент ~${s.snowWaterEquivMm} мм. Это острый дефицит. Подайте акт о страховом риске до начала уборки — ДЭР учтёт его.`,
          ndoc: `NL-DRY-${meteo.lat.toFixed(2)}-${s.year}` });
      } else if (s.snowWaterEquivMm < 150) {
        out.push({ level: "warn", title: "Низкая влагозарядка",
          body: `Влагозапас ниже нормы (${s.snowWaterEquivMm} мм при 150–200). Заложите в план риск 10–15% к урожайности.`,
          ndoc: `NL-DRY-${meteo.lat.toFixed(2)}-${s.year}` });
      }
      if (s.springWindStress) {
        out.push({ level: "warn", title: "Сильный ветер весной (риск «черных бурь»)",
          body: `Максимальный ветер ${s.springMaxWindKmh} км/ч в апреле–мае. Часть влаги ушла. Можно подать дополнение к страховому акту.`,
          ndoc: `NL-WIND-${meteo.lat.toFixed(2)}-${s.year}` });
      }
      if (s.soilWarmDate && new Date(s.soilWarmDate).getMonth() >= 4) {
        out.push({ level: "info", title: "Поздний прогрев почвы",
          body: `Почва на глубине 28–100 см прогрелась до +8°C только ${s.soilWarmDate}. Не указывайте в Qoldau дату посева раньше этого числа — это вызовет автоматический флаг «фиктивный посев».` });
      }
      if (s.augSepRainfallMm > 130) {
        out.push({ level: "warn", title: "Аномальные осадки в уборку",
          body: `За август–сентябрь ${s.augSepRainfallMm} мм осадков. Риск прорастания зерна и ухода под снег.`,
          ndoc: `NL-RAIN-${meteo.lat.toFixed(2)}-${s.year}` });
      }
    }
    if (hasLivestock) {
      if (s.minWinterC < -35 || s.maxSnowDepthCm > 50) {
        const need = expectedWinterFeedKgPerHead(s.minWinterC, s.maxSnowDepthCm);
        out.push({ level: "alert", title: "Тяжёлая зимовка",
          body: `Минимум ${s.minWinterC}°C, снег до ${s.maxSnowDepthCm} см. Расчётная норма расхода кормов — около ${need} кг/гол. Если у вас в заявке меньше — добавьте, иначе ДЭР спросит, как поголовье выжило.`,
          ndoc: `NL-WINTER-${meteo.lat.toFixed(2)}-${s.year}` });
      }
    }
  }

  if (out.length === 0) {
    out.push({ level: "info", title: "Обстановка штатная",
      body: "Метеоусловия в норме, страховых рисков не зарегистрировано." });
  }
  return out;
}

interface FieldLocation {
  key: string;            // уникальный ключ карточки
  title: string;          // что показываем над карточкой (название хозяйства)
  subtitle: string;       // регион, район, источник координат
  coords: KatoPoint;
  hasCrop: boolean;
  hasLivestock: boolean;
  year: number;
}

export default async function MeteoPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const session = await resolveFarmerSession(as);
  if (!session) redirect("/login");

  const isReal = session.kind === "real";
  const farmer = session.farmer;
  const q = isReal ? "" : farmerQuery(farmer.id);

  // Список локаций для меоассистента: одна карточка для демо-фермера, либо
  // по одной на каждое привязанное поле реального пользователя.
  const locations: FieldLocation[] = [];

  if (isReal) {
    for (const uf of session.user.fields) {
      const layer = findLayer(uf.layerId);
      if (!layer) continue;
      const oblastName = OBLAST_NAMES[uf.oblastCode] ?? uf.oblastCode;
      locations.push({
        key: `${uf.nazvxoz}-${uf.layerId}`,
        title: uf.nazvxoz,
        subtitle: `${oblastName} · слой ${uf.layerName} · ${uf.parcels} участок(ов)`,
        coords: {
          lat: layer.centroid[0],
          lng: layer.centroid[1],
          label: `${oblastName} · ${uf.layerName}`,
        },
        hasCrop: true,         // у Гипрозема всё земледелие
        hasLivestock: false,
        year: new Date().getFullYear(),
      });
    }
  } else {
    const field = fieldFor(farmer.id);
    const pasture = pastureFor(farmer.id);
    const season = seasonFor(farmer.id);
    const herd = herdFor(farmer.id);
    const kato = field?.region.katoCode ?? pasture?.region.katoCode ?? farmer.region.katoCode;
    const coords = coordsForKato(kato);
    if (coords) {
      locations.push({
        key: farmer.id,
        title: farmer.legalName,
        subtitle: `${farmer.region.oblast}, ${farmer.region.rayon}`,
        coords,
        hasCrop: !!field,
        hasLivestock: !!pasture,
        year: season?.year ?? herd?.year ?? new Date().getFullYear(),
      });
    }
  }

  // Параллельно тянем погоду для каждой локации, включая долгосрочные осадки.
  const meteos = await Promise.all(
    locations.map(async (loc) => {
      try {
        const meteo = await fetchRealMeteo(loc.coords.lat, loc.coords.lng, loc.year, { longTermYears: LONG_TERM_YEARS });
        return { loc, meteo, error: null as string | null };
      } catch (e) {
        return { loc, meteo: null as RealMeteo | null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-foreground/60">Метео-ассистент · live · open-meteo.com</div>
            <h1 className="text-xl font-bold tracking-tight mt-1">{farmer.legalName}</h1>
            <div className="text-sm text-foreground/70 mt-0.5">
              {isReal
                ? `${session.user.fields.length} привязок Гипрозема · погода тянется по центру каждого района`
                : (locations[0]?.coords.label ?? `${farmer.region.oblast}, ${farmer.region.rayon}`)}
            </div>
          </div>
          {isReal ? <LogoutButton /> : <FarmerSwitcher activeId={farmer.id} />}
        </div>
      </Card>

      {locations.length === 0 ? (
        <Card className="p-6 text-center text-foreground/60">
          {isReal
            ? <>У вас не привязаны поля Гипрозема. <Link className="text-accent underline" href="/register">Привязать</Link>.</>
            : "Координаты района не определены. Это режим демо."}
        </Card>
      ) : (
        meteos.map(({ loc, meteo, error }) => (
          <LocationBlock key={loc.key} loc={loc} meteo={meteo} error={error} showHeader={meteos.length > 1} />
        ))
      )}

      <div className="text-center">
        <Link href={isReal ? "/farmer" : `/farmer${q}`} className="text-sm text-foreground/60 hover:underline">← Вернуться в кабинет</Link>
      </div>
    </div>
  );
}

function LocationBlock({ loc, meteo, error, showHeader }: { loc: FieldLocation; meteo: RealMeteo | null; error: string | null; showHeader: boolean }) {
  if (error) {
    return (
      <Card className="p-6 text-rose-700">
        {showHeader && <div className="text-sm font-semibold mb-1">{loc.title}</div>}
        Ошибка получения погоды: {error}
      </Card>
    );
  }
  if (!meteo) {
    return <Card className="p-6 text-foreground/60">Загрузка…</Card>;
  }

  const c = meteo.current;
  const s = meteo.season;
  const notices = buildNotices(meteo, loc.hasCrop, loc.hasLivestock);

  return (
    <section className="space-y-4">
      {showHeader && (
        <div className="px-1 pt-2">
          <h2 className="text-base font-semibold tracking-tight">{loc.title}</h2>
          <div className="text-xs text-foreground/60">{loc.subtitle} · координаты <span className="font-mono">{loc.coords.lat.toFixed(3)}, {loc.coords.lng.toFixed(3)}</span></div>
        </div>
      )}

      <Card>
        <CardHeader title="Сейчас в районе" subtitle={`Обновлено ${new Date(c.time).toLocaleString("ru-KZ")} (open-meteo.com)`} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
          <Stat label="Температура воздуха" value={c.temperatureC != null ? `${c.temperatureC.toFixed(1)} °C` : "—"} sub={decodeWeatherCode(c.weatherCode ?? null)} />
          <Stat label="Снежный покров" value={c.snowDepthCm != null ? `${c.snowDepthCm.toFixed(1)} см` : "—"} />
          <Stat label="Осадки" value={c.precipitationMm != null ? `${c.precipitationMm.toFixed(1)} мм/ч` : "—"} />
          <Stat label="Ветер" value={c.windKmh != null ? `${c.windKmh.toFixed(0)} км/ч` : "—"} />
          <Stat label="Прогноз 7 дней (макс. t°)" value={`${meteo.forecast7days.reduce((m, d) => Math.max(m, d.tmax), -99).toFixed(0)} °C`} sub={`мин: ${meteo.forecast7days.reduce((m, d) => Math.min(m, d.tmin), 99).toFixed(0)} °C`} />
        </div>
      </Card>

      {s && (
        <Card>
          <CardHeader title={`Зимний и вегетационный сезон ${s.year - 1}–${s.year}`} subtitle="Историческая выборка ERA5 reanalysis (Copernicus / Open-Meteo)" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
            <Stat label="Снежный экв. (мм)" value={`${s.snowWaterEquivMm}`} sub={`всего ${s.totalWinterSnowfallCm.toFixed(0)} см снегопадов`} accent={s.snowWaterEquivMm < 130 ? "warn" : "ok"} />
            <Stat label="Сход снега" value={s.snowMeltDate ?? "—"} />
            <Stat label="Прогрев почвы" value={s.soilWarmDate ?? "—"} sub="до +8°C на 28-100см" />
            <Stat label="Мин. зимняя t°" value={`${s.minWinterC.toFixed(1)} °C`} accent={s.minWinterC < -35 ? "high" : "ok"} />
            <Stat label="Макс. снег за зиму" value={`${s.maxSnowDepthCm} см`} accent={s.maxSnowDepthCm > 50 ? "warn" : "ok"} />
            <Stat label="Макс. ветер весной" value={`${s.springMaxWindKmh} км/ч`} sub={s.springWindStress ? "«чёрные бури»" : "нормально"} accent={s.springWindStress ? "warn" : "ok"} />
            <Stat label="Осадки авг–сен" value={`${s.augSepRainfallMm} мм`} accent={s.augSepRainfallMm > 130 ? "warn" : "ok"} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`Уведомления и страховые риски · ${notices.length}`} subtitle="С актом Natural Loss ДЭР учтёт отклонения от плана объективно." />
        <div className="divide-y divide-border">
          {notices.map((n, i) => <NoticeRow key={i} n={n} />)}
        </div>
      </Card>

      {meteo.longTerm && <LongTermPrecipBlock lt={meteo.longTerm} />}

      <AiInsight
        mode="meteo_advisor"
        coords={{ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.title }}
        year={loc.year}
        description="OpenAI-агроклиматолог проанализирует многолетние осадки, текущий сезон и даст советы: что и когда сеять, как страховаться, на что обратить внимание."
        buttonLabel="Получить совет агроклиматолога"
      />

      <Card className="p-5">
        <div className="text-sm font-semibold mb-2">Прогноз погоды на 7 дней</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/60">
              <tr><th className="text-left py-1">Дата</th><th className="text-right py-1">Мин t°</th><th className="text-right py-1">Макс t°</th><th className="text-right py-1">Осадки, мм</th></tr>
            </thead>
            <tbody>
              {meteo.forecast7days.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-2 font-mono text-xs">{d.date}</td>
                  <td className="text-right tabular-nums">{d.tmin.toFixed(0)}</td>
                  <td className="text-right tabular-nums">{d.tmax.toFixed(0)}</td>
                  <td className="text-right tabular-nums">{d.precipMm.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

const MONTH_NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function LongTermPrecipBlock({ lt }: { lt: LongTermPrecip }) {
  const years = lt.yearly.map((y) => y.year);
  // Грид: строки = годы (по убыванию), колонки = 12 месяцев
  const yearMonthMap = new Map<string, { mm: number; partial: boolean }>();
  for (const m of lt.monthly) yearMonthMap.set(`${m.year}-${m.month}`, { mm: m.mm, partial: m.partial });

  const maxMonthMm = Math.max(1, ...lt.monthly.map((m) => m.mm));
  const yearsDesc = [...years].sort((a, b) => b - a);

  const last = lt.yearly[lt.yearly.length - 1];
  const annualAvg = lt.multiYearAnnualAvg;

  return (
    <Card>
      <CardHeader
        title={`Осадки · многолетний анализ ${lt.fromYear}–${lt.toYear}`}
        subtitle={`Ежемесячные и годовые суммы по ERA5. Многолетнее среднее ≈ ${annualAvg} мм/год${last?.partial ? " (текущий год — YTD)" : ""}`}
      />
      <div className="px-5 pt-3 pb-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-foreground/60">
              <tr>
                <th className="text-left py-1 pr-3">Год</th>
                {MONTH_NAMES.map((m) => <th key={m} className="text-right py-1 px-1 font-medium">{m}</th>)}
                <th className="text-right py-1 pl-3 font-medium">Σ год</th>
                <th className="text-right py-1 pl-3 font-medium">Δ ср.</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border bg-muted/30">
                <td className="py-1.5 pr-3 font-medium text-foreground/70">мн. среднее</td>
                {lt.multiYearMonthlyAvg.map((m) => (
                  <td key={m.month} className="text-right py-1.5 px-1 tabular-nums text-foreground/70">{m.mm}</td>
                ))}
                <td className="text-right py-1.5 pl-3 tabular-nums font-semibold">{annualAvg}</td>
                <td className="text-right py-1.5 pl-3 text-foreground/40">—</td>
              </tr>
              {yearsDesc.map((y) => {
                const yearRow = lt.yearly.find((r) => r.year === y);
                return (
                  <tr key={y} className="border-t border-border">
                    <td className="py-1.5 pr-3 font-mono">{y}{yearRow?.partial ? " *" : ""}</td>
                    {MONTH_NAMES.map((_, i) => {
                      const cell = yearMonthMap.get(`${y}-${i + 1}`);
                      if (!cell) return <td key={i} className="text-right py-1.5 px-1 text-foreground/30">—</td>;
                      const intensity = Math.min(1, cell.mm / maxMonthMm);
                      const bg = intensity > 0
                        ? `rgba(14, 116, 144, ${0.08 + intensity * 0.55})`
                        : "transparent";
                      // При высокой интенсивности фон тёмный — переключаем цвет цифр на белый,
                      // иначе текст сливается. Порог подобран под gradient выше.
                      const fg = intensity >= 0.55 ? "#ffffff" : undefined;
                      return (
                        <td key={i} className="text-right py-1.5 px-1 tabular-nums font-medium" style={{ background: bg, color: fg }}
                          title={`${y}-${String(i + 1).padStart(2, "0")}: ${cell.mm} мм${cell.partial ? " (месяц не завершён)" : ""}`}>
                          {cell.mm}
                        </td>
                      );
                    })}
                    <td className="text-right py-1.5 pl-3 tabular-nums font-semibold">{yearRow?.mm ?? 0}</td>
                    <td className={`text-right py-1.5 pl-3 tabular-nums ${yearRow && yearRow.vsAvgPct < -15 ? "text-rose-700" : yearRow && yearRow.vsAvgPct > 15 ? "text-sky-700" : "text-foreground/60"}`}>
                      {yearRow ? `${yearRow.vsAvgPct > 0 ? "+" : ""}${yearRow.vsAvgPct.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-foreground/60">
          * — год не завершён, сумма указана на текущую дату. Цветом выделена интенсивность месячных осадков. Δ ср. — отклонение годовой суммы от многолетнего среднего.
        </div>
      </div>
    </Card>
  );
}

function NoticeRow({ n }: { n: Notice }) {
  const cls: Record<string, string> = {
    info:  "bg-sky-50 border-sky-200 text-sky-900",
    warn:  "bg-amber-50 border-amber-200 text-amber-900",
    alert: "bg-rose-50 border-rose-200 text-rose-900",
  };
  const label: Record<string, string> = { info: "инфо", warn: "внимание", alert: "критично" };
  return (
    <div className="px-5 py-4 flex items-start gap-3">
      <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls[n.level]} shrink-0 mt-0.5`}>
        {label[n.level]}
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold">{n.title}</div>
        <div className="text-sm text-foreground/80 mt-1">{n.body}</div>
        {n.ndoc && (
          <div className="mt-2 text-xs flex items-center gap-2">
            <span className="text-foreground/60">Код страхового акта:</span>
            <code className="kbd">{n.ndoc}</code>
            <button className="text-emerald-700 hover:underline" disabled>Сформировать (демо)</button>
          </div>
        )}
      </div>
    </div>
  );
}
