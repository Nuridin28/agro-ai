// Карточка спутниковой проверки в инспекторском детальном виде.
//
// Содержит:
//  1. Заголовок с риск-флагом и провайдером
//  2. Ряд из 3 миниатюр (true-color и/или NDVI-карта) — если provider их даёт
//  3. Grid основных параметров (NDVI max/mean, вегетация, посев, старт, пик)
//  4. Grid расширенных параметров для решения (σ поля, скорость прироста,
//     дни до пика, длина сезона)
//  5. YoY-блок: сравнение с прошлым годом
//  6. Список причин/предупреждений
//  7. Inactivity-баджик с метаданными

import type {
  SatelliteVerification,
  InactivityCheckResult,
  RiskFlag,
  InactivityLevel,
  SatelliteImage,
  YearOverYear,
  NDVIFeatures,
} from "@/lib/satellite/types";
import { Card, CardHeader, SourcePill } from "@/components/ui";
import { SatelliteImageThumb } from "@/components/SatelliteImageThumb";

const RISK_BG: Record<RiskFlag, string> = {
  LOW:    "bg-emerald-100 text-emerald-900 border-emerald-300",
  MEDIUM: "bg-amber-100 text-amber-900 border-amber-300",
  HIGH:   "bg-rose-100 text-rose-900 border-rose-300",
};

const INACT_BG: Record<InactivityLevel, string> = {
  OK:         "bg-emerald-50 text-emerald-800 border-emerald-200",
  WATCH:      "bg-sky-50 text-sky-800 border-sky-200",
  SUSPICIOUS: "bg-amber-50 text-amber-800 border-amber-200",
  ALERT:      "bg-rose-50 text-rose-800 border-rose-200",
};

const INACT_LABEL: Record<InactivityLevel, string> = {
  OK:         "Активность есть",
  WATCH:      "Окно открыто",
  SUSPICIOUS: "Подозрение",
  ALERT:      "Алерт",
};

const VEG_LABEL: Record<string, string> = {
  none:   "не обнаружена",
  weak:   "слабая",
  medium: "средняя",
  strong: "сильная",
};

interface Props {
  spatial: SatelliteVerification;
  inactivity: InactivityCheckResult;
  className?: string;
}

export function SatelliteCard({ spatial, inactivity, className = "" }: Props) {
  const f = spatial.features;
  const insufficient = spatial.status === "INSUFFICIENT_DATA";

  return (
    <Card className={className}>
      <CardHeader
        title="Спутниковая верификация · NDVI"
        subtitle={`Sentinel-2 · окно ${spatial.window.startDate} → ${spatial.window.endDate} · провайдер ${spatial.provider}`}
        action={
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-md border ${RISK_BG[spatial.riskFlag]}`}>
              RISK · {spatial.riskFlag}
            </span>
            <SourcePill source={spatial.source} />
          </div>
        }
      />

      {insufficient ? (
        <div className="px-5 py-4 text-sm text-amber-900 bg-amber-50/60 border-t border-border-soft">
          Недостаточно ясных снимков для расчёта признаков. Это не «фрод», а статус
          INSUFFICIENT_DATA — проверка повторится на следующей неделе по cron.
        </div>
      ) : f ? (
        <>
          {spatial.images && spatial.images.length > 0 && (
            <ImageStrip images={spatial.images} />
          )}
          <BasicGrid f={f} sowingDetected={spatial.sowingDetected} vegetationLevel={spatial.vegetationLevel} />
          <ExtendedGrid f={f} />
          {spatial.yoy && <YoYBlock yoy={spatial.yoy} currentMax={f.ndviMax} />}
        </>
      ) : null}

      {spatial.reasons.length > 0 && (
        <ul className="px-5 py-3 text-xs text-foreground/80 list-disc list-inside space-y-0.5 border-t border-border-soft">
          {spatial.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      <div className="border-t border-border-soft px-5 py-3 flex flex-wrap items-start gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${INACT_BG[inactivity.level]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current mr-1" />
            Inactivity · {INACT_LABEL[inactivity.level]}
          </span>
          <span className="text-xs text-foreground/70">
            baseline {inactivity.baselineDate} · проверено до {inactivity.checkedThrough}
          </span>
        </div>
        <div className="text-xs text-foreground/70 tabular-nums">
          {inactivity.baselineNDVI !== null && <>NDVI<sub>0</sub> {inactivity.baselineNDVI.toFixed(2)} · </>}
          {inactivity.recentNDVIMax !== null && <>NDVI<sub>max</sub> {inactivity.recentNDVIMax.toFixed(2)} · </>}
          {inactivity.deltaNDVI !== null && <>Δ {inactivity.deltaNDVI > 0 ? "+" : ""}{inactivity.deltaNDVI.toFixed(2)} · </>}
          {inactivity.observationsInWindow} набл.
        </div>
      </div>
      {inactivity.reasons.length > 0 && (inactivity.level === "SUSPICIOUS" || inactivity.level === "ALERT") && (
        <ul className="px-5 pb-3 text-xs text-rose-800/90 list-disc list-inside space-y-0.5">
          {inactivity.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </Card>
  );
}

function ImageStrip({ images }: { images: SatelliteImage[] }) {
  return (
    <div className="border-t border-border-soft bg-muted/30 px-5 py-3">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60 mb-2">Снимки Sentinel-2</div>
      <div className="grid grid-cols-3 gap-2">
        {images.map((img, i) => <SatelliteImageThumb key={i} image={img} />)}
      </div>
    </div>
  );
}

function BasicGrid({
  f, sowingDetected, vegetationLevel,
}: {
  f: NDVIFeatures;
  sowingDetected: boolean;
  vegetationLevel: SatelliteVerification["vegetationLevel"];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-soft border-t border-border-soft">
      <Stat label="NDVI max"    value={f.ndviMax.toFixed(3)} accent={f.ndviMax < 0.30 ? "high" : undefined} />
      <Stat label="NDVI mean"   value={f.ndviMean.toFixed(3)} />
      <Stat label="Вегетация"   value={VEG_LABEL[vegetationLevel] ?? vegetationLevel}
            accent={vegetationLevel === "none" || vegetationLevel === "weak" ? "high" : undefined} />
      <Stat label="Посев"       value={sowingDetected ? "обнаружен" : "не обнаружен"} accent={sowingDetected ? undefined : "high"} />
      <Stat label="Старт роста" value={f.growthStartDate ?? "—"} />
      <Stat label="Пик NDVI"    value={f.peakDate ?? "—"} />
      <Stat label="Снимков"     value={`${f.pointsUsed} / ${f.pointsUsed + f.pointsDropped}`} />
      <Stat label="Облачных"    value={`${f.pointsDropped}`} />
    </div>
  );
}

function ExtendedGrid({ f }: { f: NDVIFeatures }) {
  return (
    <div className="border-t border-border-soft bg-muted/20 px-5 py-3">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60 mb-2">
        Расширенные параметры решения
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SmallStat
          label="Гетерогенность поля (σ)"
          value={f.heterogeneityStdev !== null ? f.heterogeneityStdev.toFixed(3) : "—"}
          hint={f.heterogeneityStdev !== null && f.heterogeneityStdev >= 0.16 ? "мозаичная пашня" : "однородное поле"}
          accent={f.heterogeneityStdev !== null && f.heterogeneityStdev >= 0.16 ? "warn" : undefined}
        />
        <SmallStat
          label="Скорость прироста NDVI/день"
          value={f.growthRateNdviPerDay !== null ? f.growthRateNdviPerDay.toFixed(4) : "—"}
          hint={f.growthRateNdviPerDay !== null
            ? f.growthRateNdviPerDay < 0.008 ? "медленно для зерновых" : "норма"
            : ""}
          accent={f.growthRateNdviPerDay !== null && f.growthRateNdviPerDay < 0.008 ? "warn" : undefined}
        />
        <SmallStat
          label="Дни до пика"
          value={f.daysToPeak !== null ? `${f.daysToPeak} дн.` : "—"}
          hint="от старта роста до peakDate"
        />
        <SmallStat
          label="Длина сезона"
          value={f.seasonLengthDays !== null ? `${f.seasonLengthDays} дн.` : "—"}
          hint="green-up до falloff"
        />
      </div>
    </div>
  );
}

function YoYBlock({ yoy, currentMax }: { yoy: YearOverYear; currentMax: number }) {
  const dropAccent = yoy.ndviMaxDelta !== null && yoy.ndviMaxDelta <= -0.20;
  return (
    <div className="border-t border-border-soft bg-muted/20 px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-foreground/60">
          Сравнение с {yoy.previousYear} годом (Year-over-Year)
        </div>
        {yoy.ndviMaxDelta !== null && (
          <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded border ${dropAccent ? "bg-rose-50 text-rose-800 border-rose-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"}`}>
            Δ NDVI<sub>max</sub> {yoy.ndviMaxDelta > 0 ? "+" : ""}{yoy.ndviMaxDelta.toFixed(2)}
          </span>
        )}
      </div>
      {yoy.ndviMaxPrev === null ? (
        <div className="text-xs text-foreground/70">Данных за {yoy.previousYear} недостаточно для сравнения.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SmallStat label={`NDVI max ${yoy.previousYear}`} value={yoy.ndviMaxPrev.toFixed(3)} />
          <SmallStat label="NDVI max сейчас" value={currentMax.toFixed(3)} accent={dropAccent ? "warn" : undefined} />
          <SmallStat
            label="Старт вегетации"
            value={yoy.growthStartPrev ?? "—"}
            hint={yoy.growthStartDeltaDays !== null ? `Δ ${yoy.growthStartDeltaDays > 0 ? "+" : ""}${yoy.growthStartDeltaDays} дн.` : ""}
            accent={yoy.growthStartDeltaDays !== null && yoy.growthStartDeltaDays > 14 ? "warn" : undefined}
          />
          <SmallStat label="Тренд" value={dropAccent ? "↓ деградация" : (yoy.ndviMaxDelta !== null && yoy.ndviMaxDelta >= 0.05 ? "↑ улучшение" : "стабильно")}
            accent={dropAccent ? "warn" : undefined} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "high" }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${accent === "high" ? "text-rose-700" : ""}`}>{value}</div>
    </div>
  );
}

function SmallStat({
  label, value, hint, accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: "warn";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${accent === "warn" ? "text-amber-800" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-foreground/55 mt-0.5">{hint}</div>}
    </div>
  );
}
