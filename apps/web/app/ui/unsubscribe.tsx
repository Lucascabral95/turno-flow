"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { requestJson } from "../../lib/api";
import styles from "./unsubscribe.module.scss";

export function Unsubscribe({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    try {
      await requestJson(`/public/unsubscribe/${token}`, { method: "POST" });
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo procesar la baja");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.unsubscribe}>
      <section className={`panel stack ${styles.card}`}>
        <span className="page-kicker">Preferencias de email</span>
        <h1>Dejar de recibir avisos de reactivacion</h1>

        {done ? (
          <div className={styles.successBox}>
            <CheckCircle2 size={18} />
            <span>Listo, no vas a recibir mas emails de reactivacion.</span>
          </div>
        ) : (
          <>
            <p>Vas a dejar de recibir los emails que te invitan a volver a reservar un turno.</p>
            {error ? <div className="error">{error}</div> : null}
            <button className="button-danger" disabled={submitting} onClick={() => void handleConfirm()} type="button">
              {submitting ? "Procesando..." : "Confirmar baja"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
