// Mock-полигоны для существующих полей FLD-*. Координаты в [lon, lat],
// привязаны к центрам соответствующих районов из region-coords.ts —
// квадрат ~3×3 км вокруг центра района (для демо достаточно).
//
// Каждому полигону соответствует сценарий генерации NDVI в mock-провайдере —
// сценарии регистрируются здесь же при импорте модуля.

import type { FieldPolygon } from "../satellite/types";
import { registerMockScenario, type MockScenario } from "../satellite/mock-provider";
import { coordsForKato } from "../region-coords";
import { fieldFor, FIELDS } from "./crop";
import { findFarmer } from "./farmers";

export interface FieldPolygonRecord {
  fieldId: string;
  farmerId: string;
  polygon: FieldPolygon;
  scenario: MockScenario;
}

// Сценарии подобраны под профили фермеров из mock/crop.ts:
//  F-001 — норма       → medium
//  F-002 — низкий бонитет → weak
//  F-003 — фрод по влаге → late_growth (ndvi реально слабее заявленного)
//  F-004 — фиктивный посев → late_growth
//  F-005 — фрод (агрохим) → weak
//  F-006 — норма       → medium
//  F-014 — норма по полю, фрод по скоту → medium
const SCENARIO_BY_FARMER: Record<string, MockScenario> = {
  "F-001": "medium",
  "F-002": "weak",
  "F-003": "late_growth",
  "F-004": "late_growth",
  "F-005": "weak",
  "F-006": "medium",
  "F-014": "medium",
};

// Строит квадратный полигон ~halfDeg градусов вокруг точки.
// halfDeg=0.015 ≈ 1.5–1.7 км (зависит от широты).
function squareAround(lat: number, lng: number, halfDeg = 0.015): FieldPolygon {
  return [
    [lng - halfDeg, lat - halfDeg],
    [lng + halfDeg, lat - halfDeg],
    [lng + halfDeg, lat + halfDeg],
    [lng - halfDeg, lat + halfDeg],
    [lng - halfDeg, lat - halfDeg],
  ];
}

// Небольшой сдвиг по фермеру, чтобы у нескольких ферм в одном районе
// центроиды отличались — иначе сценарии в реестре перетрут друг друга.
function offsetForFarmer(farmerId: string): { dLat: number; dLng: number } {
  let h = 0;
  for (let i = 0; i < farmerId.length; i++) h = (h * 31 + farmerId.charCodeAt(i)) >>> 0;
  // ±0.05° — порядка 5 км, достаточно чтобы не пересекаться с соседом
  const dLat = ((h & 0xff) / 0xff - 0.5) * 0.10;
  const dLng = (((h >> 8) & 0xff) / 0xff - 0.5) * 0.10;
  return { dLat, dLng };
}

const POLYGONS: FieldPolygonRecord[] = [];

for (const f of FIELDS) {
  const farmer = findFarmer(f.farmerId);
  if (!farmer) continue;
  const center = coordsForKato(farmer.region.katoCode);
  if (!center) continue;
  const { dLat, dLng } = offsetForFarmer(f.farmerId);
  const polygon = squareAround(center.lat + dLat, center.lng + dLng);
  const scenario = SCENARIO_BY_FARMER[f.farmerId] ?? "medium";
  POLYGONS.push({ fieldId: f.id, farmerId: f.farmerId, polygon, scenario });
  // Сразу регистрируем сценарий по центроиду, чтобы mock-провайдер знал,
  // какую кривую генерить для этого поля.
  registerMockScenario([center.lat + dLat, center.lng + dLng], scenario);
}

export function polygonForField(fieldId: string): FieldPolygonRecord | undefined {
  return POLYGONS.find((p) => p.fieldId === fieldId);
}

export function polygonForFarmer(farmerId: string): FieldPolygonRecord | undefined {
  const f = fieldFor(farmerId);
  if (!f) return undefined;
  return polygonForField(f.id);
}

export function allFieldPolygons(): FieldPolygonRecord[] {
  return POLYGONS.slice();
}
