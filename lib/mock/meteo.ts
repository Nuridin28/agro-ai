import type { MeteoSeason } from "../types";
import type { SourceRef } from "../sources";

const FETCHED = "2025-09-30T10:00:00Z";

const k = (kato: string, doc: string): SourceRef => ({
  source: "KAZHYDROMET", docId: doc, fetchedAt: FETCHED, note: `Бюллетень для КАТО ${kato}`,
});
const a = (kato: string, doc: string): SourceRef => ({
  source: "AGRODATA", docId: doc, fetchedAt: FETCHED, note: `NDVI/влагозапас по КАТО ${kato}`,
});

// Сезонные метеоданные на сезон 2024-2025 (зима + вегетация 2024).
// Смысл цифр:
// - swEqMm — водный эквивалент снега к началу таяния (норма степной зоны 150-200 мм)
// - snowMeltDate — фактическая дата схода снежного покрова
// - soilWarmDate — прогрев почвы до +8°C на глубине 5 см (для посева яровых)
// - augSepRainfallMm — осадки уборки (риск ухода под снег при >120 мм)
// - minWinterC и maxSnowDepthCm — для скотоводства (расход кормов)

export const METEO: MeteoSeason[] = [
  {
    regionKato: "591620100", year: 2024,
    swEqMm: 195, snowMeltDate: "2024-04-12", soilWarmDate: "2024-05-04",
    springWindStress: false, augSepRainfallMm: 78,
    minWinterC: -34, maxSnowDepthCm: 35,
    source: k("591620100", "KGM-SKO-2024-Q1"),
    agrodataSource: a("591620100", "AD-NDVI-591620100-2024"),
  },
  {
    regionKato: "391650100", year: 2024,
    // Малоснежная зима в Аулиекольском — водный эквивалент 95 мм (-50% от нормы),
    // ранний сход и черные бури: классический риск дефицита влаги
    swEqMm: 95, snowMeltDate: "2024-03-22", soilWarmDate: "2024-04-26",
    springWindStress: true, augSepRainfallMm: 42,
    minWinterC: -32, maxSnowDepthCm: 30,
    source: k("391650100", "KGM-KST-2024-Q1"),
    agrodataSource: a("391650100", "AD-NDVI-391650100-2024"),
  },
  {
    regionKato: "111630100", year: 2024,
    // Аршалынский — наоборот, обильный снег и поздняя весна, прогрев только 22 мая
    swEqMm: 270, snowMeltDate: "2024-05-05", soilWarmDate: "2024-05-22",
    springWindStress: false, augSepRainfallMm: 165,
    minWinterC: -30, maxSnowDepthCm: 55,
    source: k("111630100", "KGM-AKM-2024-Q1"),
    agrodataSource: a("111630100", "AD-NDVI-111630100-2024"),
  },
  {
    regionKato: "631620100", year: 2024,
    swEqMm: 175, snowMeltDate: "2024-04-08", soilWarmDate: "2024-04-30",
    springWindStress: false, augSepRainfallMm: 95,
    minWinterC: -28, maxSnowDepthCm: 25,
    source: k("631620100", "KGM-VKO-2024-Q1"),
    agrodataSource: a("631620100", "AD-NDVI-631620100-2024"),
  },
  {
    regionKato: "196840100", year: 2024,
    swEqMm: 120, snowMeltDate: "2024-03-15", soilWarmDate: "2024-04-12",
    springWindStress: false, augSepRainfallMm: 56,
    minWinterC: -18, maxSnowDepthCm: 15,
    source: k("196840100", "KGM-ALM-2024-Q1"),
    agrodataSource: a("196840100", "AD-NDVI-196840100-2024"),
  },
  {
    regionKato: "273620100", year: 2024,
    swEqMm: 140, snowMeltDate: "2024-04-02", soilWarmDate: "2024-04-22",
    springWindStress: false, augSepRainfallMm: 65,
    minWinterC: -30, maxSnowDepthCm: 28,
    source: k("273620100", "KGM-ZKO-2024-Q1"),
    agrodataSource: a("273620100", "AD-NDVI-273620100-2024"),
  },
  {
    regionKato: "553620100", year: 2024,
    // Иртышский — рекордно холодная и снежная зима 2024-2025
    swEqMm: 240, snowMeltDate: "2024-04-18", soilWarmDate: "2024-05-08",
    springWindStress: false, augSepRainfallMm: 88,
    minWinterC: -42, maxSnowDepthCm: 65,
    source: k("553620100", "KGM-PVL-2024-Q1"),
    agrodataSource: a("553620100", "AD-NDVI-553620100-2024"),
  },
];

export function meteoFor(katoCode: string, year: number): MeteoSeason | undefined {
  return METEO.find((m) => m.regionKato === katoCode && m.year === year);
}
