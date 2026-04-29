import { SOURCES } from "@/lib/sources";
import { Card, CardHeader } from "@/components/ui";

const ORDER = ["KATO", "EGKN", "GIPROZEM", "QOLDAU", "GOSAGRO", "STAT", "ISG", "PLEM", "VETIS", "AGRODATA", "KAZHYDROMET"] as const;

const RELIABILITY_LABEL: Record<string, string> = {
  official: "официальный реестр",
  operational: "операционная система",
  satellite: "спутник / ДЗЗ",
};

export default function SourcesPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Реестр источников данных</h1>
        <p className="text-sm text-foreground/70 mt-1 max-w-3xl">
          Каждый факт в досье фермера ссылается на один из ниже перечисленных госисточников. Комиссия может перейти по ссылке и проверить
          оригинал документа (кадастровая выписка, ветеринарная справка, агрохимический паспорт, бюллетень и т.д.) по идентификатору, указанному
          в «пилюле» источника.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-3">
        {ORDER.map((id) => {
          const s = SOURCES[id];
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="font-semibold">{s.name} <span className="text-xs text-foreground/50 font-normal">· {s.id}</span></div>
                  <div className="text-xs text-foreground/60 mt-0.5">{s.fullName}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-foreground/60 border border-border bg-muted px-1.5 py-0.5 rounded">{RELIABILITY_LABEL[s.reliability]}</span>
              </div>
              <div className="text-xs text-foreground/70 mt-3">{s.org}</div>
              <div className="text-sm mt-2 leading-relaxed">{s.what}</div>
              <a href={s.url} target="_blank" rel="noopener" className="text-sm text-accent underline mt-3 inline-block">{s.url}</a>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <CardHeader title="Принцип прослеживаемости" />
        <ol className="text-sm text-foreground/80 list-decimal pl-5 space-y-1.5 px-5 pb-4">
          <li>Каждое поле в моке несёт <code className="kbd">SourceRef</code> — id системы + внешний идентификатор документа.</li>
          <li>Все доказательства внутри Finding также имеют <code className="kbd">source</code> — двойная привязка факта.</li>
          <li>Идентификаторы документов соответствуют форматам соответствующих систем: ИНЖ для ИСЖ, кадастровый № для ЕГКН, БНС-номер формы для статистики.</li>
          <li>В продакшне эти ссылки переадресуют на конкретный документ через защищённый шлюз СМЭ-госорганов.</li>
        </ol>
      </Card>
    </div>
  );
}
