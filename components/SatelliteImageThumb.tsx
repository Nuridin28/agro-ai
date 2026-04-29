"use client";

import { useState } from "react";
import type { SatelliteImage } from "@/lib/satellite/types";

// Миниатюра спутникового снимка с per-image скелетоном:
// пока браузер не загрузит PNG (это может быть 1–3 секунды на первый
// запрос — Process API SH считает на лету), показываем shimmer.

export function SatelliteImageThumb({ image }: { image: SatelliteImage }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <a
      href={image.url}
      target="_blank"
      rel="noopener"
      className="group block bg-card border border-border rounded-lg overflow-hidden hover:border-accent/40 hover:shadow-soft transition"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {!loaded && !errored && (
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%] animate-shimmer" />
        )}
        {errored ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-rose-700 bg-rose-50 px-2 text-center">
            Снимок недоступен (нет ясных данных в окне)
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.label}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
        <div className="absolute top-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
          {image.kind === "ndvi" ? "NDVI" : "RGB"}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[11px] font-medium leading-tight">{image.label}</div>
        <div className="text-[10px] text-foreground/60 font-mono mt-0.5">{image.date}</div>
      </div>
    </a>
  );
}
