"use client";

import { useEffect, useState } from "react";
import { requestJson } from "../../../lib/api";

const CUSTOMER_TOKEN_KEY = "turnoflow.customer_token";

export default function CustomerPortalLoginPage() {
  const [token, setToken] = useState<string | null>(null);
  const [businessSlug, setBusinessSlug] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    setExchanging(true);
    setError(null);

    requestJson<{ accessToken: string }>("/customer-portal/sessions", {
      body: JSON.stringify({ token }),
      method: "POST"
    })
      .then((response) => {
        window.localStorage.setItem(CUSTOMER_TOKEN_KEY, response.accessToken);
        window.location.href = "/portal";
      })
      .catch((exchangeError) => {
        setError(exchangeError instanceof Error ? exchangeError.message : "El enlace no es valido o vencio");
      })
      .finally(() => {
        setExchanging(false);
      });
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await requestJson("/customer-portal/login-link", {
        body: JSON.stringify({ businessSlug, email }),
        method: "POST"
      });
      setLinkSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo enviar el enlace");
    } finally {
      setSubmitting(false);
    }
  }

  if (token) {
    return (
      <main style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: "1rem", justifyContent: "center", minHeight: "100vh" }}>
        {exchanging ? <p>Ingresando a tu portal...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
      </main>
    );
  }

  return (
    <main style={{ alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100vh" }}>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "360px", padding: "2rem", width: "100%" }}
      >
        <h1 style={{ margin: 0 }}>Portal de turnos</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>Ingresa tu email y te enviamos un enlace para acceder.</p>

        {linkSent ? (
          <p style={{ color: "green" }}>Si el email esta registrado, te enviamos un enlace de acceso.</p>
        ) : (
          <>
            {error ? <p style={{ color: "red", margin: 0 }}>{error}</p> : null}

            <label>
              Negocio
              <input
                onChange={(event) => setBusinessSlug(event.target.value)}
                placeholder="mi-negocio"
                required
                type="text"
                value={businessSlug}
              />
            </label>

            <label>
              Email
              <input
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@email.com"
                required
                type="email"
                value={email}
              />
            </label>

            <button className="button-primary" disabled={submitting} type="submit">
              {submitting ? "Enviando..." : "Enviar enlace de acceso"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
