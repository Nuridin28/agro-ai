// Геодезические расчёты по полигону поля (lon/lat).
// Используется для отображения площади в UI и в инструментах верификации
// заявленных размеров полей.

import type { FieldPolygon } from "./types";

const EARTH_RADIUS_M = 6371008.8; // средний радиус сферы WGS84

// Площадь полигона на сфере по формуле Бэвиса-Камбарелли (упрощённая).
// Принимает [lon, lat][] в градусах. Возвращает площадь в м² (по модулю,
// направление обхода не важно).
//
// Точность: на широтах KZ ~0.1 % для полей до 100 га — этого достаточно
// для интерфейса фермера/инспектора. Для кадастра нужна точная геодезия,
// но в наших масштабах сферическая модель ошибается меньше, чем сам
// контур из Гипрозема.
export function polygonAreaM2(polygon: FieldPolygon): number {
  if (polygon.length < 3) return 0;
  // Замыкаем кольцо, если оно не замкнуто (для устойчивости расчёта).
  const ring = ringIsClosed(polygon) ? polygon : [...polygon, polygon[0]];

  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const sLat1 = Math.sin((lat1 * Math.PI) / 180);
    const sLat2 = Math.sin((lat2 * Math.PI) / 180);
    total += dLng * (2 + sLat1 + sLat2);
  }
  const area = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return area;
}

export function polygonAreaHa(polygon: FieldPolygon): number {
  return polygonAreaM2(polygon) / 10_000;
}

// Длина периметра в метрах. Используется как sanity-чек: «поле 100 га с
// периметром 50 км» — очевидно вытянутый полигон или дыра в координатах.
export function polygonPerimeterM(polygon: FieldPolygon): number {
  if (polygon.length < 2) return 0;
  const ring = ringIsClosed(polygon) ? polygon : [...polygon, polygon[0]];
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    total += haversineM(ring[i], ring[i + 1]);
  }
  return total;
}

// Габариты bbox в метрах (по широте и по долготе на средней широте).
// Удобно для подписи «поле ~600 × 1100 м».
export function polygonBboxDims(polygon: FieldPolygon): { widthM: number; heightM: number } {
  if (polygon.length < 2) return { widthM: 0, heightM: 0 };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of polygon) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const meanLat = (minLat + maxLat) / 2;
  const widthM = haversineM([minLng, meanLat], [maxLng, meanLat]);
  const heightM = haversineM([minLng, minLat], [minLng, maxLat]);
  return { widthM, heightM };
}

function ringIsClosed(polygon: FieldPolygon): boolean {
  if (polygon.length < 2) return false;
  const a = polygon[0], b = polygon[polygon.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function haversineM(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a, [lng2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
