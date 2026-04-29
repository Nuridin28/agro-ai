"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  IconChart, IconSprout, IconShield, IconMap, IconLink,
  IconCalculator, IconCloud, IconFile, IconLayers,
} from "@/components/Icon";

function detectRole(path: string): "inspector" | "farmer" | "neutral" {
  if (path.startsWith("/inspector")) return "inspector";
  if (path.startsWith("/farmer")) return "farmer";
  return "neutral";
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon?: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition",
        active
          ? "bg-emerald-700 text-white shadow-soft hover:bg-emerald-800"
          : "text-foreground-soft hover:text-foreground hover:bg-muted",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function RolePill({ role }: { role: "inspector" | "farmer" }) {
  const cls =
    role === "inspector"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const label = role === "inspector" ? "Инспектор" : "Фермер";
  return (
    <span className={`hidden md:inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function NavInner() {
  const path = usePathname() ?? "/";
  const sp = useSearchParams();
  const role = detectRole(path);
  // Если ?as= нет в URL — значит пользователь либо реально авторизован,
  // либо ещё не выбрал демо-фермера. В обоих случаях НЕЛЬЗЯ подставлять
  // дефолт "F-001" — реальный пользователь после логина должен ходить
  // по чистым URL, а демо-режим включается только явным переходом
  // через FarmerSwitcher или ссылку с ?as=.
  const as = sp?.get("as");
  const asQuery = as ? `?as=${as}` : "";

  return (
    <div className="ml-auto flex items-center gap-3">
      {role === "inspector" && (
        <>
          <nav className="flex items-center gap-0.5">
            <NavLink href="/inspector" label="Главная" icon={<IconChart size={14} />} active={path === "/inspector"} />
            <NavLink href="/inspector/crops" label="Поля и урожай" icon={<IconSprout size={14} />} active={path.startsWith("/inspector/crops")} />
            <NavLink href="/inspector/livestock" label="Скот" icon={<IconShield size={14} />} active={path.startsWith("/inspector/livestock")} />
            <NavLink href="/giprozem" label="Карта" icon={<IconMap size={14} />} active={path.startsWith("/giprozem")} />
            <NavLink href="/inspector/bns" label="Статистика" icon={<IconLayers size={14} />} active={path.startsWith("/inspector/bns")} />
            <NavLink href="/inspector/sources" label="Откуда данные" icon={<IconLink size={14} />} active={path.startsWith("/inspector/sources")} />
          </nav>
          <RolePill role="inspector" />
          <Link href="/" className="text-xs text-foreground-soft hover:text-foreground hidden sm:inline">сменить роль ↗</Link>
        </>
      )}
      {role === "farmer" && (
        <>
          <nav className="flex items-center gap-0.5">
            <NavLink href={`/farmer${asQuery}`} label="Главная" icon={<IconChart size={14} />} active={path === "/farmer"} />
            <NavLink href={`/farmer/passport${asQuery}`} label="Мои поля" icon={<IconLayers size={14} />} active={path.startsWith("/farmer/passport")} />
            <NavLink href={`/farmer/calculator${asQuery}`} label="Калькулятор" icon={<IconCalculator size={14} />} active={path.startsWith("/farmer/calculator")} />
            <NavLink href={`/farmer/meteo${asQuery}`} label="Погода" icon={<IconCloud size={14} />} active={path.startsWith("/farmer/meteo")} />
            <NavLink href={`/farmer/applications${asQuery}`} label="Заявки" icon={<IconFile size={14} />} active={path.startsWith("/farmer/applications")} />
          </nav>
          <RolePill role="farmer" />
          <Link href="/" className="text-xs text-foreground-soft hover:text-foreground hidden sm:inline">сменить роль ↗</Link>
        </>
      )}
      {role === "neutral" && (
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/inspector"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-soft bg-card hover:border-rose-300 hover:text-rose-700 transition text-[13px]"
          >
            <IconShield size={14} /> Я инспектор
          </Link>
          <Link
            href="/farmer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full gradient-accent text-accent-fg shadow-soft hover:shadow-pop transition text-[13px] font-medium"
          >
            <IconSprout size={14} /> Я фермер
          </Link>
        </nav>
      )}
    </div>
  );
}

export function HeaderNav() {
  return (
    <Suspense fallback={null}>
      <NavInner />
    </Suspense>
  );
}
