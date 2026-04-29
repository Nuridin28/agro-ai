"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoading(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      disabled={loading}
      className="text-xs px-3 py-1.5 rounded-full border border-border-soft bg-card hover:border-rose-300 hover:text-rose-700 transition"
    >
      {loading ? "выход…" : "выйти"}
    </button>
  );
}
