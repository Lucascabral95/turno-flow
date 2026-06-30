"use client";

import { useEffect, useState } from "react";
import { requestJson } from "../../lib/api";

export default function AcceptInvitePage() {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("Token de invitacion no encontrado en la URL");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await requestJson<{ accessToken: string }>("/auth/accept-invite", {
        body: JSON.stringify({ name, password, token }),
        method: "POST"
      });
      window.localStorage.setItem("turnoflow.token", response.accessToken);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la invitacion");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem" }}>
        <p style={{ color: "var(--color-success, green)" }}>Cuenta creada. Redirigiendo al dashboard...</p>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%", maxWidth: "360px", padding: "2rem" }}
      >
        <h1 style={{ margin: 0 }}>Activar cuenta</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>Completa tu perfil para unirte al equipo.</p>

        {!token ? (
          <p style={{ color: "red" }}>Token de invitacion faltante. Usa el link que recibiste por email.</p>
        ) : null}

        {error ? <p style={{ color: "red", margin: 0 }}>{error}</p> : null}

        <label>
          Tu nombre
          <input
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Perez"
            required
            type="text"
            value={name}
          />
        </label>

        <label>
          Contraseña
          <input
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimo 8 caracteres"
            required
            type="password"
            value={password}
          />
        </label>

        <button className="button-primary" disabled={submitting || !token} type="submit">
          {submitting ? "Activando..." : "Activar cuenta"}
        </button>
      </form>
    </main>
  );
}
