import { NextRequest } from "next/server";
import { buildFarmerContext, buildPortfolioContext, buildMeteoContext } from "@/lib/ai-context";

// Прокси к OpenAI Chat Completions.
// Ключ читается из process.env.OPENAI_API_KEY (только сервер) — фронт его не видит.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_INSPECTOR = `Ты эксперт-аудитор Департамента экономических расследований (ДЭР) Казахстана.
Твоя задача — на основе предоставленных данных подготовить понятный комиссии разбор:
1) кратко описать суть выявленных нарушений (если есть) на человеческом языке;
2) указать конкретные цифры и источники (ИСЖ, Plem.kz, Гипрозем, ЕГКН, Qoldau, Казгидромет);
3) объяснить, почему наблюдаемые показатели физически или биологически невозможны;
4) обязательно укажи, к каким ТИПАМ субсидий относится риск (удобрения, корма, племенной скот, реализация на убой и т.д.);
5) если нарушений нет — кратко подтвердить корректность отчётности фермера.
Пиши по-русски, профессионально, без воды. Используй markdown с заголовками и списками. Не выдумывай факты, опирайся ТОЛЬКО на данные из контекста.`;

const SYSTEM_PORTFOLIO = `Ты ведущий аналитик ДЭР Казахстана. На входе — агрегаты по портфелю субсидий АПК и разрез по типам направлений (удобрения, семена, корма, племенной скот и т.д.).
Подготовь портфельные инсайты для руководства:
1) какие ТИПЫ субсидий дают наибольшую долю риска и почему (свяжи с правилами верификации);
2) кто из фермеров требует приоритетного аудита и какие документы запросить;
3) какие системные паттерны (например, многократное «приписки урожая → удобрения») видны;
4) какие категории «чистые» — там можно быстрее принимать выплаты;
5) дай 2-3 рекомендации по портфелю.
Это ДОПОЛНЕНИЕ к нашим правилам — добавляй ценность, которой нет в простой таблице. Пиши по-русски, markdown, конкретно. Только факты из контекста.`;

const SYSTEM_FARMER = `Ты дружелюбный AI-помощник фермера в Казахстане. Помогаешь разобраться с субсидиями, агрохимией и метео.
Принципы:
- Говори простым языком, как с человеком, а не как с бухгалтером.
- Опирайся только на цифры из контекста ниже. Не выдумывай.
- Если фермер спрашивает про конкретные показатели — объясни на пальцах.
- Если есть риски — мягко предупреди и предложи действие, обязательно назови ТИП субсидии (удобрения, корма, племенной скот и т.п.).
- Не давай юридических консультаций.
Отвечай по-русски, кратко, по делу.`;

const SYSTEM_METEO_ADVISOR = `Ты опытный агроклиматолог-консультант фермера в Казахстане. На входе — многолетние осадки по месяцам/годам, текущая погода и прогноз на 7 дней по конкретной локации.
Что нужно сделать:
1) Сначала кратко опиши климатический режим участка (засушливо/нормально/влажно), сравни текущий год с многолетним средним.
2) Подсвети аномалии: какие месяцы/годы выбиваются, есть ли тренд на засуху или избыток.
3) Дай ПРАКТИЧЕСКИЕ советы по агроменеджменту для этого участка:
   - какие культуры лучше подходят (засухоустойчивые при дефиците осадков, влаголюбивые при избытке);
   - оптимальные сроки сева (учитывая прогрев почвы и влагозапас);
   - какие практики (стерня, кулисный пар, минимальная обработка) помогут сохранить влагу;
   - стоит ли подавать акт Natural Loss и под какой риск (засуха/избыток/ветер).
4) Дай 1-2 предупреждения по ближайшим 7 дням, если есть риски.
Опирайся ТОЛЬКО на данные контекста, без общих фраз. Пиши по-русски, markdown, конкретно.`;

type Mode = "inspector_summary" | "farmer_chat" | "inspector_portfolio" | "meteo_advisor";

interface Body {
  mode: Mode;
  farmerId?: string;
  question?: string;
  model?: string;
  // Для meteo_advisor:
  coords?: { lat: number; lng: number; label?: string };
  year?: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "OPENAI_API_KEY не задан",
        hint: "Создайте файл app/.env.local и впишите OPENAI_API_KEY=sk-..., затем перезапустите сервер.",
      },
      { status: 500 }
    );
  }

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const { mode, farmerId, question, coords, year } = body;
  if (mode !== "inspector_summary" && mode !== "farmer_chat" && mode !== "inspector_portfolio" && mode !== "meteo_advisor") {
    return Response.json({ error: "mode must be inspector_summary|farmer_chat|inspector_portfolio|meteo_advisor" }, { status: 400 });
  }
  if (mode === "meteo_advisor") {
    if (!coords || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
      return Response.json({ error: "coords {lat,lng} required for meteo_advisor" }, { status: 400 });
    }
  } else if (mode !== "inspector_portfolio" && !farmerId) {
    return Response.json({ error: "farmerId required" }, { status: 400 });
  }

  let context: string;
  let systemPrompt: string;
  let userMessage: string;

  if (mode === "inspector_portfolio") {
    context = buildPortfolioContext();
    systemPrompt = SYSTEM_PORTFOLIO;
    userMessage = `Сводка по портфелю субсидий (агрегаты + разрез по типам):\n\n${context}\n\nДай инсайты, которых нет в наших правилах верификации.`;
  } else if (mode === "inspector_summary") {
    context = buildFarmerContext(farmerId!);
    systemPrompt = SYSTEM_INSPECTOR;
    userMessage = `Контекст по фермеру (выгрузка из госисточников и движка верификации):\n\n${context}\n\nПодготовь разбор для комиссии.`;
  } else if (mode === "meteo_advisor") {
    try {
      context = await buildMeteoContext(coords!.lat, coords!.lng, coords!.label, year);
    } catch (e) {
      return Response.json({ error: `Не удалось получить погоду: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
    systemPrompt = SYSTEM_METEO_ADVISOR;
    userMessage = `Метео-контекст по моему участку:\n\n${context}\n\nДай агроклиматический разбор и практические советы.${question?.trim() ? `\n\nКонкретный вопрос: ${question.trim()}` : ""}`;
  } else {
    context = buildFarmerContext(farmerId!);
    systemPrompt = SYSTEM_FARMER;
    userMessage = `Контекст по моему хозяйству:\n\n${context}\n\nМой вопрос: ${question?.trim() || "Что мне сейчас стоит сделать в первую очередь?"}`;
  }

  const model = body.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  try {
    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json({ error: `OpenAI ${upstream.status}: ${errText.slice(0, 500)}` }, { status: 502 });
    }
    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return Response.json({ error: "Пустой ответ от модели" }, { status: 502 });

    return Response.json({
      text,
      model,
      usage: data.usage,
      contextChars: context.length,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
