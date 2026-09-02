"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DirectorApiError } from "@/lib/director/client";

export default function DirectorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, portal: "director" }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        throw new DirectorApiError(payload.error.message, payload.error.code);
      }
      router.replace("/director");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="director-login-page">
      <div className="director-login-card">
        <h1>Директор</h1>
        <p>Панель управления билетной платформой Лемурия Парк.</p>
        {error ? <div className="director-alert error" role="alert">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="director-field">
            <label htmlFor="email">Эл. почта</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="director-field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="director-btn primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
