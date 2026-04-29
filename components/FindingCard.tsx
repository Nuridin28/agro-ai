import type { Finding } from "@/lib/verify/types";
import { Card, SeverityBadge, SourcePill, formatTenge } from "./ui";

export function FindingCard({ finding }: { finding: Finding }) {
  const f = finding;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <SeverityBadge s={f.severity} />
            <span className="text-[11px] font-mono text-foreground/50">{f.code}</span>
          </div>
          <h3 className="text-base font-semibold mt-1">{f.title}</h3>
          <p className="text-sm text-foreground/80 mt-2 leading-relaxed">{f.detail}</p>
        </div>
        {f.riskTenge !== undefined && f.riskTenge > 0 && (
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-foreground/60">Риск к возврату</div>
            <div className="text-rose-700 font-bold tabular-nums">{formatTenge(f.riskTenge)}</div>
          </div>
        )}
      </div>

      {(f.expected || f.actual) && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {f.expected && (
            <div className="bg-muted/60 border border-border rounded-lg p-3">
              <div className="text-[11px] uppercase tracking-wider text-foreground/60">Норма / эталон</div>
              <div className="font-medium mt-0.5">{f.expected}</div>
            </div>
          )}
          {f.actual && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <div className="text-[11px] uppercase tracking-wider text-rose-800">Фактически заявлено</div>
              <div className="font-medium mt-0.5 text-rose-900">{f.actual}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wider text-foreground/60 mb-2">Доказательная база</div>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {f.evidence.map((e, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  <td className="px-3 py-2 text-foreground/70 w-1/3 align-top">{e.label}</td>
                  <td className="px-3 py-2 align-top font-medium">{e.value}</td>
                  <td className="px-3 py-2 align-top text-right"><SourcePill source={e.source} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
