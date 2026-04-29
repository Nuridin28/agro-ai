import type { Farmer } from "../types";

const T = "2025-09-15T08:00:00Z"; // дата выгрузки реестра в Qoldau

export const FARMERS: Farmer[] = [
  // ───── СКО, Кызылжарский район — пул для регионального эталона по земледелию ─────
  {
    id: "F-001",
    legalName: "ТОО «Кызылжар-Агро»",
    ownerFio: "Сапаров Ермек Болатович",
    bin: "060540004127",
    sector: "crop",
    region: { oblast: "Северо-Казахстанская обл.", rayon: "Кызылжарский р-н", okrug: "Бесколь",  katoCode: "591620100" },
    registeredAt: "2018-04-12",
    source: { source: "QOLDAU", docId: "QO-060540004127", fetchedAt: T, note: "Реестр получателей субсидий" },
  },
  {
    id: "F-002",
    legalName: "ТОО «Уалихан-Дан»",
    ownerFio: "Жакыпов Талгат Серикович",
    bin: "070240008611",
    sector: "crop",
    region: { oblast: "Северо-Казахстанская обл.", rayon: "Кызылжарский р-н", okrug: "Якорь", katoCode: "591620100" },
    registeredAt: "2017-03-22",
    source: { source: "QOLDAU", docId: "QO-070240008611", fetchedAt: T },
  },
  {
    id: "F-003",
    legalName: "КХ «Жасыл-Дала»",
    ownerFio: "Нурпеисов Аскар Маратович",
    bin: "830514350712", // ИИН
    sector: "crop",
    region: { oblast: "Костанайская обл.", rayon: "Аулиекольский р-н", okrug: "Аулиеколь", katoCode: "391650100" },
    registeredAt: "2019-06-10",
    source: { source: "QOLDAU", docId: "QO-830514350712", fetchedAt: T },
  },
  {
    id: "F-004",
    legalName: "ТОО «Степные горизонты»",
    ownerFio: "Тлеубаев Олжас Куатович",
    bin: "100240010188",
    sector: "crop",
    region: { oblast: "Акмолинская обл.", rayon: "Аршалынский р-н", okrug: "Аршалы", katoCode: "111630100" },
    registeredAt: "2016-09-03",
    source: { source: "QOLDAU", docId: "QO-100240010188", fetchedAt: T },
  },
  {
    id: "F-005",
    legalName: "ТОО «Тобол-Агро»",
    ownerFio: "Касенов Ринат Бакытович",
    bin: "110340023401",
    sector: "crop",
    region: { oblast: "Костанайская обл.", rayon: "Аулиекольский р-н", okrug: "Тимирязевское", katoCode: "391650100" },
    registeredAt: "2015-11-19",
    source: { source: "QOLDAU", docId: "QO-110340023401", fetchedAt: T },
  },
  {
    id: "F-006",
    legalName: "КХ «Айман-Жер»",
    ownerFio: "Айманов Ерлан Серикович",
    bin: "780820301044", // ИИН
    sector: "crop",
    region: { oblast: "Северо-Казахстанская обл.", rayon: "Кызылжарский р-н", okrug: "Налобино", katoCode: "591620100" },
    registeredAt: "2020-02-14",
    source: { source: "QOLDAU", docId: "QO-780820301044", fetchedAt: T },
  },

  // ───── Скотоводство ─────
  {
    id: "F-007",
    legalName: "КХ «Аулиекол-Бар»",
    ownerFio: "Бектурганов Дамир Аскарович",
    bin: "800314400123",
    sector: "livestock",
    region: { oblast: "Костанайская обл.", rayon: "Аулиекольский р-н", okrug: "Сулыколь", katoCode: "391650100" },
    registeredAt: "2016-05-23",
    source: { source: "QOLDAU", docId: "QO-800314400123", fetchedAt: T },
  },
  {
    id: "F-008",
    legalName: "ТОО «Ангус-Эталон»",
    ownerFio: "Орынбаев Мурат Жанатович",
    bin: "120140017719",
    sector: "livestock",
    region: { oblast: "Восточно-Казахстанская обл.", rayon: "Бескарагайский р-н", okrug: "Бескарагай", katoCode: "631620100" },
    registeredAt: "2014-08-30",
    source: { source: "QOLDAU", docId: "QO-120140017719", fetchedAt: T },
  },
  {
    id: "F-009",
    legalName: "КХ «Бай-Мал»",
    ownerFio: "Сейдахметов Тимур Алибекович",
    bin: "850920400256",
    sector: "livestock",
    region: { oblast: "Алматинская обл.", rayon: "Енбекшиказахский р-н", okrug: "Шелек", katoCode: "196840100" },
    registeredAt: "2019-10-14",
    source: { source: "QOLDAU", docId: "QO-850920400256", fetchedAt: T },
  },
  {
    id: "F-010",
    legalName: "ТОО «Племкор»",
    ownerFio: "Калымбетов Серик Аскарович",
    bin: "130540027845",
    sector: "livestock",
    region: { oblast: "Северо-Казахстанская обл.", rayon: "Кызылжарский р-н", okrug: "Соколовка", katoCode: "591620100" },
    registeredAt: "2015-03-11",
    source: { source: "QOLDAU", docId: "QO-130540027845", fetchedAt: T },
  },
  {
    id: "F-011",
    legalName: "КХ «Жайляу-Жер»",
    ownerFio: "Тулеуов Бауыржан Маратович",
    bin: "770814300521",
    sector: "livestock",
    region: { oblast: "Восточно-Казахстанская обл.", rayon: "Бескарагайский р-н", okrug: "Канонерка", katoCode: "631620100" },
    registeredAt: "2018-12-04",
    source: { source: "QOLDAU", docId: "QO-770814300521", fetchedAt: T },
  },
  {
    id: "F-012",
    legalName: "ТОО «Карасу-Маль»",
    ownerFio: "Жангалиев Канат Маратович",
    bin: "140840031412",
    sector: "livestock",
    region: { oblast: "Западно-Казахстанская обл.", rayon: "Зеленовский р-н", okrug: "Зеленое", katoCode: "273620100" },
    registeredAt: "2017-06-29",
    source: { source: "QOLDAU", docId: "QO-140840031412", fetchedAt: T },
  },
  {
    id: "F-013",
    legalName: "КХ «Зимняк-Кор»",
    ownerFio: "Акмолда Серик Куанышевич",
    bin: "810112400889",
    sector: "livestock",
    region: { oblast: "Павлодарская обл.", rayon: "Иртышский р-н", okrug: "Иртышск", katoCode: "553620100" },
    registeredAt: "2016-11-18",
    source: { source: "QOLDAU", docId: "QO-810112400889", fetchedAt: T },
  },

  // ───── Mixed ─────
  {
    id: "F-014",
    legalName: "ТОО «Агро-Универсал»",
    ownerFio: "Дюсембаев Нурлан Бекболатович",
    bin: "150240035601",
    sector: "mixed",
    region: { oblast: "Северо-Казахстанская обл.", rayon: "Кызылжарский р-н", okrug: "Прибрежное", katoCode: "591620100" },
    registeredAt: "2015-07-08",
    source: { source: "QOLDAU", docId: "QO-150240035601", fetchedAt: T },
  },
];

export function findFarmer(id: string): Farmer | undefined {
  return FARMERS.find((f) => f.id === id);
}
