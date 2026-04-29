"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось войти");
      router.push("/farmer");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-10">
      <div className="bg-card border border-border-soft rounded-2xl shadow-soft p-7">
        <div className="text-xs uppercase tracking-wider text-foreground-soft">Личный кабинет фермера</div>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Вход</h1>
        <p className="text-sm text-foreground-soft mt-1">Войдите, чтобы видеть только свои данные.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs text-foreground/60">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-card text-sm" />
          </div>
          <div>
            <label className="text-xs text-foreground/60">Пароль</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-card text-sm" />
          </div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full px-4 py-2 rounded gradient-accent text-accent-fg font-medium shadow-soft hover:shadow-pop disabled:opacity-50 transition">
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>

        <div className="mt-6 text-sm text-foreground-soft">
          Нет аккаунта? <Link href="/register" className="text-accent font-medium hover:underline">Зарегистрироваться</Link>
        </div>
        <div className="mt-4 text-xs text-foreground-soft">
          Или попробуйте без регистрации: <Link href="/" className="underline">демо-входы на лендинге</Link>.
        </div>
      </div>
    </div>
  );
}
