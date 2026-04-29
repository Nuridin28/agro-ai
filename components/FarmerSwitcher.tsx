"use client";

import { useRouter, usePathname } from "next/navigation";
import { FARMERS } from "@/lib/mock/farmers";

export function FarmerSwitcher({ activeId }: { activeId: string }) {
  const router = useRouter();
  const path = usePathname() ?? "/farmer";
  return (
    <div className="inline-flex items-center gap-2 bg-card border border-border-soft rounded-full pl-3 pr-1 py-1 shadow-soft">
      <span className="text-[10.5px] uppercase tracking-wider text-foreground-soft">демо</span>
      <select
        value={activeId}
        onChange={(e) => router.push(`${path}?as=${e.target.value}`)}
        title="Демо: переключиться на другое хозяйство"
        className="border-0! bg-transparent! shadow-none! pr-7! pl-2! py-1! text-xs font-medium"
      >
        {FARMERS.map((f) => (
          <option key={f.id} value={f.id}>{f.id} · {f.legalName}</option>
        ))}
      </select>
    </div>
  );
}
