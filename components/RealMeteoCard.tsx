// Карточка реального метео для real-user досье. Отдельный компонент,
// чтобы стримиться через <Suspense> независимо от остальной страницы —
// fetchRealMeteo дёргает Open-Meteo и может занимать 1–3 секунды.

import { Card, CardHeader } from "@/components/ui";
import { fetchRealMeteo, decodeWeatherCode } from "@/lib/real-meteo";

export async function RealMeteoCard({
  lat, lng, year, label, className = "",
}: {
  lat: number; lng: number; year: number; label: string; className?: string;
}) {
  let data: Awaited<ReturnType<typeof fetchRealMeteo>>;
  try {
    data = await fetchRealMeteo(lat, lng, year);
  } catch (e) {
    return (
      <Card className={`p-5 bg-amber-50/60 border-amber-200 ${className}`}>
        <div className="text-sm text-amber-900">Метеоданные временно недоступны: {String(e)}</div>
      </Card>
    );
  }

  const c = data.current;
  const s = data.season;

  return (
    <Card className={className}>
      <CardHeader
        title={`Метео-сезон ${year - 1}-${year}`}
        subtitle={`Open-Meteo · ${label} · координаты ${lat.toFixed(3)}, ${lng.toFixed(3)}`}
        action={
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border bg-sky-100 text-sky-900 border-sky-300">
            ERA5 reanalysis
          </span>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-soft border-t border-border-soft">
        <Stat label="Сейчас" value={c.temperatureC != null ? `${c.temperatureC.toFixed(1)} °C` : "—"} sub={decodeWeatherCode(c.weatherCode)} />
        <Stat label="Снег" value={c.snowDepthCm != null ? `${c.snowDepthCm} см` : "—"} sub="на земле" />
        <Stat label="Ветер" value={c.windKmh != null ? `${c.windKmh.toFixed(0)} км/ч` : "—"} />
        <Stat label="Осадки" value={c.precipitationMm != null ? `${c.precipitationMm.toFixed(1)} мм` : "—"} sub="за час" />
      </div>
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-soft border-t border-border-soft">
          <Stat label="Снег. покров (вод. экв.)"
            value={`${s.snowWaterEquivMm} мм`}
            accent={s.snowWaterEquivMm < 100 ? "high" : s.snowWaterEquivMm < 150 ? "warn" : undefined} />
          <Stat label="Сход снега" value={s.snowMeltDate ?? "—"} />
          <Stat label="Прогрев почвы +8°C" value={s.soilWarmDate ?? "—"}
            sub={s.soilWarmDate ? `после ${s.soilWarmDate} безопасно сеять` : ""} />
          <Stat label="«Чёрные бури» апр-май"
            value={s.springWindStress ? "Зафиксированы" : "Нет"}
            sub={`макс. ветер ${s.springMaxWindKmh} км/ч`}
            accent={s.springWindStress ? "high" : undefined} />
          <Stat label="Минимум зимы" value={`${s.minWinterC} °C`} />
          <Stat label="Макс. высота снега" value={`${s.maxSnowDepthCm} см`} />
          <Stat label="Осадки авг–сен"
            value={`${s.augSepRainfallMm} мм`}
            sub={s.augSepRainfallMm > 130 ? "риск ухода под снег" : "в норме"}
            accent={s.augSepRainfallMm > 130 ? "warn" : undefined} />
          <Stat label="Снегопад за зиму" value={`${s.totalWinterSnowfallCm} см`} />
        </div>
      )}
      <div className="px-5 py-3 text-[11px] text-foreground/55 italic border-t border-border-soft">
        Это реальные данные ERA5 reanalysis по Open-Meteo (без ключа). Для точности по конкретному полю
        нужны координаты участка — пока используется центроид района Гипрозема.
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: "high" | "warn" }) {
  const cls = accent === "high" ? "text-rose-700" : accent === "warn" ? "text-amber-800" : "";
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-foreground/55 mt-0.5">{sub}</div>}
    </div>
  );
}
