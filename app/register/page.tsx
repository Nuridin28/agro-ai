"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Match {
  nazvxoz: string;
  layerId: number;
  layerName: string;
  oblastCode: string;
  oblastName: string;
  parcels: number;
  sample: { p?: number; gum?: number; yearob?: number; s?: number };
}

type Step = "credentials" | "lookup" | "select" | "confirm";

const CACHE_STORAGE_KEY = "giprozem-lookup-cache-v1";

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [farmName, setFarmName] = useState("");
  const [ownerFio, setOwnerFio] = useState("");
  const [bin, setBin] = useState("");

  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Автодополнение по Гипрозему: подсказки + кэш по нормализованному запросу.
  const [suggestions, setSuggestions] = useState<Match[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const cacheRef = useRef<Map<string, Match[]>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);

  // Гидратируем кэш из sessionStorage при монтировании — поиск по тому же имени
  // не требует повторного запроса к Гипрозему.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) cacheRef.current = new Map(Object.entries(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function persistCache() {
    try {
      sessionStorage.setItem(
        CACHE_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(cacheRef.current)),
      );
    } catch { /* quota / private mode */ }
  }

  // Группировка по nazvxoz: одно имя может встречаться в нескольких районных слоях.
  function uniqueByName(rows: Match[]) {
    const map = new Map<string, { nazvxoz: string; oblasts: Set<string>; layers: number; parcels: number; rows: Match[] }>();
    for (const r of rows) {
      const cur = map.get(r.nazvxoz) ?? { nazvxoz: r.nazvxoz, oblasts: new Set<string>(), layers: 0, parcels: 0, rows: [] };
      cur.oblasts.add(r.oblastName);
      cur.layers += 1;
      cur.parcels += r.parcels;
      cur.rows.push(r);
      map.set(r.nazvxoz, cur);
    }
    return [...map.values()]
      .map((v) => ({ nazvxoz: v.nazvxoz, oblasts: [...v.oblasts], layers: v.layers, parcels: v.parcels, rows: v.rows }))
      .sort((a, b) => b.parcels - a.parcels);
  }

  function onFarmNameChange(v: string) {
    setFarmName(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const key = v.trim().toLowerCase();
    if (key.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const cached = cacheRef.current.get(key);
    if (cached) {
      setSuggestions(cached);
      setShowSuggestions(true);
      return;
    }
    setShowSuggestions(true);
    setAutocompleteLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/lookup-farm?q=${encodeURIComponent(v.trim())}`);
        const data = await res.json();
        if (res.ok) {
          const list = (data.matches as Match[]) ?? [];
          cacheRef.current.set(key, list);
          persistCache();
          setSuggestions(list);
        }
      } catch { /* network error — silent */ }
      finally { setAutocompleteLoading(false); }
    }, 400);
  }

  function pickSuggestion(group: { nazvxoz: string; rows: Match[] }) {
    setFarmName(group.nazvxoz);
    setMatches(group.rows);
    setSelected(new Set(group.rows.map((r) => `${r.nazvxoz}::${r.layerId}`)));
    setShowSuggestions(false);
  }

  // Поиск из кэша по текущему имени; если нет — делаем сетевой запрос.
  async function lookup() {
    setError(null); setSearching(true);
    const key = farmName.trim().toLowerCase();
    const cached = cacheRef.current.get(key);
    if (cached) {
      const exact = cached.filter((r) => r.nazvxoz.toLowerCase() === key);
      const list = exact.length > 0 ? exact : cached;
      setMatches(list);
      setSelected(new Set());
      setSearching(false);
      setStep("select");
      return;
    }
    try {
      const res = await fetch(`/api/auth/lookup-farm?q=${encodeURIComponent(farmName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Поиск не удался");
      const list = (data.matches as Match[]) ?? [];
      cacheRef.current.set(key, list);
      persistCache();
      setMatches(list);
      setSelected(new Set());
      setStep("select");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  }

  // При шаге «Поиск»: если в кэше есть точное совпадение — прыгаем сразу на «Выбор»
  // без повторного запроса в API.
  function goToLookup() {
    const key = farmName.trim().toLowerCase();
    const cached = cacheRef.current.get(key);
    if (cached && cached.length > 0) {
      const exact = cached.filter((r) => r.nazvxoz.toLowerCase() === key);
      const list = exact.length > 0 ? exact : cached;
      setMatches(list);
      if (selected.size === 0) setSelected(new Set());
      setStep("select");
    } else {
      setStep("lookup");
    }
  }

  async function submit() {
    setError(null); setSubmitting(true);
    try {
      const fields = matches
        .filter((m) => selected.has(`${m.nazvxoz}::${m.layerId}`))
        .map((m) => ({
          nazvxoz: m.nazvxoz,
          layerId: m.layerId,
          layerName: m.layerName,
          oblastCode: m.oblastCode,
          parcels: m.parcels,
          sample: m.sample,
        }));
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, farmName, ownerFio, bin, fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push("/farmer");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const groupedSuggestions = uniqueByName(suggestions);
  const cacheHit = cacheRef.current.has(farmName.trim().toLowerCase()) && farmName.trim().length >= 3;

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="bg-card border border-border-soft rounded-2xl shadow-soft p-7">
        <div className="text-xs uppercase tracking-wider text-foreground-soft">Регистрация фермера</div>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Привязка к Гипрозему</h1>
        <p className="text-sm text-foreground-soft mt-1">Введите название хозяйства — мы найдём ваши участки в реальном Гипрозем-API и привяжем их к аккаунту.</p>

        <Stepper step={step} />

        {step === "credentials" && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (email && password.length >= 6 && farmName.length >= 3) goToLookup(); }}
            className="mt-6 grid sm:grid-cols-2 gap-4"
          >
            <Field label="Email *">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 bg-card text-sm" />
            </Field>
            <Field label="Пароль (мин. 6 символов) *">
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 bg-card text-sm" />
            </Field>

            <div className="sm:col-span-2 relative" ref={fieldRef}>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-foreground/60 flex items-center gap-2">
                  Название хозяйства (так, как в Гипрозем) *
                  {autocompleteLoading && <span className="text-foreground/50">· поиск…</span>}
                  {!autocompleteLoading && cacheHit && <span className="text-emerald-700">· из кэша</span>}
                </span>
                <input
                  type="text" required minLength={3} placeholder="например: Шерубай Су"
                  value={farmName}
                  onChange={(e) => onFarmNameChange(e.target.value)}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  autoComplete="off"
                  className="w-full border border-border rounded px-3 py-2 bg-card text-sm"
                />
              </label>

              {showSuggestions && farmName.trim().length >= 3 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-card max-h-72 overflow-y-auto">
                  {autocompleteLoading && groupedSuggestions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-foreground/60">Поиск в 172 районных слоях Гипрозема…</div>
                  )}
                  {!autocompleteLoading && groupedSuggestions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-foreground/60">Нет совпадений. Попробуйте другой фрагмент.</div>
                  )}
                  {groupedSuggestions.slice(0, 10).map((g) => (
                    <button
                      type="button"
                      key={g.nazvxoz}
                      onClick={() => pickSuggestion(g)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b border-border-soft last:border-b-0"
                    >
                      <div className="font-medium">{g.nazvxoz}</div>
                      <div className="text-[11px] text-foreground/60 mt-0.5">
                        {g.oblasts.join(", ")} · {g.layers} район(ов) · {g.parcels} участок(ов)
                      </div>
                    </button>
                  ))}
                  {groupedSuggestions.length > 10 && (
                    <div className="px-3 py-1.5 text-[11px] text-foreground/50 border-t border-border-soft">
                      +{groupedSuggestions.length - 10} ещё — уточните запрос
                    </div>
                  )}
                </div>
              )}
            </div>

            <Field label="ФИО владельца">
              <input type="text" value={ownerFio} onChange={(e) => setOwnerFio(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 bg-card text-sm" />
            </Field>
            <Field label="БИН/ИИН">
              <input type="text" value={bin} onChange={(e) => setBin(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 bg-card text-sm font-mono" />
            </Field>
            <div className="sm:col-span-2 flex justify-end mt-2">
              <button type="submit"
                disabled={!email || password.length < 6 || farmName.length < 3}
                className="px-4 py-2 rounded gradient-accent text-accent-fg font-medium disabled:opacity-50">
                {cacheHit ? "Далее: подтвердить участки →" : "Далее: найти в Гипрозем →"}
              </button>
            </div>
          </form>
        )}

        {step === "lookup" && (
          <div className="mt-6">
            <div className="text-sm text-foreground/80">
              Сейчас система ищет «<strong>{farmName}</strong>» по всем 172 районным слоям Гипрозема.
              Это занимает 5–15 секунд.
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={lookup} disabled={searching}
                className="px-4 py-2 rounded gradient-accent text-accent-fg font-medium disabled:opacity-50">
                {searching ? "Поиск…" : "Запустить поиск в Гипрозем"}
              </button>
              <button onClick={() => setStep("credentials")} className="px-4 py-2 rounded border border-border text-sm">← назад</button>
            </div>
            {error && <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">{error}</div>}
          </div>
        )}

        {step === "select" && (
          <div className="mt-6">
            <div className="text-sm text-foreground/80">
              Найдено совпадений: <strong>{matches.length}</strong>. Отметьте свои хозяйства/районы (можно несколько).
            </div>
            {matches.length === 0 && (
              <div className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded p-3">
                В Гипрозем-API записей по «{farmName}» не найдено. Попробуйте другой фрагмент или продолжите без привязки —
                данные подключите позже из кабинета.
              </div>
            )}
            <div className="mt-3 grid gap-2 max-h-105 overflow-y-auto">
              {matches.map((m) => {
                const key = `${m.nazvxoz}::${m.layerId}`;
                const checked = selected.has(key);
                return (
                  <label key={key}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${checked ? "border-emerald-400 bg-emerald-50/40" : "border-border bg-card hover:bg-muted/30"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(key)} className="mt-1" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{m.nazvxoz}</div>
                      <div className="text-xs text-foreground/60 mt-0.5">
                        {m.oblastName} · слой <span className="font-mono">{m.layerName}</span> · {m.parcels} участок(ов)
                      </div>
                      <div className="text-xs text-foreground/50 mt-1 font-mono">
                        обр. {m.sample?.yearob ?? "—"} · P={m.sample?.p ?? "—"} · гумус={m.sample?.gum ?? "—"} · {m.sample?.s ?? "—"} га
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex justify-between">
              <button onClick={() => setStep("credentials")} className="text-sm text-foreground/60 hover:underline">← изменить данные</button>
              <button onClick={() => setStep("confirm")}
                className="px-4 py-2 rounded gradient-accent text-accent-fg font-medium">
                Далее: подтвердить ({selected.size}) →
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="mt-6 space-y-4">
            <div className="text-sm">
              <div><strong>Email:</strong> {email}</div>
              <div><strong>Хозяйство:</strong> {farmName}</div>
              {ownerFio && <div><strong>Владелец:</strong> {ownerFio}</div>}
              {bin && <div><strong>БИН/ИИН:</strong> <span className="font-mono">{bin}</span></div>}
              <div><strong>Привязано записей Гипрозема:</strong> {selected.size}</div>
            </div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">{error}</div>}
            <div className="flex justify-between">
              <button onClick={() => setStep("select")} className="text-sm text-foreground/60 hover:underline">← назад к выбору</button>
              <button onClick={submit} disabled={submitting}
                className="px-4 py-2 rounded gradient-accent text-accent-fg font-medium disabled:opacity-50">
                {submitting ? "Создание…" : "Зарегистрироваться и войти"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-foreground-soft">
          Уже есть аккаунт? <Link href="/login" className="text-accent font-medium hover:underline">Войти</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-foreground/60">{label}</span>
      {children}
    </label>
  );
}

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["credentials", "lookup", "select", "confirm"];
  const labels: Record<Step, string> = { credentials: "Данные", lookup: "Поиск", select: "Выбор", confirm: "Готово" };
  const idx = order.indexOf(step);
  return (
    <div className="mt-5 flex items-center gap-2">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${i <= idx ? "bg-accent text-accent-fg border-accent" : "bg-muted border-border text-foreground/60"}`}>
            {i + 1}. {labels[s]}
          </span>
          {i < order.length - 1 && <span className="text-foreground/30">·</span>}
        </div>
      ))}
    </div>
  );
}
