// SAR backtest: прогоняет детектор на наборе полигонов с ручной разметкой
// (ground truth) и считает precision/recall + RMSE дат событий.
//
// Используется как regression-инструмент при тюнинге порогов в sar-events.ts:
//   1. Открыть EO Browser, найти 5–10 полей с явными уборками за 2024–2025.
//   2. Глазами разметить даты событий → положить в scripts/sar-backtest.fixtures.json
//      (см. формат ниже).
//   3. Запустить: npm run sar:backtest
//   4. Сверить precision/recall до/после изменения порогов.
//
// Формат fixtures (массив):
//   [{
//     "label": "Поле X в Костанае",
//     "polygon": [[lng,lat], ...],
//     "year": 2025,
//     "groundTruth": {
//       "sowingDate": "2025-05-15",      // optional
//       "harvestDate": "2025-08-25",     // optional
//       "expectedInactivity": false       // optional
//     }
//   }, ...]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSAREvents, isSARConfigured } from "../lib/satellite/sar";
import type { FieldPolygon } from "../lib/satellite/types";

interface GroundTruth {
  sowingDate?: string;
  harvestDate?: string;
  expectedInactivity?: boolean;
}

interface Fixture {
  label: string;
  polygon: FieldPolygon;
  year: number;
  groundTruth: GroundTruth;
}

const ACCEPT_DAYS = 14; // detected event считается «попаданием» если в ±14 дн. от ground truth

function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

async function main() {
  if (!isSARConfigured()) {
    console.error("[backtest] SAR не настроен. Установи CDSE_CLIENT_ID/SECRET или SAT_PROVIDER=mock.");
    process.exit(1);
  }

  const path = resolve("scripts/sar-backtest.fixtures.json");
  let fixtures: Fixture[];
  try {
    fixtures = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    console.error(`[backtest] не смог прочитать ${path}: ${(e as Error).message}`);
    console.error("Создай файл со структурой, описанной в шапке scripts/sar-backtest.ts");
    process.exit(1);
  }

  let harvestTotal = 0, harvestHits = 0;
  const harvestErrors: number[] = [];
  let sowingTotal = 0, sowingHits = 0;
  const sowingErrors: number[] = [];
  let inactivityTrue = 0, inactivityCorrect = 0;

  console.log(`[backtest] прогон на ${fixtures.length} полях...\n`);
  for (const f of fixtures) {
    const start = `${f.year}-04-01`;
    const end   = `${f.year}-10-15`;
    const events = await getSAREvents(f.polygon, start, end);
    if (!events) {
      console.log(`× ${f.label}: ряд не получен (CDSE/MIN_POINTS).`);
      continue;
    }
    const gt = f.groundTruth;
    const pred = events.summary;

    let line = `· ${f.label} (${pred.pointsUsed} точек):`;

    if (gt.harvestDate) {
      harvestTotal++;
      const detected = pred.harvestEvent?.date;
      if (detected) {
        const err = diffDays(gt.harvestDate, detected);
        const hit = Math.abs(err) <= ACCEPT_DAYS;
        if (hit) harvestHits++;
        harvestErrors.push(err);
        line += ` harvest pred=${detected} truth=${gt.harvestDate} (Δ=${err}д) ${hit ? "HIT" : "miss"}`;
      } else {
        line += ` harvest pred=— truth=${gt.harvestDate} miss`;
      }
    }

    if (gt.sowingDate) {
      sowingTotal++;
      const detected = pred.sowingEvent?.date;
      if (detected) {
        const err = diffDays(gt.sowingDate, detected);
        const hit = Math.abs(err) <= ACCEPT_DAYS;
        if (hit) sowingHits++;
        sowingErrors.push(err);
        line += ` | sowing pred=${detected} truth=${gt.sowingDate} (Δ=${err}д) ${hit ? "HIT" : "miss"}`;
      } else {
        line += ` | sowing pred=— miss`;
      }
    }

    if (gt.expectedInactivity !== undefined) {
      inactivityTrue++;
      if (pred.inactivity === gt.expectedInactivity) inactivityCorrect++;
      line += ` | inactivity pred=${pred.inactivity} truth=${gt.expectedInactivity} ${pred.inactivity === gt.expectedInactivity ? "OK" : "WRONG"}`;
    }

    console.log(line);
  }

  console.log("\n========================");
  if (harvestTotal > 0) {
    const rmse = Math.sqrt(harvestErrors.reduce((s, x) => s + x * x, 0) / Math.max(1, harvestErrors.length));
    console.log(`harvest: ${harvestHits}/${harvestTotal} (precision @±${ACCEPT_DAYS}д = ${(100*harvestHits/harvestTotal).toFixed(0)}%) · RMSE = ${rmse.toFixed(1)}д`);
  }
  if (sowingTotal > 0) {
    const rmse = Math.sqrt(sowingErrors.reduce((s, x) => s + x * x, 0) / Math.max(1, sowingErrors.length));
    console.log(`sowing:  ${sowingHits}/${sowingTotal} (precision @±${ACCEPT_DAYS}д = ${(100*sowingHits/sowingTotal).toFixed(0)}%) · RMSE = ${rmse.toFixed(1)}д`);
  }
  if (inactivityTrue > 0) {
    console.log(`inactivity: ${inactivityCorrect}/${inactivityTrue} (accuracy = ${(100*inactivityCorrect/inactivityTrue).toFixed(0)}%)`);
  }
}

main().catch((e) => {
  console.error("[backtest] fatal:", e);
  process.exit(1);
});
