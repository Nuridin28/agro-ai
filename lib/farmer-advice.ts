// ────────────────────────────────────────────────────────────────────────────
// Генератор персональных рекомендаций фермеру: «человеческие» советы
// на базе данных Гипрозема, метео и движка верификации.
//
// Идея — конвертировать сухие AI-флаги в действия: «ваш гумус низкий →
// внесите 30 т/га органики», «бонитет дает потолок 13 ц/га → не указывайте
// 16 ц/га в заявке», «снег ниже нормы → подайте акт о страховом риске».
// ────────────────────────────────────────────────────────────────────────────

import { fieldFor, seasonFor } from "./mock/crop";
import { meteoFor } from "./mock/meteo";
import { herdFor } from "./mock/livestock";
import { computeExpectedYield } from "./verify/crop";
import { CROP_LABEL } from "./types";
import { SOIL_REQUIREMENTS } from "./norms";
import type { Farmer } from "./types";

export type AdviceLevel = "info" | "tip" | "warn" | "alert";

export interface Advice {
  id: string;
  level: AdviceLevel;
  title: string;
  body: string;
  action?: string;
  module?: "passport" | "calculator" | "meteo" | "applications";
}

export function buildAdvice(farmer: Farmer): Advice[] {
  const out: Advice[] = [];
  const field = fieldFor(farmer.id);
  const season = seasonFor(farmer.id);
  const herd = herdFor(farmer.id);
  const meteo = field ? meteoFor(field.region.katoCode, season?.year ?? 2024) : undefined;

  // 1) Биологический потолок vs заявленный сбор
  if (field && season) {
    const exp = computeExpectedYield(field, season, meteo);
    const declared = season.declaredYieldCha;
    if (declared > exp.expected * 1.3) {
      out.push({
        id: "ceiling",
        level: "alert",
        title: "Заявленный сбор выше биологического потолка вашего поля",
        body: `По данным агрохимии (Гипрозем) и метео-условий для культуры «${CROP_LABEL[season.crop]}» расчётный потенциал участка — ${exp.expected} ц/га. В заявке указано ${declared} ц/га. Это автоматически попадёт под аудит ДЭР. Рекомендуем привести цифру в соответствие или вложиться в улучшение почвы.`,
        action: "Открыть калькулятор",
        module: "calculator",
      });
    } else if (declared > exp.expected * 1.1) {
      out.push({
        id: "ceiling-soft",
        level: "warn",
        title: "Заявка близка к биологическому потолку",
        body: `Расчётный потенциал ~${exp.expected} ц/га, заявка ${declared} ц/га. Это допустимо, но проверьте обоснование: что улучшилось по сравнению с прошлым сезоном?`,
      });
    } else if (declared < exp.expected * 0.7) {
      out.push({
        id: "underclaim",
        level: "info",
        title: "Возможно, занижаете потенциал",
        body: `Поле может давать до ${exp.expected} ц/га. Заявлено лишь ${declared} ц/га. Возможно, стоит пересмотреть агротехнологию — потенциал есть.`,
      });
    }

    // 2) Дефицит P / Cu — «сначала почва, потом субсидии»
    if (field.phosphorusMgKg < SOIL_REQUIREMENTS.phosphorusMgKgMin) {
      out.push({
        id: "p-deficit",
        level: "warn",
        title: "Дефицит фосфора в почве",
        body: `P = ${field.phosphorusMgKg} мг/кг (норма ≥ ${SOIL_REQUIREMENTS.phosphorusMgKgMin}). Без фосфора азотные удобрения не сработают. Рекомендуем внести 60–80 кг/га суперфосфата перед посевом — это увеличит потенциал примерно на ${(exp.base * 0.2).toFixed(0)} ц/га.`,
        action: "Калькулятор удобрений",
        module: "calculator",
      });
    }
    if (field.humusPct < SOIL_REQUIREMENTS.humusPctMin) {
      out.push({
        id: "humus-low",
        level: "warn",
        title: "Низкий гумус — почва истощается",
        body: `Содержание гумуса ${field.humusPct}% при норме ≥ ${SOIL_REQUIREMENTS.humusPctMin}%. Запланируйте внесение 25–30 т/га органики или сидераты в осенней схеме. Без этого скоринг участка будет падать.`,
      });
    }

    // 3) Метео-страховка
    if (meteo) {
      if (meteo.swEqMm < 130 || meteo.springWindStress) {
        out.push({
          id: "meteo-drought",
          level: "alert",
          title: "Метео-риск: дефицит влаги в регионе",
          body: `Снежный покров — ${meteo.swEqMm} мм водного эквивалента (норма 150–200)${meteo.springWindStress ? ", + зафиксированы весенние «черные бури»" : ""}. Подавайте акт о страховом риске (Natural Loss) до начала уборки — это смягчит требования по урожайности.`,
          action: "Зафиксировать в метео-помощнике",
          module: "meteo",
        });
      }
      if (meteo.minWinterC < -35) {
        out.push({
          id: "meteo-winter",
          level: "warn",
          title: "Аномально холодная зима в регионе",
          body: `Минимум ${meteo.minWinterC}°C, снег ${meteo.maxSnowDepthCm} см. Расход кормов вырастет на 25–40%. Заложите этот объём в заявку на субсидию.`,
          module: "meteo",
        });
      }
    }
  }

  // 4) Скотоводство — превышение поголовья / низкая вакцинация
  if (herd) {
    if (herd.vaccinationCoveragePct < 90) {
      out.push({
        id: "vet-coverage",
        level: "alert",
        title: "Низкий охват вакцинации",
        body: `Охват ${herd.vaccinationCoveragePct}% против обязательных 100% (ящур + бруцеллёз). При проверке ДЭР это снизит выплаты пропорционально.`,
        action: "Связаться с ветстанцией",
      });
    }
    if (herd.declaredAdgKgDay > 1.6) {
      out.push({
        id: "adg-high",
        level: "warn",
        title: "Высокий заявленный привес",
        body: `Заявлено ${herd.declaredAdgKgDay} кг/сутки. Это близко к биологическому потолку для большинства мясных пород РК. Подкрепите данными убойного цеха или перевзвешивания, иначе попадёте под аудит.`,
      });
    }
  }

  // 5) Если всё в порядке — позитив
  if (out.length === 0) {
    out.push({
      id: "all-good",
      level: "info",
      title: "Хозяйство ведётся в штатном режиме",
      body: "По всем критериям AI-форензики (агрохимия, метео, биологические потолки) у вас «зелёная зона». Продолжайте поддерживать почву и обновлять агрохимобследование раз в 4–5 лет.",
    });
  }

  return out;
}
