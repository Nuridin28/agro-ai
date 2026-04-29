"use client";

import { useState } from "react";

type Mode = "inspector_summary" | "farmer_chat" | "inspector_portfolio" | "meteo_advisor";

interface Props {
  // Не требуется в режиме inspector_portfolio и meteo_advisor.
  farmerId?: string;
  mode: Mode;
  // Для meteo_advisor: координаты участка
  coords?: { lat: number; lng: number; label?: string };
  year?: number;
  // Заголовок и подсказка под кнопкой
  buttonLabel?: string;
  description?: string;
}

export function AiInsight({ farmerId, mode, coords, year, buttonLabel, description }: Props) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>("");

  const isFarmer = mode === "farmer_chat";
  const isPortfolio = mode === "inspector_portfolio";
  const isMeteo = mode === "meteo_advisor";
  const headerLabel =
    isFarmer ? "AI-помощник (OpenAI)" :
    isPortfolio ? "AI-инсайты по портфелю (OpenAI)" :
    isMeteo ? "AI-агроклиматолог (OpenAI)" :
    "AI-расследование (OpenAI)";

  async function run() {
    setLoading(true); setError(null); setHint(null); setText("");
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, farmerId, question, coords, year }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        if (data.hint) setHint(data.hint);
      } else {
        setText(data.text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
            {headerLabel}
          </div>
          {description && <div className="text-xs text-foreground/60 mt-0.5">{description}</div>}
        </div>
        <span className="text-[11px] uppercase tracking-wider text-foreground/50 font-mono">gpt-4o-mini</span>
      </div>

      {(isFarmer || isMeteo) && (
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder={isMeteo
            ? "Например: «Стоит ли в этом году сеять подсолнечник или лучше пшеницу?»"
            : "Например: «Что мне стоит улучшить, чтобы получать больше субсидий в следующем году?»"}
          className="w-full mt-3 border border-border rounded px-3 py-2 bg-card text-sm"
        />
      )}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="px-3 py-2 rounded bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? "генерация…" : (buttonLabel ?? (isFarmer ? "Спросить AI" : isMeteo ? "Получить совет" : "Сгенерировать разбор"))}
        </button>
        {!error && !text && <span className="text-xs text-foreground/50">Запрос идёт через серверный прокси, ваш ключ остаётся на сервере.</span>}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded border border-rose-200 bg-rose-50 text-sm text-rose-900">
          <div className="font-medium">Не удалось получить ответ</div>
          <div className="mt-1 text-xs">{error}</div>
          {hint && <div className="mt-2 text-xs">{hint}</div>}
        </div>
      )}

      {text && (
        <div className="mt-4 prose prose-sm max-w-none border border-border rounded bg-muted/30 p-4 whitespace-pre-wrap text-sm leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}
