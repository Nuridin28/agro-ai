// Реестр государственных источников данных РК.
// Каждый факт в моке имеет SourceRef → можно проследить происхождение.

export type SourceId =
  | "ISG"          // ИСЖ — Информационная система животноводства
  | "PLEM"         // Plem.kz — Племенная ИАС
  | "VETIS"        // VETIS — ветеринарные справки / РГП «Республиканская ветеринарная лаборатория»
  | "GIPROZEM"     // portal.giprozem.kz — почвенно-агрохимическое обследование
  | "EGKN"         // map.gov4c.kz/egkn — Единая государственная кадастровая система
  | "QOLDAU"       // qoldau.kz — субсидии АПК
  | "GOSAGRO"      // gosagro.kz — портал господдержки АПК
  | "STAT"         // stat.gov.kz — Бюро национальной статистики
  | "AGRODATA"     // agrodata.kz — космоснимки, NDVI, влагозапас
  | "KAZHYDROMET"  // kazhydromet.kz — РГП Казгидромет
  | "KATO";        // КАТО — классификатор адм.-тер. объектов

export interface SourceMeta {
  id: SourceId;
  name: string;
  fullName: string;
  org: string;
  url: string;
  what: string;
  reliability: "official" | "operational" | "satellite";
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  ISG: {
    id: "ISG",
    name: "ИСЖ",
    fullName: "Информационная система идентификации сельскохозяйственных животных",
    org: "МСХ РК / РГП «Казахзооветснаб»",
    url: "https://isg.gov.kz/",
    what: "ИНЖ, ИИН/БИН владельца, акты приплода, движение, падеж, убой",
    reliability: "official",
  },
  PLEM: {
    id: "PLEM",
    name: "Plem.kz",
    fullName: "Информационно-аналитическая система племенного животноводства",
    org: "РПП «Мясной союз Казахстана» / МСХ РК",
    url: "https://plem.kz/",
    what: "Племенные свидетельства, бонитировка, продуктивность родителей",
    reliability: "official",
  },
  VETIS: {
    id: "VETIS",
    name: "VETIS",
    fullName: "Государственная ветеринарная информационная система",
    org: "Комитет ветеринарного контроля и надзора МСХ РК",
    url: "https://vetis.kz/",
    what: "Электронные ветеринарные справки, вакцинация (ящур, бруцеллёз)",
    reliability: "official",
  },
  GIPROZEM: {
    id: "GIPROZEM",
    name: "Гипрозем",
    fullName: "Государственный научно-производственный центр земельных ресурсов и землеустройства",
    org: "РГП «Гипрозем» / Комитет по управлению земельными ресурсами",
    url: "https://portal.giprozem.kz/",
    what: "Балл бонитета, гумус, NPK, микроэлементы, тип растительности на пастбище",
    reliability: "official",
  },
  EGKN: {
    id: "EGKN",
    name: "ЕГКН",
    fullName: "Единая государственная кадастровая система недвижимости",
    org: "АО «НИТ» / Минцифры РК",
    url: "https://map.gov4c.kz/egkn/",
    what: "Кадастровый номер, площадь, целевое назначение, КАТО участка",
    reliability: "official",
  },
  QOLDAU: {
    id: "QOLDAU",
    name: "Qoldau",
    fullName: "Информационная система субсидирования АПК",
    org: "АО «НАЦЭКС» / МСХ РК",
    url: "https://qoldau.kz/",
    what: "Заявки на субсидии, выплаты, объёмы официально закупленных удобрений/семян",
    reliability: "official",
  },
  GOSAGRO: {
    id: "GOSAGRO",
    name: "Госагро",
    fullName: "Портал господдержки АПК",
    org: "МСХ РК",
    url: "https://gosagro.kz/",
    what: "Реестр получателей субсидий, направления господдержки",
    reliability: "official",
  },
  STAT: {
    id: "STAT",
    name: "БНС",
    fullName: "Бюро национальной статистики Агентства по стратегическому планированию и реформам",
    org: "АСПиР РК",
    url: "https://stat.gov.kz/",
    what: "Урожайность по культурам, валовые сборы, реализация скота, средние веса",
    reliability: "official",
  },
  AGRODATA: {
    id: "AGRODATA",
    name: "Agrodata",
    fullName: "Цифровая платформа мониторинга земель сельхозназначения",
    org: "QazInnovations / МСХ РК",
    url: "https://agrodata.kz/",
    what: "NDVI, влагозапас, снежный покров, аномалии вегетации, температурные риски",
    reliability: "satellite",
  },
  KAZHYDROMET: {
    id: "KAZHYDROMET",
    name: "Казгидромет",
    fullName: "РГП «Казгидромет»",
    org: "Министерство экологии и природных ресурсов РК",
    url: "https://www.kazhydromet.kz/",
    what: "Снежный покров, температуры, осадки, агрометеобюллетени, опасные явления",
    reliability: "official",
  },
  KATO: {
    id: "KATO",
    name: "КАТО",
    fullName: "Классификатор административно-территориальных объектов РК",
    org: "Бюро национальной статистики АСПиР РК",
    url: "https://stat.gov.kz/api/klassifikator/kato/",
    what: "Коды область/район/сельский округ для географической привязки",
    reliability: "official",
  },
};

// Универсальная ссылка-доказательство к конкретному факту.
// docId/datasetRef — внешний идентификатор (ИНЖ, кадастровый №, № справки и т.п.).
export interface SourceRef {
  source: SourceId;
  docId: string;
  fetchedAt: string; // ISO date
  note?: string;
}

export function describeSource(ref: SourceRef): string {
  const s = SOURCES[ref.source];
  return `${s.name} · ${ref.docId}`;
}
