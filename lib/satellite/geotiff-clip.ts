// Парсер GeoTIFF + усреднение значений внутри полигона.
// Используется для расчёта mean coherence γ из тайла, который вернул HyP3.
//
// Полностью на Node — geotiff.js работает без браузерных API.

import { fromArrayBuffer, type GeoTIFFImage } from "geotiff";
import type { FieldPolygon } from "./types";

export interface ClipMeanResult {
  mean: number;        // среднее значение пикселей внутри полигона
  count: number;       // сколько пикселей участвовало
  min: number;
  max: number;
}

// Главная функция: читает .tif из buffer, выбирает пиксели внутри полигона,
// считает среднее. Полигон в [lng, lat] (WGS84).
//
// Допущение: GeoTIFF в одной из ровных проекций (UTM, web-mercator, EPSG:4326).
// HyP3 обычно отдаёт EPSG:4326 или UTM. Мы используем bbox tile-а и
// reproject координат полигона в pixel coords через GeoKeys.
export async function clipMeanGeoTIFF(tifBuffer: Buffer, polygon: FieldPolygon): Promise<ClipMeanResult | null> {
  // geotiff.js принимает ArrayBuffer; конвертим из Node Buffer.
  const ab = tifBuffer.buffer.slice(tifBuffer.byteOffset, tifBuffer.byteOffset + tifBuffer.byteLength) as ArrayBuffer;
  const tiff = await fromArrayBuffer(ab);
  const image = await tiff.getImage();

  // Геопривязка
  const bbox = image.getBoundingBox();      // [minX, minY, maxX, maxY] в проекции tile-а
  const width = image.getWidth();
  const height = image.getHeight();
  const pxX = (bbox[2] - bbox[0]) / width;  // шаг по X в единицах проекции
  const pxY = (bbox[3] - bbox[1]) / height; // шаг по Y (положителен, потом инвертируем для row)

  // Полигон в координатах tile-а. HyP3 в основном выдает EPSG:4326 (lng/lat
  // прямо как у нас), но может быть UTM в северных широтах. Для UTM нам
  // нужен ProjReverse — но это уже отдельный пакет (proj4 / proj4js).
  //
  // Простой path: если bbox в диапазоне -180..180 (X) и -90..90 (Y), считаем
  // что это EPSG:4326 и используем lng/lat напрямую. Иначе предупреждаем.
  const looksLikeWGS84 = bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90;
  if (!looksLikeWGS84) {
    console.warn("[geotiff-clip] tile не в EPSG:4326, нужен proj4-reproject (skipping)");
    return null;
  }

  // Читаем первый band (coherence обычно single-band float32 в HyP3).
  const raster = await image.readRasters({ samples: [0], interleave: true });
  const data = raster as unknown as Float32Array | Int16Array | Uint16Array;

  // Bounding box полигона — чтобы не обходить всю тайл, а только нужный регион.
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of polygon) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  // Внутреннее окно tile-а, пересекающееся с polygon bbox.
  const c0 = Math.max(0, Math.floor((minLng - bbox[0]) / pxX));
  const c1 = Math.min(width, Math.ceil((maxLng - bbox[0]) / pxX));
  // Y инвертирован: row 0 — это maxLat, row H-1 — minLat.
  const r0 = Math.max(0, Math.floor((bbox[3] - maxLat) / pxY));
  const r1 = Math.min(height, Math.ceil((bbox[3] - minLat) / pxY));

  let sum = 0, n = 0, mn = Infinity, mx = -Infinity;
  for (let row = r0; row < r1; row++) {
    const pxLat = bbox[3] - (row + 0.5) * pxY;
    for (let col = c0; col < c1; col++) {
      const pxLng = bbox[0] + (col + 0.5) * pxX;
      if (!pointInPolygon(pxLng, pxLat, polygon)) continue;
      const v = (data as ArrayLike<number>)[row * width + col];
      if (!Number.isFinite(v)) continue;
      if (v === 0) continue; // nodata mask в HyP3 coherence — 0
      sum += v;
      n++;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }

  if (n === 0) return null;
  return {
    mean: sum / n,
    count: n,
    min: mn,
    max: mx,
  };
}

// Ray-casting point-in-polygon. Полигон закрывать не обязательно.
function pointInPolygon(x: number, y: number, polygon: FieldPolygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Дешёвый getter — какая EPSG в файле, чтобы решить нужен ли reproject.
export async function detectGeoTIFFProjection(tifBuffer: Buffer): Promise<"wgs84" | "other"> {
  try {
    const ab = tifBuffer.buffer.slice(tifBuffer.byteOffset, tifBuffer.byteOffset + tifBuffer.byteLength) as ArrayBuffer;
    const tiff = await fromArrayBuffer(ab);
    const image = await tiff.getImage();
    const bbox = image.getBoundingBox();
    if (bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90) return "wgs84";
    return "other";
  } catch {
    return "other";
  }
}

// Защита от случайного импорта-зависимости.
void (null as unknown as GeoTIFFImage);
