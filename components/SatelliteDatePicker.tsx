"use client";

// Просмотрщик снимков поля за произвольную дату.
// На вход — base64-кодированный полигон (тот же формат, что использует
// imageUrl() в lib/satellite). На выходе — выбор даты + RGB и NDVI рядом.
//
// Запросы к /api/satellite/image кешируются на сервере (30 дней TTL для
// прошлых дат), поэтому повторный выбор той же даты — мгновенно.

import { useState } from "react";

interface Props {
  // Base64-url-кодированный полигон. Можно дёрнуть с готовых image.url
  // (см. imageUrl в lib/satellite/index.ts) — формат единый.
  polygonB64: string;
  // Допустимый диапазон дат (отсекаем будущее и слишком далёкое прошлое).
  minDate: string;     // YYYY-MM-DD
  maxDate: string;     // YYYY-MM-DD
  defaultDate?: string;
}

function urlFor(polygonB64: string, date: string, kind: "truecolor" | "ndvi"): string {
  return `/api/satellite/image?p=${polygonB64}&date=${date}&kind=${kind}`;
}

export function SatelliteDatePicker({ polygonB64, minDate, maxDate, defaultDate }: Props) {
  const [date, setDate] = useState(defaultDate ?? maxDate);

  return (
    <div className="border-t border-border-soft bg-muted/20 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-foreground/60">
            Снимки поля за произвольную дату
          </div>
          <div className="text-[11px] text-foreground/65 mt-0.5">
            Sentinel Hub подберёт ближайший ясный снимок в окне ±10 дн. вокруг даты.
            Кликни по снимку, чтобы открыть в большом размере.
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-foreground/70">Дата:</span>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1 rounded border border-border bg-card text-xs font-mono focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PreviewPane label="RGB · true-color" date={date} url={urlFor(polygonB64, date, "truecolor")} kind="RGB" />
        <PreviewPane label="NDVI · карта зелени" date={date} url={urlFor(polygonB64, date, "ndvi")} kind="NDVI" />
      </div>
    </div>
  );
}

function PreviewPane({ label, date, url, kind }: { label: string; date: string; url: string; kind: "RGB" | "NDVI" }) {
  // key=url заставляет <img> сбрасывать состояние и подгружать новый источник
  // при смене даты — иначе React удерживает старое изображение пока новое
  // не догрузится, и пользователь не видит индикатор «грузится».
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-accent/40 transition"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {!loaded && !errored && (
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%] animate-shimmer" />
        )}
        {errored ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-rose-700 bg-rose-50 px-2 text-center">
            На эту дату нет ясных снимков. Попробуйте другую.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`${label} ${date}`}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
        <div className="absolute top-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
          {kind}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[11px] font-medium">{label}</div>
        <div className="text-[10px] text-foreground/60 font-mono mt-0.5">{date}</div>
      </div>
    </a>
  );
}
