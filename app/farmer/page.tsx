import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveFarmerSession, farmerQuery } from "@/lib/farmer-context";
import { fieldFor, seasonFor } from "@/lib/mock/crop";
import { herdFor, pastureFor } from "@/lib/mock/livestock";
import { meteoFor } from "@/lib/mock/meteo";
import { computeExpectedYield } from "@/lib/verify/crop";
import { verifyFarmer } from "@/lib/verify";
import { CROP_LABEL } from "@/lib/types";
import { buildAdvice, type Advice } from "@/lib/farmer-advice";
import { Card, CardHeader, Stat, formatTenge } from "@/components/ui";
import { FarmerSwitcher } from "@/components/FarmerSwitcher";
import { AiInsight } from "@/components/AiInsight";
import { LogoutButton } from "@/components/LogoutButton";
import {
  IconCoin, IconChart, IconSprout, IconFile, IconBuilding, IconLayers, IconCalculator, IconCloud, IconMap, IconArrowRight,
} from "@/components/Icon";
import type { User } from "@/lib/users-store";

export default async function FarmerHomePage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const session = await resolveFarmerSession(as);
  if (!session) redirect("/login");

  const isReal = session.kind === "real";
  const farmer = session.farmer;
  const q = isReal ? "" : farmerQuery(farmer.id);

  // Для реальных пользователей у нас нет mock-данных полей — используем привязки Гипрозема
  const userFields = isReal ? session.user.fields : [];

  const verdict = !isReal ? verifyFarmer(farmer.id) : null;
  const field = !isReal ? fieldFor(farmer.id) : undefined;
  const season = !isReal ? seasonFor(farmer.id) : undefined;
  const herd = !isReal ? herdFor(farmer.id) : undefined;
  const pasture = !isReal ? pastureFor(farmer.id) : undefined;
  const meteo = field
    ? meteoFor(field.region.katoCode, season?.year ?? 2024)
    : pasture
    ? meteoFor(pasture.region.katoCode, herd?.year ?? 2024)
    : undefined;

  const advice = !isReal ? buildAdvice(farmer) : buildRealAdvice(session.user);
  const exp = field && season ? computeExpectedYield(field, season, meteo) : null;

  // Для real-режима скоринг считаем по агрохимии привязанных участков (Liebig)
  const realEfficiency = isReal ? scoreFromUserFields(userFields) : 100;
  const efficiency = isReal ? realEfficiency : (verdict?.efficiencyScore ?? 100);
  const zone = efficiency >= 75 ? "green" : efficiency >= 45 ? "amber" : "red";
  const zoneText = zone === "green" ? "Зелёная зона" : zone === "amber" ? "Жёлтая зона — внимание" : "Красная зона — действия";
  const zoneCls = zone === "green"
    ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
    : zone === "amber"
    ? "bg-amber-50/70 border-amber-200 text-amber-900"
    : "bg-rose-50/70 border-rose-200 text-rose-900";
  const zoneDot = zone === "green" ? "bg-emerald-500" : zone === "amber" ? "bg-amber-500" : "bg-rose-500";
  const zoneRing = zone === "green" ? "ring-emerald-200" : zone === "amber" ? "ring-amber-200" : "ring-rose-200";

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft">
        <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full gradient-accent opacity-12 blur-3xl pointer-events-none animate-float" />
        <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-lime-300 opacity-10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-foreground-soft font-medium">
                {isReal ? "Личный кабинет (вы вошли)" : "Личный кабинет фермера · демо-режим"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">{farmer.legalName}</h1>
              <div className="text-sm text-foreground-soft mt-1">
                {farmer.ownerFio} {farmer.bin && farmer.bin !== "—" && <>· БИН/ИИН <span className="font-mono text-foreground/80">{farmer.bin}</span></>}
              </div>
              <div className="text-sm text-foreground-soft mt-0.5">{farmer.region.oblast}, {farmer.region.rayon}</div>
              {isReal && userFields.length > 0 && (
                <div className="text-xs text-foreground/70 mt-2">
                  Привязано через Гипрозем: <strong>{userFields.length}</strong> хозяйств · {userFields.reduce((s, f) => s + f.parcels, 0)} участков
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 self-start">
              {isReal ? <LogoutButton /> : (
                <>
                  <span className="text-xs text-foreground-soft">демо-вход:</span>
                  <FarmerSwitcher activeId={farmer.id} />
                </>
              )}
            </div>
          </div>
          <div className={`mt-6 px-4 py-3.5 rounded-xl border ring-1 ${zoneRing} text-sm ${zoneCls}`}>
            <div className="flex items-center gap-2 font-semibold">
              <span className={`w-2 h-2 rounded-full ${zoneDot} animate-pulse`} />
              {zoneText}
            </div>
            <div className="text-foreground/80 mt-1">
              Скоринг эффективности: <strong>{efficiency}/100</strong>.
              {zone === "green" && " Продолжайте в том же духе."}
              {zone === "amber" && " Есть факторы, на которые стоит обратить внимание."}
              {zone === "red" && " Срочно проверьте рекомендации ниже."}
            </div>
          </div>
        </div>
      </div>

      {!isReal && verdict && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<IconCoin size={14} />} label="Получено субсидий" value={formatTenge(verdict.totalSubsidyTenge)} sub={`сезон ${season?.year ?? herd?.year ?? "—"}`} />
          <Stat icon={<IconChart size={14} />} label="Эффективность" value={`${efficiency}/100`} accent={zone === "green" ? "ok" : zone === "amber" ? "warn" : "high"} />
          <Stat
            icon={<IconSprout size={14} />}
            label="Потенциал поля"
            value={exp ? `${exp.expected} ц/га` : "—"}
            sub={season ? `${CROP_LABEL[season.crop]} · эталон ${exp?.base} ц/га` : "—"}
          />
          <Stat
            icon={<IconFile size={14} />}
            label="Заявлено в Qoldau"
            value={season ? `${season.declaredYieldCha} ц/га` : "—"}
            sub={exp && season ? (season.declaredYieldCha > exp.expected * 1.2 ? "выше потенциала" : "в норме") : undefined}
            accent={exp && season ? (season.declaredYieldCha > exp.expected * 1.2 ? "high" : "ok") : undefined}
          />
        </section>
      )}

      {isReal && userFields.length > 0 && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<IconBuilding size={14} />} label="Хозяйств" value={userFields.length} />
          <Stat icon={<IconLayers size={14} />} label="Участков" value={userFields.reduce((s, f) => s + f.parcels, 0)} />
          <Stat
            icon={<IconSprout size={14} />}
            label="Средний P в почве"
            value={`${avgFieldP(userFields).toFixed(1)} мг/кг`}
            sub="по всем привязкам"
            accent={avgFieldP(userFields) < 15 ? "warn" : "ok"}
          />
          <Stat icon={<IconChart size={14} />} label="Эффективность" value={`${efficiency}/100`} accent={zone === "green" ? "ok" : zone === "amber" ? "warn" : "high"} />
        </section>
      )}

      <Card>
        <CardHeader title={`Рекомендации · ${advice.length}`} subtitle={isReal ? "На основе ваших привязанных участков Гипрозема." : "Действия от AI-помощника на основе ваших данных."} />
        <div className="divide-y divide-border">
          {advice.map((a) => <AdviceItem key={a.id} a={a} farmerQuery={q} />)}
        </div>
      </Card>

      {!isReal && (
        <AiInsight
          farmerId={farmer.id}
          mode="farmer_chat"
          description="Задайте вопрос — получите развёрнутый ответ от GPT-4o с учётом всех ваших данных."
        />
      )}

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ModuleTile href={`/farmer/passport${q}`} icon={<IconMap size={18} />} title="Цифровой паспорт участка" desc="Агрохимия каждого поля, динамика и потенциал" />
        <ModuleTile href={`/farmer/calculator${q}`} icon={<IconCalculator size={18} />} title="Калькулятор субсидий" desc="Какой объём удобрений и какой урожай — оптимально" />
        <ModuleTile href={`/farmer/meteo${q}`} icon={<IconCloud size={18} />} title="Метео-ассистент" desc="Реальная погода Open-Meteo + страховые риски" />
        <ModuleTile href={`/farmer/applications${q}`} icon={<IconFile size={18} />} title="Заявки и документы" desc="Чеки, счета, статус заявок в Qoldau" />
      </section>
    </div>
  );
}

function avgFieldP(fields: import("@/lib/users-store").UserField[]): number {
  const v = fields.map((f) => f.sample?.p ?? 0).filter((v): v is number => v != null && v > 0);
  if (v.length === 0) return 0;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function scoreFromUserFields(fields: import("@/lib/users-store").UserField[]): number {
  if (fields.length === 0) return 60;
  const avgP = avgFieldP(fields);
  const gums = fields.map((f) => f.sample?.gum ?? 0).filter((v): v is number => v != null && v > 0);
  const meanGum = gums.length ? gums.reduce((s, x) => s + x, 0) / gums.length : 2;
  let score = 100;
  if (avgP < 8) score -= 35; else if (avgP < 15) score -= 20;
  if (meanGum < 2) score -= 25; else if (meanGum < 3) score -= 12;
  return Math.max(10, Math.round(score));
}

function buildRealAdvice(user: User): Advice[] {
  const out: Advice[] = [];
  for (const f of user.fields) {
    if ((f.sample?.p ?? 99) < 8) {
      out.push({
        id: `p-${f.nazvxoz}`,
        level: "alert",
        title: `Острый дефицит фосфора: ${f.nazvxoz}`,
        body: `По данным Гипрозема P=${f.sample.p} мг/кг (норма ≥ 15). Без фосфорных удобрений потенциал участка падает на 40%+. Закажите 60–80 кг/га суперфосфата.`,
        action: "Открыть калькулятор", module: "calculator",
      });
    } else if ((f.sample?.p ?? 99) < 15) {
      out.push({
        id: `p2-${f.nazvxoz}`,
        level: "warn",
        title: `Дефицит фосфора: ${f.nazvxoz}`,
        body: `P=${f.sample.p} мг/кг (норма ≥ 15). Заложите фосфорные удобрения в план следующего сезона.`,
      });
    }
    if ((f.sample?.gum ?? 99) < 2) {
      out.push({
        id: `g-${f.nazvxoz}`,
        level: "warn",
        title: `Бедный гумус: ${f.nazvxoz}`,
        body: `Гумус ${f.sample.gum}% (норма ≥ 3%). Запланируйте внесение 25–30 т/га органики или сидераты на зелёное удобрение.`,
      });
    }
    if (f.sample?.yearob && f.sample.yearob < new Date().getFullYear() - 6) {
      out.push({
        id: `y-${f.nazvxoz}`,
        level: "info",
        title: `Старое обследование: ${f.nazvxoz}`,
        body: `Последнее агрохимобследование — ${f.sample.yearob} год. Закажите новое (по нормам — раз в 4–5 лет).`,
      });
    }
  }
  if (out.length === 0) {
    out.push({
      id: "all-good",
      level: "info",
      title: "Хозяйство в норме",
      body: "По вашим привязкам Гипрозема состояние почв удовлетворительное. Подавайте субсидии без опасений за обоснованность.",
    });
  }
  return out;
}

function AdviceItem({ a, farmerQuery }: { a: Advice; farmerQuery: string }) {
  const cls: Record<string, string> = {
    info:  "bg-sky-50 border-sky-200 text-sky-900",
    tip:   "bg-emerald-50 border-emerald-200 text-emerald-900",
    warn:  "bg-amber-50 border-amber-200 text-amber-900",
    alert: "bg-rose-50 border-rose-200 text-rose-900",
  };
  const stripe: Record<string, string> = {
    info:  "bg-sky-500",
    tip:   "bg-emerald-500",
    warn:  "bg-amber-500",
    alert: "bg-rose-500",
  };
  const label: Record<string, string> = { info: "инфо", tip: "совет", warn: "внимание", alert: "критично" };
  return (
    <div className="relative px-5 py-4 hover:bg-muted-2/40 transition">
      <span className={`absolute left-0 top-4 bottom-4 w-0.5 rounded-r-full ${stripe[a.level]}`} aria-hidden />
      <div className="flex items-start gap-3 pl-2">
        <span className={`text-[10.5px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${cls[a.level]} shrink-0 mt-0.5`}>
          {label[a.level]}
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold">{a.title}</div>
          <div className="text-sm text-foreground/80 mt-1 leading-relaxed">{a.body}</div>
          {a.action && a.module && (
            <Link href={`/farmer/${a.module}${farmerQuery}`} className="group inline-flex items-center gap-1 mt-2 text-sm font-medium text-emerald-700 hover:text-emerald-800">
              {a.action}
              <IconArrowRight size={13} className="transition group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ModuleTile({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group block bg-card border border-border-soft rounded-2xl p-5 shadow-soft lift hover:border-accent/50"
    >
      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center group-hover:gradient-accent group-hover:text-white transition">
        {icon}
      </div>
      <div className="text-sm font-semibold tracking-tight mt-4">{title}</div>
      <div className="text-xs text-foreground-soft mt-1.5 leading-relaxed">{desc}</div>
      <div className="text-xs font-medium text-emerald-700 mt-4 inline-flex items-center gap-1">
        Открыть <IconArrowRight size={12} className="transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
