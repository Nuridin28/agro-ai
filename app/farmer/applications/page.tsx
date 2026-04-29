import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveFarmerSession, farmerQuery } from "@/lib/farmer-context";
import { Card, CardHeader, CategoryBadge, formatTenge, SourcePill, Stat } from "@/components/ui";
import { FarmerSwitcher } from "@/components/FarmerSwitcher";
import { AiInsight } from "@/components/AiInsight";
import { ApplicationForm } from "@/components/ApplicationForm";
import { LogoutButton } from "@/components/LogoutButton";
import { buildFarmerApplications, breakdownByCategory, type ApplicationStatus, type SubsidyApplication } from "@/lib/subsidies";
import { getStoredApplicationsFor } from "@/lib/applications-store";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const session = await resolveFarmerSession(as);
  if (!session) redirect("/login");

  const isReal = session.kind === "real";
  const farmer = session.farmer;
  const q = isReal ? "" : farmerQuery(farmer.id);

  // Мок-история заявок есть только для демо-фермеров (она строится из мок-данных
  // verify-движка). Для реальных пользователей берём только то, что они сами
  // подали — нет смысла приписывать им чужие фейковые заявки.
  const mockApps = isReal ? [] : buildFarmerApplications(farmer.id);
  const stored = await getStoredApplicationsFor(farmer.id);
  // Пользовательские заявки сверху (по дате), затем мок-история.
  const userApps: SubsidyApplication[] = stored.map((s) => ({
    id: s.id,
    farmerId: s.farmerId,
    category: s.category,
    type: s.type,
    scope: s.scope,
    amount: s.amount,
    riskTenge: 0,
    status: s.status,
    date: s.date,
  }));
  const apps = [...userApps, ...mockApps];
  const breakdown = breakdownByCategory(apps);

  const total = apps.reduce((s, a) => s + a.amount, 0);
  const accepted = apps.filter((a) => a.status === "Принята").reduce((s, a) => s + a.amount, 0);
  const review = apps.filter((a) => a.status !== "Принята" && a.status !== "Отклонена").length;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-foreground/60">Цифровая подача заявок · Qoldau / gosagro</div>
            <h1 className="text-xl font-bold tracking-tight mt-1">{farmer.legalName}</h1>
            <div className="text-sm text-foreground/70 mt-0.5">БИН/ИИН <span className="font-mono">{farmer.bin}</span></div>
          </div>
          {isReal ? <LogoutButton /> : <FarmerSwitcher activeId={farmer.id} />}
        </div>
      </Card>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Заявок всего" value={apps.length} />
        <Stat label="На рассмотрении" value={review} accent={review > 0 ? "warn" : "ok"} />
        <Stat label="Запрошено" value={formatTenge(total)} />
        <Stat label="Принято к выплате" value={formatTenge(accepted)} accent={accepted > 0 ? "ok" : undefined} />
      </section>

      {breakdown.length > 0 && (
        <Card>
          <CardHeader title="Распределение по типам субсидий" subtitle="По каждому направлению — сумма, статус и оценка риска от движка верификации" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">Тип</th>
                  <th className="px-3 py-2 font-medium text-right">Заявок</th>
                  <th className="px-3 py-2 font-medium text-right">Сумма</th>
                  <th className="px-3 py-2 font-medium text-right">Под риском ₸</th>
                  <th className="px-3 py-2 font-medium text-right">Не принято</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.category} className="border-t border-border align-top">
                    <td className="px-5 py-2.5"><CategoryBadge category={row.category} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.applicationsCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatTenge(row.amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.riskTenge > 0 ? <span className="text-rose-700 font-medium">{formatTenge(row.riskTenge)}</span> : <span className="text-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.pendingCount > 0 ? row.pendingCount : <span className="text-foreground/40">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Реестр заявок" subtitle="Чеки и счета-фактуры подтягиваются автоматически из Qoldau (для демо — мок-данные)" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/60 bg-muted/60 text-left">
              <tr>
                <th className="px-5 py-2 font-medium">№ заявки</th>
                <th className="px-3 py-2 font-medium">Тип</th>
                <th className="px-3 py-2 font-medium">Объект</th>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium text-right">Сумма</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Источник</th>
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-foreground/60">Пока нет заявок</td></tr>
              )}
              {apps.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="px-5 py-3 font-mono text-xs">{a.id}</td>
                  <td className="px-3 py-3">
                    <CategoryBadge category={a.category} />
                    <div className="text-[11px] text-foreground/60 mt-1">{a.type}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-foreground/80">{a.scope}</td>
                  <td className="px-3 py-3 font-mono text-xs">{a.date}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatTenge(a.amount)}</td>
                  <td className="px-3 py-3"><StatusBadge s={a.status} /></td>
                  <td className="px-3 py-3">{a.source ? <SourcePill source={a.source} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AiInsight
        farmerId={farmer.id}
        mode="farmer_chat"
        description="Спросите AI, по какому типу субсидий у вас больше всего риска и что нужно поправить, чтобы заявки точно приняли."
        buttonLabel="Получить совет от OpenAI"
      />

      <Card className="p-5">
        <div className="text-sm font-semibold mb-1">Подать новую заявку</div>
        <p className="text-xs text-foreground/70 mb-4">
          Заявка моментально попадёт в реестр со статусом «На проверке».
          В проде форма дополнительно проверит бонитет → ожидаемый сбор →
          разумность заявленных цифр и не даст подать заведомо рискованную заявку.
        </p>
        <ApplicationForm farmerId={farmer.id} />
      </Card>

      <div className="text-center">
        <Link href={`/farmer${q}`} className="text-sm text-foreground/60 hover:underline">← Вернуться в кабинет</Link>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: ApplicationStatus }) {
  const map: Record<ApplicationStatus, string> = {
    "Принята":              "bg-emerald-100 text-emerald-900 border-emerald-300",
    "На проверке":          "bg-sky-100 text-sky-900 border-sky-300",
    "Запрос документов":    "bg-amber-100 text-amber-900 border-amber-300",
    "Отклонена":            "bg-rose-100 text-rose-900 border-rose-300",
  };
  return <span className={`text-[11px] font-medium border rounded px-2 py-0.5 ${map[s]}`}>{s}</span>;
}
