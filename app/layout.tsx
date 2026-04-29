import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { HeaderNav } from "@/components/HeaderNav";

export const metadata: Metadata = {
  title: "AgroForensics KZ — AI-верификация субсидий АПК",
  description:
    "AI-платформа сопоставления данных ИСЖ, Plem.kz, Гипрозема, ЕГКН, Qoldau, Казгидромета и Agrodata для проверки целевого использования субсидий в земледелии и животноводстве Казахстана.",
};

const SOURCE_LINKS = [
  { href: "https://isg.gov.kz/",        label: "ИСЖ" },
  { href: "https://plem.kz/",           label: "Plem.kz" },
  { href: "https://vetis.kz/",          label: "VETIS" },
  { href: "https://portal.giprozem.kz/", label: "Гипрозем" },
  { href: "https://map.gov4c.kz/egkn/", label: "ЕГКН" },
  { href: "https://qoldau.kz/",         label: "Qoldau" },
  { href: "https://stat.gov.kz/",       label: "БНС" },
  { href: "https://agrodata.kz/",       label: "Agrodata" },
  { href: "https://www.kazhydromet.kz/", label: "Казгидромет" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b border-border-soft glass">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="w-8 h-8 rounded-xl gradient-accent text-accent-fg grid place-items-center font-bold text-sm shadow-soft group-hover:shadow-pop transition">A</span>
              <span className="flex flex-col leading-none">
                <span className="font-semibold tracking-tight text-[15px]">AgroForensics KZ</span>
                <span className="text-[10.5px] text-foreground-soft hidden sm:inline mt-0.5">AI-верификация субсидий АПК</span>
              </span>
            </Link>
            <HeaderNav />
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">{children}</main>

        <footer className="border-t border-border-soft mt-12 bg-background-elev/60">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-xs text-foreground-soft">
              <span className="font-medium text-foreground">Прототип</span> · демо-данные имитируют выгрузки из госисточников
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {SOURCE_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] px-2 py-1 rounded-md border border-border-soft bg-card hover:border-accent/40 hover:text-accent transition"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
