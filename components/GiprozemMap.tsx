"use client";

import { useEffect, useRef } from "react";
import type { GiprozemFeature } from "@/lib/giprozem";
import { SOIL_REQUIREMENTS } from "@/lib/norms";

// Leaflet-карта агрохимобследования.
// - Рисует полигоны цветом по уровню P.
// - При смене flyToBbox делает программный fitBounds (например, по выбранному району).
// - Слушает moveend → дебаунс 400 мс → onBoundsChange([W,S,E,N]).
// - Не делает auto-fit на features (иначе будет цикл обновлений).

interface Props {
  features: GiprozemFeature[];
  flyToBbox?: [number, number, number, number]; // [west, south, east, north]
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  selectedIndex?: number | null;
  onSelect?: (i: number) => void;
}

export function GiprozemMap({ features, flyToBbox, onBoundsChange, selectedIndex, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const polyByIndexRef = useRef<any[]>([]);
  const debounceRef = useRef<any>(null);
  const onBoundsRef = useRef(onBoundsChange);
  onBoundsRef.current = onBoundsChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lastFlyKeyRef = useRef<string>("");

  // Init once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!document.querySelector('link[data-leaflet="1"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        link.crossOrigin = "";
        link.dataset.leaflet = "1";
        document.head.appendChild(link);
      }
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { preferCanvas: true }).setView([48.0, 68.0], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);

      // Дебаунсим moveend, отдаём наружу видимый bbox
      const onMove = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const b = map.getBounds();
          onBoundsRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        }, 400);
      };
      map.on("moveend", onMove);
      // Первичный bbox (после первого setView)
      setTimeout(onMove, 100);
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // flyTo при изменении входного bbox
  useEffect(() => {
    if (!flyToBbox) return;
    const map = mapRef.current;
    if (!map) return;
    const key = flyToBbox.join(",");
    if (lastFlyKeyRef.current === key) return;
    lastFlyKeyRef.current = key;
    const [w, s, e, n] = flyToBbox;
    map.fitBounds([[s, w], [n, e]] as any, { padding: [20, 20], maxZoom: 12, animate: true });
  }, [flyToBbox]);

  // Render features whenever they change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) return;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
        polyByIndexRef.current = [];
      }
      const group = L.featureGroup().addTo(map);
      layerRef.current = group;

      features.forEach((f, idx) => {
        const rings = f.geometry?.rings;
        if (!rings || rings.length === 0) return;
        const latlngs = rings.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
        const color = colorForFeature(f);
        const poly = L.polygon(latlngs as any, {
          color: "#1f2937",
          weight: 1,
          fillColor: color,
          fillOpacity: 0.55,
        });
        const a = f.attributes;
        poly.bindTooltip(
          `<b>${esc(a.nazvxoz ?? "—")}</b><br/>P=${num(a.p)} мг/кг · гумус=${num(a.gum)}%<br/>год обсл.: ${a.yearob ?? "—"} · ${num(a.s, 0)} га`,
          { sticky: true, direction: "top" }
        );
        poly.on("click", () => onSelectRef.current?.(idx));
        poly.addTo(group);
        polyByIndexRef.current[idx] = poly;
      });
      // Сознательно НЕ вызываем fitBounds — иначе зацикливание (move → fetch → render → fit → move → ...).
    })();
    return () => { cancelled = true; };
  }, [features]);

  // Подсветка выбранного
  useEffect(() => {
    const polys = polyByIndexRef.current;
    polys.forEach((p, i) => {
      if (!p) return;
      if (i === selectedIndex) {
        p.setStyle({ color: "#b91c1c", weight: 3, fillOpacity: 0.7 });
        p.bringToFront();
      } else {
        p.setStyle({ color: "#1f2937", weight: 1, fillOpacity: 0.55 });
      }
    });
  }, [selectedIndex]);

  return <div ref={containerRef} className="w-full h-120 rounded-lg overflow-hidden border border-border" />;
}

function colorForFeature(f: GiprozemFeature): string {
  const p = f.attributes.p;
  const gum = f.attributes.gum;
  if (p == null) return "#9ca3af";
  if (p < 8) return "#ef4444";
  if (p < SOIL_REQUIREMENTS.phosphorusMgKgMin) return "#f59e0b";
  if (gum != null && gum < SOIL_REQUIREMENTS.humusPctMin) return "#facc15";
  if (p < 25) return "#84cc16";
  return "#16a34a";
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function num(v: number | null | undefined, d = 1): string {
  return v == null ? "—" : v.toFixed(d);
}
