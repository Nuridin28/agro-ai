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
    isFarmer ? "Помощник ИИ" :
    isPortfolio ? "Разбор от ИИ" :
    isMeteo ? "Совет ИИ по погоде" :
    "Разбор от ИИ";

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
    <div className="bg-card border border-border-soft rounded-2xl p-5 shadow-soft">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 grid place-items-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
            </svg>
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">{headerLabel}</div>
            {description && <div className="text-xs text-foreground-soft mt-0.5">{description}</div>}
          </div>
        </div>
      </div>

      {(isFarmer || isMeteo) && (
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder={isMeteo
            ? "Например: «Что лучше посеять в этом году — подсолнечник или пшеницу?»"
            : "Например: «Что улучшить, чтобы получать больше субсидий?»"}
          className="w-full mt-3 border border-border-soft rounded-xl px-3.5 py-2.5 bg-background-elev text-sm focus:border-violet-400 focus:outline-none"
        />
      )}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 shadow-soft hover:shadow-pop transition"
        >
          {loading ? "думаю…" : (buttonLabel ?? (isFarmer ? "Спросить ИИ" : isMeteo ? "Получить совет" : "Получить разбор"))}
        </button>
        {!error && !text && <span className="text-xs text-foreground/50">Ваши данные никуда не передаются — всё идёт через защищённый сервер.</span>}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded border border-rose-200 bg-rose-50 text-sm text-rose-900">
          <div className="font-medium">Не получилось получить ответ</div>
          <div className="mt-1 text-xs">{error}</div>
          {hint && <div className="mt-2 text-xs">{hint}</div>}
        </div>
      )}

      {text && (
        <div className="mt-4 prose prose-sm max-w-none border border-violet-200 rounded-xl bg-violet-50/40 p-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {text}
        </div>
      )}
    </div>
  );
}
