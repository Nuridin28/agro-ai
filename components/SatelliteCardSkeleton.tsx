// Скелетон карточки спутниковой проверки. Показывается через <Suspense>
// пока идут запросы к Sentinel Hub (Statistical API + YoY + 3 PNG):
// при холодном кэше первый рендер ~25–30 сек, потом мгновенно с диска.

import { Card, CardHeader } from "@/components/ui";

export function SatelliteCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Спутниковая верификация · NDVI"
        subtitle="Загружаем снимки Sentinel-2 и считаем NDVI…"
        action={
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-20 rounded-md bg-muted-2/50 animate-shimmer bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%]" />
          </div>
        }
      />

      {/* Картинки */}
      <div className="border-t border-border-soft bg-muted/30 px-5 py-3">
        <div className="text-[10px] uppercase tracking-wider text-foreground/60 mb-2">Снимки Sentinel-2</div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="relative aspect-square bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%] animate-shimmer" />
              <div className="px-2 py-1.5 space-y-1">
                <ShimmerBar w="80%" h="11px" />
                <ShimmerBar w="40%" h="9px" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Базовая сетка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-soft border-t border-border-soft">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card px-4 py-3 space-y-1">
            <ShimmerBar w="60%" h="9px" />
            <ShimmerBar w="80%" h="14px" />
          </div>
        ))}
      </div>

      {/* Расширенная сетка */}
      <div className="border-t border-border-soft bg-muted/20 px-5 py-3">
        <ShimmerBar w="220px" h="9px" className="mb-2" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <ShimmerBar w="70%" h="9px" />
              <ShimmerBar w="50%" h="13px" />
              <ShimmerBar w="60%" h="9px" />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border-soft px-5 py-3 flex items-center justify-between gap-3">
        <ShimmerBar w="180px" h="18px" />
        <ShimmerBar w="240px" h="12px" />
      </div>

      <div className="px-5 pb-3 text-[11px] text-foreground/55 italic">
        ⏳ NDVI-ряд считается на стороне Sentinel Hub (Statistical API), параллельно
        тянутся 3 PNG-снимка через Process API. Это занимает 25–30 сек при первом
        обращении к полигону, после кэширования — мгновенно.
      </div>
    </Card>
  );
}

function ShimmerBar({ w, h, className = "" }: { w: string; h: string; className?: string }) {
  return (
    <div
      className={`rounded bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%] animate-shimmer ${className}`}
      style={{ width: w, height: h }}
    />
  );
}
