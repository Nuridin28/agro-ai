import { Card, CardHeader } from "@/components/ui";

export function RealMeteoSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Метео-сезон"
        subtitle="Загружаем погоду через Open-Meteo…"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-soft border-t border-border-soft">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card px-4 py-3 space-y-1.5">
            <div className="h-2 w-3/5 rounded bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%] animate-shimmer" />
            <div className="h-3.5 w-4/5 rounded bg-gradient-to-r from-muted via-muted-2/40 to-muted bg-[length:200%_100%] animate-shimmer" />
          </div>
        ))}
      </div>
    </Card>
  );
}
