// Координаты центров районов КАТО (для запросов погоды по lat/lng).
// Берутся из ЕГКН/каталога Гипрозема. Для регионов вне списка fallback-метод —
// взять центр первого слоя соответствующей области из giprozem-catalog.

export interface KatoPoint { lat: number; lng: number; label: string; }

export const KATO_COORDS: Record<string, KatoPoint> = {
  "591620100": { lat: 54.85, lng: 69.13, label: "Кызылжарский район, СКО" },
  "391650100": { lat: 52.78, lng: 64.02, label: "Аулиекольский район, Костанайская обл." },
  "111630100": { lat: 51.27, lng: 71.97, label: "Аршалынский район, Акмолинская обл." },
  "631620100": { lat: 50.85, lng: 79.21, label: "Бескарагайский район, ВКО" },
  "196840100": { lat: 43.59, lng: 78.27, label: "Енбекшиказахский район, Алматинская обл." },
  "273620100": { lat: 51.22, lng: 51.29, label: "Зеленовский район, ЗКО" },
  "553620100": { lat: 53.32, lng: 75.45, label: "Иртышский район, Павлодарская обл." },
};

export function coordsForKato(katoCode: string): KatoPoint | null {
  return KATO_COORDS[katoCode] ?? null;
}
