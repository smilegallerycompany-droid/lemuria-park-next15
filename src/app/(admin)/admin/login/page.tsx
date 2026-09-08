"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, portal: "admin" }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body?.error?.message ?? "Не удалось войти");
        return;
      }
      router.replace("/admin");
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="director-login">
      <form className="director-login-card" onSubmit={onSubmit}>
        <h1>Управляющий</h1>
        <p>Вход для администратора и владельца.</p>
        <div className="director-field">
          <label htmlFor="admin-email">Эл. почта</label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="director-field">
          <label htmlFor="admin-password">Пароль</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error ? (
          <p className="director-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="director-btn primary" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
