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
  OK:         "Поле обрабатывается",
  WATCH:      "Ждём данных",
  SUSPICIOUS: "Подозрение на простой",
  ALERT:      "Поле не обрабатывалось",
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
        title="Спутниковая проверка поля"
        subtitle={`Снимки Sentinel-2 за сезон ${spatial.window.startDate.slice(0, 4)} (с ${spatial.window.startDate} до ${spatial.window.endDate})`}
        action={
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-md border ${RISK_BG[spatial.riskFlag]}`}>
              {spatial.riskFlag === "LOW" ? "Без вопросов" : spatial.riskFlag === "MEDIUM" ? "Стоит проверить" : "Высокий риск"}
            </span>
            <SourcePill source={spatial.source} />
          </div>
        }
      />

      <div className="px-5 py-3 text-[12px] text-foreground/70 bg-muted/30 border-t border-border-soft leading-relaxed">
        <strong className="text-foreground/85">Как это читать:</strong> мы взяли реальные снимки спутника Sentinel-2 (ESA) над контуром поля
        за весь сезон вегетации. По ним посчитали индекс NDVI — насколько поле зелёное (от −1 до 1).
        Если есть посев и нормальный рост — индекс плавно растёт с весны до пика в июле и плавно падает к уборке. Если нет посева
        или поле забросили — индекс остаётся низким. Внизу — три снимка для визуальной проверки и параметры для решения комиссии.
      </div>

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

      <div className="border-t border-border-soft px-5 py-3 space-y-2">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-foreground/60">Проверка обработки поля после посева</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${INACT_BG[inactivity.level]}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current mr-1" />
                {INACT_LABEL[inactivity.level]}
              </span>
              <span className="text-xs text-foreground/70">
                от {inactivity.baselineDate} до {inactivity.checkedThrough}
              </span>
            </div>
          </div>
          <div className="text-xs text-foreground/70 tabular-nums text-right">
            {inactivity.baselineNDVI !== null && <div>Зелень на старте: {inactivity.baselineNDVI.toFixed(2)}</div>}
            {inactivity.recentNDVIMax !== null && <div>Максимум за окно: {inactivity.recentNDVIMax.toFixed(2)}</div>}
            {inactivity.deltaNDVI !== null && <div>Прирост зелени: {inactivity.deltaNDVI > 0 ? "+" : ""}{inactivity.deltaNDVI.toFixed(2)}</div>}
            <div className="text-foreground/55">снимков в окне: {inactivity.observationsInWindow}</div>
          </div>
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
      <div className="text-[10px] uppercase tracking-wider text-foreground/60 mb-2">
        Три снимка поля в ключевые моменты сезона
      </div>
      <div className="grid grid-cols-3 gap-2">
        {images.map((img, i) => <SatelliteImageThumb key={i} image={img} />)}
      </div>
      <div className="text-[10px] text-foreground/55 mt-2 leading-relaxed">
        RGB — обычная цветная фотография поля сверху. NDVI — карта «насколько зелено»: коричневый — голая земля,
        жёлтый — слабая трава, зелёный — здоровый посев. Кликните по снимку, чтобы открыть в большом размере.
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
      <Stat label="Зелень в пике"     value={f.ndviMax.toFixed(2)} sub="NDVI max · 0–1" accent={f.ndviMax < 0.30 ? "high" : undefined} />
      <Stat label="Зелень в среднем"  value={f.ndviMean.toFixed(2)} sub="NDVI mean за сезон" />
      <Stat label="Уровень вегетации" value={VEG_LABEL[vegetationLevel] ?? vegetationLevel}
            accent={vegetationLevel === "none" || vegetationLevel === "weak" ? "high" : undefined} />
      <Stat label="Посев на спутнике" value={sowingDetected ? "виден" : "не виден"} accent={sowingDetected ? undefined : "high"} />
      <Stat label="Поле начало зеленеть" value={f.growthStartDate ?? "—"} sub="первая дата с активной вегетацией" />
      <Stat label="Самый зелёный день"   value={f.peakDate ?? "—"} sub="когда NDVI был максимален" />
      <Stat label="Ясных снимков"     value={`${f.pointsUsed} / ${f.pointsUsed + f.pointsDropped}`} sub="(использовано / всего)" />
      <Stat label="Под облаками"      value={`${f.pointsDropped}`} sub="отброшено из расчёта" />
    </div>
  );
}

function ExtendedGrid({ f }: { f: NDVIFeatures }) {
  return (
    <div className="border-t border-border-soft bg-muted/20 px-5 py-3">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60 mb-2">
        Дополнительные показатели для решения
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SmallStat
          label="Однородность поля"
          value={f.heterogeneityStdev !== null ? f.heterogeneityStdev.toFixed(2) : "—"}
          hint={f.heterogeneityStdev !== null && f.heterogeneityStdev >= 0.16
            ? "поле разное по углам — возможно засеяно не всё"
            : "поле однородное — засеяно равномерно"}
          accent={f.heterogeneityStdev !== null && f.heterogeneityStdev >= 0.16 ? "warn" : undefined}
        />
        <SmallStat
          label="Темп роста зелени"
          value={f.growthRateNdviPerDay !== null ? `${(f.growthRateNdviPerDay * 1000).toFixed(1)} ‰/день` : "—"}
          hint={f.growthRateNdviPerDay !== null
            ? f.growthRateNdviPerDay < 0.008 ? "слишком медленно — удобрения мало работают" : "нормальный темп для зерновых"
            : ""}
          accent={f.growthRateNdviPerDay !== null && f.growthRateNdviPerDay < 0.008 ? "warn" : undefined}
        />
        <SmallStat
          label="Сколько дней до пика"
          value={f.daysToPeak !== null ? `${f.daysToPeak} дн.` : "—"}
          hint="от появления всходов до максимума"
        />
        <SmallStat
          label="Длина зелёного периода"
          value={f.seasonLengthDays !== null ? `${f.seasonLengthDays} дн.` : "—"}
          hint="всходы → начало уборки"
        />
      </div>
    </div>
  );
}

function YoYBlock({ yoy, currentMax }: { yoy: YearOverYear; currentMax: number }) {
  const dropAccent = yoy.ndviMaxDelta !== null && yoy.ndviMaxDelta <= -0.20;
  return (
    <div className="border-t border-border-soft bg-muted/20 px-5 py-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-wider text-foreground/60">
          Сравнение с прошлым сезоном ({yoy.previousYear})
        </div>
        {yoy.ndviMaxDelta !== null && (
          <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded border ${dropAccent ? "bg-rose-50 text-rose-800 border-rose-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"}`}>
            Зелень в пике {yoy.ndviMaxDelta > 0 ? "+" : ""}{yoy.ndviMaxDelta.toFixed(2)} vs прошлый год
          </span>
        )}
      </div>
      {yoy.ndviMaxPrev === null ? (
        <div className="text-xs text-foreground/70">Данных за {yoy.previousYear} недостаточно для сравнения (мало ясных снимков).</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SmallStat label={`Зелень в ${yoy.previousYear}`} value={yoy.ndviMaxPrev.toFixed(2)} />
          <SmallStat label="Зелень сейчас" value={currentMax.toFixed(2)} accent={dropAccent ? "warn" : undefined} />
          <SmallStat
            label={`Начало роста в ${yoy.previousYear}`}
            value={yoy.growthStartPrev ?? "—"}
            hint={yoy.growthStartDeltaDays !== null ? `${yoy.growthStartDeltaDays > 0 ? "позже" : "раньше"} на ${Math.abs(yoy.growthStartDeltaDays)} дн.` : ""}
            accent={yoy.growthStartDeltaDays !== null && yoy.growthStartDeltaDays > 14 ? "warn" : undefined}
          />
          <SmallStat label="Тренд" value={dropAccent ? "↓ хуже" : (yoy.ndviMaxDelta !== null && yoy.ndviMaxDelta >= 0.05 ? "↑ лучше" : "стабильно")}
            accent={dropAccent ? "warn" : undefined} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: "high" }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${accent === "high" ? "text-rose-700" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-foreground/55 mt-0.5">{sub}</div>}
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
