// Лёгкая проверка пользовательских заявок (без полного verify-движка).
// Использует то, что у real-юзера реально есть: атрибуты Гипрозема (P/K/N/гумус)
// + (опционально) реальный метео через Open-Meteo + декларация урожая из формы.
//
// Возвращает массив warnings, которые показываются прямо в карточке заявки
// в досье у инспектора и в реестре у фермера.

import type { StoredApplication, CropDeclaration } from "./applications-store";
import { CROP_NORMS, SOIL_REQUIREMENTS } from "./norms";
import type { UserField } from "./users-store";
import { CROP_LABEL } from "./types";

export type CheckSeverity = "ok" | "info" | "warn" | "high" | "critical";

export interface CheckWarning {
  code: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
}

interface MeteoForCheck {
  swEqMm?: number | null;
  springWindStress?: boolean;
  soilWarmDate?: string | null;
}

// Сводка NDVI-ряда поля для проверки заявки. Прокидывается из спутникового
// модуля. Опционально — без NDVI просто пропускаем NDVI-проверки.
export interface NDVISummaryForCheck {
  harvestDate?: string | null;       // дата, на которую NDVI после пика упал ниже порога
  harvestDetected?: boolean;          // удалось ли увидеть полный цикл рост → пик → падение
  peakDate?: string | null;          // дата пика NDVI
  ndviMax?: number | null;
}

// Сводка SAR-ряда (Sentinel-1) — параллельный канал к NDVI, не зависит
// от облачности. null/undefined если CDSE не настроен.
export interface SARSummaryForCheck {
  harvestDate?: string | null;        // дата падения VH после пика
  harvestConfidence?: number;          // 0..1
  inactivity?: boolean;                // поле спит весь сезон по σ VH
  vhSeasonStdevDb?: number | null;
  tillageEventsCount?: number;
}

// Запускает все доступные правила. Если декларации нет (категория не зерновая
// или фермер не заполнил поля) — возвращает пустой массив.
export function checkUserApplication(
  app: StoredApplication,
  userField: UserField | undefined,
  meteo: MeteoForCheck | undefined,
  ndvi?: NDVISummaryForCheck,
  sar?: SARSummaryForCheck,
): CheckWarning[] {
  const decl = app.cropDeclaration;
  if (!decl) return [];
  const out: CheckWarning[] = [];

  // 1) Биологический потолок: declared > 1.5× от эталона культуры
  const norm = CROP_NORMS[decl.crop];
  if (decl.declaredYieldCha > norm.baseYieldCentnersHa * 1.5) {
    out.push({
      code: "CROP_BIOLOGICAL_CEILING",
      severity: "critical",
      title: "Заявленная урожайность выше биологического потолка",
      detail: `Эталон для «${CROP_LABEL[decl.crop]}» в РК — ${norm.baseYieldCentnersHa} ц/га. Вы заявили ${decl.declaredYieldCha} ц/га (превышение ${Math.round((decl.declaredYieldCha / norm.baseYieldCentnersHa - 1) * 100)}%).`,
    });
  } else if (decl.declaredYieldCha > norm.baseYieldCentnersHa * 1.2) {
    out.push({
      code: "CROP_HIGH_YIELD",
      severity: "warn",
      title: "Урожайность выше нормы, но в пределах возможного",
      detail: `Эталон ${norm.baseYieldCentnersHa} ц/га, заявлено ${decl.declaredYieldCha}. Будет проверено вручную.`,
    });
  }

  // 2) Агрохимический фильтр: при дефиците P/Cu сильно высокий урожай неправдоподобен
  const sample = userField?.sample;
  if (sample) {
    const pBelow = sample.p != null && sample.p < SOIL_REQUIREMENTS.phosphorusMgKgMin;
    if (pBelow && decl.declaredYieldCha > norm.baseYieldCentnersHa * 1.0) {
      out.push({
        code: "CROP_AGROCHEM_DEFICIT",
        severity: "high",
        title: "Заявленный урожай не подтверждается агрохимией",
        detail: `Гипрозем: фосфор P=${sample.p} мг/кг при норме ≥ ${SOIL_REQUIREMENTS.phosphorusMgKgMin}. С таким P-дефицитом устойчиво получать ${decl.declaredYieldCha} ц/га невозможно — даже с закупленными ${decl.fertilizerKgHa} кг/га NPK.`,
      });
    }
    const gumLow = sample.gum != null && sample.gum < SOIL_REQUIREMENTS.humusPctMin;
    if (gumLow && decl.declaredYieldCha > norm.baseYieldCentnersHa * 1.1) {
      out.push({
        code: "CROP_LOW_HUMUS",
        severity: "warn",
        title: "Низкий гумус для заявленного сбора",
        detail: `Гумус ${sample.gum}% при норме ≥ ${SOIL_REQUIREMENTS.humusPctMin}%. Заявленные ${decl.declaredYieldCha} ц/га выше реалистичного потенциала такой почвы.`,
      });
    }
  }

  // 3) Расхождение «сколько закупили удобрений vs. сколько нужно для такого урожая»
  // Эмпирика: на 1 ц/га нужно ~3.0–3.5 кг NPK с учётом КПД.
  const expectedFertKgHa = decl.declaredYieldCha * 3.2;
  if (decl.fertilizerKgHa < expectedFertKgHa * 0.5) {
    out.push({
      code: "CROP_FERTILIZER_GAP",
      severity: "warn",
      title: "Удобрений закуплено меньше, чем нужно для заявленного урожая",
      detail: `Для ${decl.declaredYieldCha} ц/га ${CROP_LABEL[decl.crop]} нужно ≈ ${expectedFertKgHa.toFixed(0)} кг/га NPK. Вы заявили закуп ${decl.fertilizerKgHa} кг/га — это меньше половины нормы. Либо урожай будет ниже заявленного, либо удобрения «не те».`,
    });
  }

  // 4) Метео-фильтр: фиктивный посев — посев заявлен раньше прогрева почвы
  if (meteo?.soilWarmDate && decl.declaredSowingDate) {
    const warm = new Date(`${meteo.soilWarmDate}T00:00:00Z`).getTime();
    const sowing = new Date(`${decl.declaredSowingDate}T00:00:00Z`).getTime();
    const diffDays = Math.round((warm - sowing) / 86_400_000);
    if (diffDays > 5) {
      out.push({
        code: "CROP_FAKE_SOWING",
        severity: "high",
        title: "Дата посева раньше прогрева почвы",
        detail: `Заявлен посев ${decl.declaredSowingDate}. По данным Open-Meteo почва прогрелась до +8°C только ${meteo.soilWarmDate} (через ${diffDays} дн.). Прорастание яровых в холодной почве биологически невозможно.`,
      });
    }
  }

  // 5) Дефицит влаги: плохая зима + высокий заявленный урожай
  if (meteo?.swEqMm != null && meteo.swEqMm < 100 && decl.declaredYieldCha > norm.baseYieldCentnersHa * 0.9) {
    out.push({
      code: "CROP_MOISTURE_INCONSISTENCY",
      severity: "warn",
      title: "Высокий урожай при дефиците влагозапаса",
      detail: `Снежный покров за зиму — ${meteo.swEqMm} мм водного эквивалента (норма ≥ 130). При таком влагозапасе заявленные ${decl.declaredYieldCha} ц/га неустойчивы.`,
    });
  }

  // 6) NDVI-события: расхождение заявленной даты уборки с детектированной
  // по NDVI, и «уборка вообще не зафиксирована». Подключается только если
  // спутниковая сводка передана (есть полигон + есть ряд).
  if (ndvi) {
    if (decl.declaredHarvestDate && ndvi.harvestDate) {
      const dDecl = new Date(`${decl.declaredHarvestDate}T00:00:00Z`).getTime();
      const dObs  = new Date(`${ndvi.harvestDate}T00:00:00Z`).getTime();
      const diffDays = Math.round((dObs - dDecl) / 86_400_000);
      const absDays = Math.abs(diffDays);
      // > 30 дн. — фрод-сигнал, > 15 дн. — мягкое предупреждение
      if (absDays > 30) {
        const direction = diffDays > 0 ? "позже" : "раньше";
        out.push({
          code: "CROP_HARVEST_DATE_MISMATCH",
          severity: "high",
          title: "Заявленная дата уборки расходится со спутником",
          detail: `По заявке уборка ${decl.declaredHarvestDate}, спутник зафиксировал падение NDVI ниже порога только ${ndvi.harvestDate} (${absDays} дн. ${direction}). Типичный признак «бумажной» уборки — заявка раньше факта.`,
        });
      } else if (absDays > 15) {
        out.push({
          code: "CROP_HARVEST_DATE_DRIFT",
          severity: "warn",
          title: "Дата уборки слегка расходится со спутником",
          detail: `По заявке уборка ${decl.declaredHarvestDate}, по NDVI — ${ndvi.harvestDate} (${absDays} дн.). Расхождение в пределах ${absDays}–30 дн. может быть объяснено облачностью; проверить вручную.`,
        });
      }
    }
    // Полный цикл не закрылся: NDVI поднимался выше порога вегетации,
    // но падение биомассы в окне сезона так и не наблюдалось. Поле может
    // быть не убрано, либо посева/уборки вообще не было.
    if (ndvi.ndviMax != null && ndvi.ndviMax >= 0.30 && ndvi.harvestDetected === false) {
      out.push({
        code: "CROP_NO_HARVEST_DETECTED",
        severity: "warn",
        title: "Уборка не подтверждена снимками",
        detail: `Пик NDVI на поле был зафиксирован${ndvi.peakDate ? ` ${ndvi.peakDate}` : ""}, однако падения биомассы ниже порога ${0.20} до конца сезона не наблюдалось. Возможные причины: уборка не проведена, либо поле осталось под зелёнкой как пар/корм.`,
      });
    }
  }

  // 7) SAR-канал (Sentinel-1) — независим от облачности. Применяется, если
  // у фермера есть полигон и CDSE-провайдер настроен; иначе sar = undefined
  // и блок просто пропускается.
  if (sar) {
    // Поле спит — самый сильный SAR-сигнал. Перебивает NDVI-неоднозначности.
    if (sar.inactivity) {
      out.push({
        code: "CROP_SAR_FIELD_INACTIVE",
        severity: "high",
        title: "SAR: поле не работало весь сезон",
        detail: `Sentinel-1 не зафиксировал значимых изменений biomass-сигнала (σ VH = ${sar.vhSeasonStdevDb ?? "—"} дБ при пороге 1.0 дБ). Заявка на ${CROP_LABEL[decl.crop]} с урожаем ${decl.declaredYieldCha} ц/га не подтверждается радаром — радар видит, что поле не работало.`,
      });
    }
    // Расхождение даты уборки по SAR.
    if (decl.declaredHarvestDate && sar.harvestDate) {
      const dDecl = new Date(`${decl.declaredHarvestDate}T00:00:00Z`).getTime();
      const dObs  = new Date(`${sar.harvestDate}T00:00:00Z`).getTime();
      const diffDays = Math.round((dObs - dDecl) / 86_400_000);
      if (Math.abs(diffDays) > 30) {
        const direction = diffDays > 0 ? "позже" : "раньше";
        out.push({
          code: "CROP_SAR_HARVEST_MISMATCH",
          severity: "high",
          title: "SAR: дата уборки расходится с заявленной",
          detail: `Радар Sentinel-1 зафиксировал падение VH ${sar.harvestDate} (confidence ${(sar.harvestConfidence ?? 0).toFixed(2)}), фермер заявил уборку ${decl.declaredHarvestDate} (${Math.abs(diffDays)} дн. ${direction}). Радар не зависит от облачности — это надёжнее NDVI.`,
        });
      }
    }
  }

  return out;
}

// Сортировка от критичного к информационному.
export function sortBySeverity(arr: CheckWarning[]): CheckWarning[] {
  const order: Record<CheckSeverity, number> = { critical: 0, high: 1, warn: 2, info: 3, ok: 4 };
  return [...arr].sort((a, b) => order[a.severity] - order[b.severity]);
}

// Сериализатор decl → readable строка для UI.
export function declarationToText(decl: CropDeclaration): string {
  const base = `${CROP_LABEL[decl.crop]} · ${decl.areaHa} га · ${decl.declaredYieldCha} ц/га · ${decl.fertilizerKgHa} кг/га NPK · посев ${decl.declaredSowingDate}`;
  return decl.declaredHarvestDate ? `${base} · уборка ${decl.declaredHarvestDate}` : base;
}
