import Link from "next/link";
import { FARMERS } from "@/lib/mock/farmers";
import {
  IconArrowRight, IconSparkle, IconShield, IconSprout, IconMap,
  IconCalculator, IconCloud, IconFile, IconChart, IconLink, IconLayers,
} from "@/components/Icon";

export default function LandingPage() {
  return (
    <div className="space-y-20 max-w-6xl mx-auto -mt-2">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[28px] border border-border-soft bg-hero shadow-card animate-fade-up">
        <div className="absolute inset-0 bg-grid opacity-[0.35] pointer-events-none" />
        <div className="absolute -top-32 -right-24 w-105 h-105 rounded-full gradient-accent opacity-25 blur-3xl pointer-events-none animate-float" />
        <div className="absolute -bottom-40 -left-20 w-90 h-90 rounded-full bg-lime-300 opacity-25 blur-3xl pointer-events-none" />

        <div className="relative grid lg:grid-cols-12 gap-10 px-6 sm:px-10 py-14 sm:py-20 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card/80 border border-border-soft text-[11px] uppercase tracking-wider text-foreground-soft shadow-soft backdrop-blur">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <IconSparkle size={12} className="text-emerald-600" />
              AgroForensics KZ · демо
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[60px] font-bold tracking-tight mt-5 leading-[1.02]">
              <span className="text-gradient-accent">Помогаем</span>
              <br />
              получать субсидии
              <br />
              <span className="text-foreground-soft text-3xl sm:text-4xl lg:text-5xl">честно и без проверок</span>
            </h1>
            <p className="text-base sm:text-lg text-foreground-soft mt-6 max-w-xl leading-relaxed">
              Собираем в одном месте всё про вашу землю, скот, погоду и заявки.
              Фермеру — подсказки и спокойствие. Инспектору — понятный разбор каждой выплаты.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/farmer" className="btn btn-primary">
                <IconSprout size={16} />
                Я фермер
                <IconArrowRight size={14} />
              </Link>
              <Link href="/inspector" className="btn btn-ghost">
                <IconShield size={16} />
                Я инспектор
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border-soft bg-border-soft max-w-md">
              <HeroStat icon={<IconBuildingMini />} label="фермеров в демо" value={FARMERS.length} />
              <HeroStat icon={<IconLink size={14} />} label="госбаз" value={9} />
              <HeroStat icon={<IconChart size={14} />} label="проверок" value={14} />
            </div>
          </div>

          {/* RIGHT: bento mosaic preview */}
          <div className="lg:col-span-5 relative">
            <div className="grid grid-cols-6 gap-3">
              <PreviewCard className="col-span-6" tone="emerald">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg gradient-accent text-white grid place-items-center"><IconSparkle size={16} /></span>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-foreground-soft">Оценка от ИИ</div>
                      <div className="text-sm font-semibold">87 из 100</div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">всё хорошо</span>
                </div>
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full gradient-accent" style={{ width: "87%" }} />
                </div>
              </PreviewCard>

              <PreviewCard className="col-span-3">
                <div className="text-[11px] uppercase tracking-wider text-foreground-soft">Урожай</div>
                <div className="text-2xl font-bold tabular-nums mt-1">23.4<span className="text-sm text-foreground-soft ml-1">ц/га</span></div>
                <div className="mt-2 flex items-end gap-1 h-8">
                  {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm gradient-accent opacity-80" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </PreviewCard>

              <PreviewCard className="col-span-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-foreground-soft">
                  <IconCloud size={12} /> Погода
                </div>
                <div className="text-2xl font-bold tabular-nums mt-1">+18°<span className="text-sm text-foreground-soft ml-1">днём</span></div>
                <div className="text-[11px] text-foreground-soft mt-2">снег сошёл 3 дня назад</div>
              </PreviewCard>

              <PreviewCard className="col-span-6" tone="amber">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-md bg-amber-100 text-amber-700 grid place-items-center"><IconAlertMini /></span>
                    <div>
                      <div className="text-sm font-medium">Урожай заявили слишком высокий</div>
                      <div className="text-[11px] text-foreground-soft">32 ц/га — больше, чем может вырасти на этой почве</div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">проверить</span>
                </div>
              </PreviewCard>
            </div>

            {/* glow */}
            <div className="absolute -inset-6 -z-10 rounded-[40px] gradient-accent opacity-10 blur-2xl pointer-events-none" />
          </div>
        </div>
      </section>

      {/* FEATURE GRID */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-[11px] uppercase tracking-wider text-foreground-soft">Что внутри</div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Всё для работы с субсидиями — в одном месте</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Feature icon={<IconMap size={18} />}        title="Паспорт каждого поля" desc="Состав почвы, что лучше посеять, какой урожай ждать. Берём из госбазы Гипрозем." />
          <Feature icon={<IconCalculator size={18} />} title="Калькулятор"          desc="Считает, сколько удобрений нужно купить и сколько денег вы получите от государства." />
          <Feature icon={<IconCloud size={18} />}      title="Прогноз погоды"        desc="Когда сошёл снег, прогрелась ли земля, что может помешать урожаю в этом сезоне." />
          <Feature icon={<IconFile size={18} />}       title="Заявки онлайн"         desc="Загружайте чеки и счета прямо здесь — не нужно везти бумаги в управление сельского хозяйства." />
          <Feature icon={<IconShield size={18} />}     title="Проверка нарушений"    desc="14 проверок: завышенный урожай, посев только на бумаге, лишний скот на пастбищах и другие." />
          <Feature icon={<IconLayers size={18} />}     title="Откуда взяты данные"   desc="Каждую цифру можно проверить — мы показываем, из какой госбазы её взяли." />
        </div>
      </section>

      {/* ROLE CARDS */}
      <section className="grid md:grid-cols-2 gap-5">
        <RoleCard
          href="/farmer"
          tone="emerald"
          icon={<IconSprout size={20} />}
          title="Я фермер"
          tag="Прозрачный бизнес"
          desc="Меньше проверок и подсказки от ИИ — что улучшить, чтобы получать больше субсидий."
          bullets={[
            "Паспорт каждого поля",
            "Калькулятор: сколько удобрений и сколько денег",
            "Прогноз погоды и риски на сезон",
            "Загрузка чеков и документов онлайн",
            "Оценка работы и советы по улучшению почвы",
          ]}
          cta="Войти как фермер"
          delay={1}
        />
        <RoleCard
          href="/inspector"
          tone="rose"
          icon={<IconShield size={20} />}
          title="Я инспектор"
          tag="Проверка"
          desc="Видим подозрительные субсидии и объясняем человеческим языком — что не так и сколько вернуть."
          bullets={[
            "Список фермеров — самые рискованные сверху",
            "Подробное досье на каждое хозяйство",
            "14 проверок: приписки, посев на бумаге, лишний скот",
            "Все цифры со ссылками на госбазы",
            "Сумма к возврату по каждому нарушению",
          ]}
          cta="Войти как инспектор"
          delay={2}
        />
      </section>

      {/* DEMO ENTRIES */}
      <section className="rounded-3xl border border-border-soft bg-card p-6 sm:p-8 shadow-soft animate-fade-up animate-delay-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-foreground-soft">
              <IconSparkle size={12} className="text-emerald-600" />
              Попробовать
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-1">Зайти как один из фермеров</h2>
            <p className="text-sm text-foreground-soft mt-1.5 max-w-2xl">
              В демо есть {FARMERS.length} хозяйств — от честных до тех, у кого много нарушений.
              Зайдите под любым, чтобы посмотреть, как всё устроено.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-6">
          {FARMERS.slice(0, 9).map((f) => (
            <Link
              key={f.id}
              href={`/farmer?as=${f.id}`}
              className="group flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border-soft bg-background-elev hover:bg-card hover:border-accent/50 hover:shadow-soft transition"
            >
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center font-mono text-[10px] font-bold border border-emerald-100 shrink-0">
                {f.id.replace("F-", "")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{f.legalName}</div>
                <div className="text-[11px] text-foreground-soft truncate">{f.region.oblast}</div>
              </div>
              <IconArrowRight size={14} className="text-foreground-soft group-hover:text-accent group-hover:translate-x-0.5 transition" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-card/90 backdrop-blur px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-foreground-soft mb-0.5">{icon}<span className="text-[10.5px] uppercase tracking-wider">{label}</span></div>
      <div className="text-[22px] font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function PreviewCard({ children, className = "", tone = "default" }: { children: React.ReactNode; className?: string; tone?: "default" | "emerald" | "amber" }) {
  const ring =
    tone === "emerald" ? "ring-1 ring-emerald-100" :
    tone === "amber" ? "ring-1 ring-amber-100" : "";
  return (
    <div className={`bg-card border border-border-soft rounded-2xl p-4 shadow-soft ${ring} ${className}`}>
      {children}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group bg-card border border-border-soft rounded-2xl p-5 shadow-soft lift">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center group-hover:gradient-accent group-hover:text-white transition">
        {icon}
      </div>
      <div className="text-sm font-semibold tracking-tight mt-4">{title}</div>
      <div className="text-xs text-foreground-soft mt-1.5 leading-relaxed">{desc}</div>
    </div>
  );
}

function RoleCard({
  href, tone, icon, title, tag, desc, bullets, cta, delay,
}: {
  href: string;
  tone: "emerald" | "rose";
  icon: React.ReactNode;
  title: string;
  tag: string;
  desc: string;
  bullets: string[];
  cta: string;
  delay: 1 | 2;
}) {
  const tagCls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  const ctaCls =
    tone === "emerald"
      ? "text-emerald-700 group-hover:text-emerald-800"
      : "text-rose-700 group-hover:text-rose-800";
  const hoverBorder =
    tone === "emerald" ? "hover:border-emerald-300" : "hover:border-rose-300";
  const dotCls = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const iconCls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 group-hover:gradient-accent group-hover:text-white"
      : "bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white";
  const delayCls = delay === 1 ? "animate-delay-1" : "animate-delay-2";

  return (
    <Link
      href={href}
      className={`group relative block rounded-3xl border border-border-soft bg-card p-7 shadow-soft hover:shadow-card ${hoverBorder} transition animate-fade-up ${delayCls}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-11 h-11 rounded-xl grid place-items-center transition ${iconCls}`}>{icon}</span>
          <div>
            <div className="text-[20px] font-semibold tracking-tight">{title}</div>
            <span className={`mt-1 inline-flex items-center text-[10.5px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full border ${tagCls}`}>
              {tag}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm text-foreground-soft mt-4 leading-relaxed">{desc}</p>

      <ul className="mt-5 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="text-sm text-foreground/85 flex items-start gap-2.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotCls} mt-1.5 shrink-0`} />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className={`mt-6 inline-flex items-center gap-1 text-sm font-medium ${ctaCls}`}>
        {cta}
        <IconArrowRight size={14} className="transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function IconBuildingMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M9 9h.01M14 9h.01M9 14h.01M14 14h.01" />
    </svg>
  );
}

function IconAlertMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 2 20h20L12 4Z" />
      <path d="M12 10v4M12 17v.01" />
    </svg>
  );
}
