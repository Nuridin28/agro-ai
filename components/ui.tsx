import Link from "next/link";
import { SOURCES, type SourceRef, describeSource } from "@/lib/sources";
import { SEVERITY_WEIGHT, type Severity } from "@/lib/verify/types";
import { SUBSIDY_CATEGORY_LABEL, SUBSIDY_CATEGORY_BADGE, type SubsidyCategory } from "@/lib/subsidy-categories";

export { SEVERITY_WEIGHT };

export const SEVERITY_LABEL: Record<Severity, string> = {
  ok: "норма", info: "инфо", warn: "внимание", high: "риск", critical: "критично",
};

const SEVERITY_BG: Record<Severity, string> = {
  ok:       "bg-emerald-50 text-emerald-800 border-emerald-200",
  info:     "bg-sky-50 text-sky-800 border-sky-200",
  warn:     "bg-amber-50 text-amber-800 border-amber-200",
  high:     "bg-orange-50 text-orange-800 border-orange-200",
  critical: "bg-rose-50 text-rose-800 border-rose-200",
};

export function SeverityBadge({ s, label }: { s: Severity; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${SEVERITY_BG[s]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label ?? SEVERITY_LABEL[s]}
    </span>
  );
}

export function DecisionBadge({ d }: { d: "clear" | "review" | "audit" | "recovery" }) {
  const map: Record<string, { label: string; cls: string }> = {
    clear:    { label: "ЧИСТ",       cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    review:   { label: "ПРОВЕРИТЬ",  cls: "bg-sky-100 text-sky-900 border-sky-300" },
    audit:    { label: "АУДИТ",      cls: "bg-amber-100 text-amber-900 border-amber-300" },
    recovery: { label: "К ВОЗВРАТУ", cls: "bg-rose-100 text-rose-900 border-rose-300" },
  };
  const v = map[d];
  return (
    <span className={`inline-flex items-center text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-md border ${v.cls}`}>
      {v.label}
    </span>
  );
}

// Пороги соответствуют decisionFromRisk() в lib/verify/index.ts.
// Меняешь здесь — поменяй и там, иначе цвета бара разойдутся с DecisionBadge.
export const RISK_ZONES = [
  { min: 0,  max: 15,  label: "чисто",    decision: "clear",    fill: "bg-emerald-500", faded: "bg-emerald-100", text: "text-emerald-700" },
  { min: 15, max: 35,  label: "проверка", decision: "review",   fill: "bg-sky-500",     faded: "bg-sky-100",     text: "text-sky-700" },
  { min: 35, max: 65,  label: "аудит",    decision: "audit",    fill: "bg-amber-500",   faded: "bg-amber-100",   text: "text-amber-700" },
  { min: 65, max: 101, label: "возврат",  decision: "recovery", fill: "bg-rose-500",    faded: "bg-rose-100",    text: "text-rose-700" },
] as const;

export function riskZone(score: number) {
  return RISK_ZONES.find((z) => score >= z.min && score < z.max) ?? RISK_ZONES[RISK_ZONES.length - 1];
}

// Размер каждой зоны на бар-шкале 0–100. Доли отражают пороги 15 / 35 / 65.
const ZONE_WIDTHS = ["15%", "20%", "30%", "35%"] as const;

function RiskBarTrack({ value, height }: { value: number; height: string }) {
  const zone = riskZone(value);
  const pct = Math.max(2, Math.min(100, value));
  return (
    <div className={`relative w-full ${height} rounded bg-muted overflow-hidden`}>
      <div className="absolute inset-0 flex">
        {RISK_ZONES.map((z, i) => (
          <div key={z.label} className={z.faded} style={{ width: ZONE_WIDTHS[i] }} />
        ))}
      </div>
      <div className={`relative h-full ${zone.fill} transition-[width]`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function RiskScoreBar({ value }: { value: number }) {
  const zone = riskZone(value);
  return (
    <div className="flex items-center gap-2 min-w-32">
      <div className="w-20"><RiskBarTrack value={value} height="h-1.5" /></div>
      <div className="flex items-baseline gap-0.5 leading-tight">
        <span className={`text-xs font-bold tabular-nums ${zone.text}`}>{value}</span>
        <span className="text-[10px] text-foreground/50">/100</span>
      </div>
    </div>
  );
}

export function RiskScoreCard({ value }: { value: number }) {
  const zone = riskZone(value);
  return (
    <div className="border border-border rounded-lg px-3 py-2 bg-muted/40">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">Риск-балл</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className={`text-sm font-bold tabular-nums ${zone.text}`}>{value}</span>
        <span className="text-[10px] text-foreground/50">/100 · {zone.label}</span>
      </div>
      <div className="mt-1.5"><RiskBarTrack value={value} height="h-1" /></div>
    </div>
  );
}


export function SourcePill({ source: r }: { source: SourceRef }) {
  const src = SOURCES[r.source];
  return (
    <a
      href={src.url}
      target="_blank"
      rel="noopener"
      title={`${src.fullName} • ${src.org} • док. ${r.docId}${r.note ? "\n" + r.note : ""}\nВыгружено ${new Date(r.fetchedAt).toLocaleDateString("ru-KZ")}`}
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border border-border bg-muted hover:bg-card hover:border-accent/40 hover:text-accent transition font-mono"
    >
      <span className="text-foreground-soft">{src.name}</span>
      <span className="text-foreground-soft/60">·</span>
      <span>{r.docId}</span>
    </a>
  );
}

export function SourceList({ refs, label }: { refs: SourceRef[]; label?: string }) {
  if (refs.length === 0) return null;
  return (
    <div className="text-xs text-foreground-soft">
      {label && <span className="mr-2">{label}:</span>}
      <span className="inline-flex flex-wrap gap-1">
        {refs.map((r, i) => <SourcePill key={i} source={r} />)}
      </span>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border-soft rounded-2xl shadow-soft ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border-soft flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="text-sm sm:text-base font-semibold tracking-tight">{title}</div>
        {subtitle && <div className="text-xs text-foreground-soft mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Stat({
  label, value, sub, accent, icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: "ok" | "warn" | "high";
  icon?: React.ReactNode;
}) {
  const accentCls =
    accent === "ok"   ? "text-emerald-700" :
    accent === "warn" ? "text-amber-700"   :
    accent === "high" ? "text-rose-700"    : "";
  const ringCls =
    accent === "ok"   ? "ring-1 ring-emerald-100" :
    accent === "warn" ? "ring-1 ring-amber-100"   :
    accent === "high" ? "ring-1 ring-rose-100"    : "";
  const iconCls =
    accent === "ok"   ? "bg-emerald-50 text-emerald-700" :
    accent === "warn" ? "bg-amber-50 text-amber-700"     :
    accent === "high" ? "bg-rose-50 text-rose-700"       :
                        "bg-muted text-foreground-soft";
  return (
    <div className={`relative overflow-hidden bg-card border border-border-soft rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-soft lift ${ringCls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10.5px] sm:text-[11px] uppercase tracking-wider text-foreground-soft leading-tight">{label}</div>
        {icon && <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg grid place-items-center shrink-0 ${iconCls}`}>{icon}</span>}
      </div>
      <div className={`text-lg sm:text-2xl font-bold mt-1 tabular-nums ${accentCls}`}>{value}</div>
      {sub && <div className="text-[11px] sm:text-xs text-foreground-soft mt-1">{sub}</div>}
    </div>
  );
}

export function formatTenge(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)} млн ₸`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(0)} тыс ₸`;
  return `${t} ₸`;
}

export function FarmerLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <Link href={`/inspector/farmers/${id}`} className="font-medium hover:text-accent hover:underline underline-offset-2">{children}</Link>;
}

export function CategoryBadge({ category, size = "sm" }: { category: SubsidyCategory; size?: "sm" | "xs" }) {
  const px = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1 ${px} font-medium rounded-md border ${SUBSIDY_CATEGORY_BADGE[category]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {SUBSIDY_CATEGORY_LABEL[category]}
    </span>
  );
}
