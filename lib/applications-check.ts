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

// Запускает все доступные правила. Если декларации нет (категория не зерновая
// или фермер не заполнил поля) — возвращает пустой массив.
export function checkUserApplication(
  app: StoredApplication,
  userField: UserField | undefined,
  meteo: MeteoForCheck | undefined,
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

  return out;
}

// Сортировка от критичного к информационному.
export function sortBySeverity(arr: CheckWarning[]): CheckWarning[] {
  const order: Record<CheckSeverity, number> = { critical: 0, high: 1, warn: 2, info: 3, ok: 4 };
  return [...arr].sort((a, b) => order[a.severity] - order[b.severity]);
}

// Сериализатор decl → readable строка для UI.
export function declarationToText(decl: CropDeclaration): string {
  return `${CROP_LABEL[decl.crop]} · ${decl.areaHa} га · ${decl.declaredYieldCha} ц/га · ${decl.fertilizerKgHa} кг/га NPK · посев ${decl.declaredSowingDate}`;
}
