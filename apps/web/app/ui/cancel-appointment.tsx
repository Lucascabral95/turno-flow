"use client";

import { Ban, CheckCircle2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { Appointment } from "../../lib/api";
import { formatDateTime, requestJson } from "../../lib/api";

export function CancelAppointment({ appointmentId }: { appointmentId: string }) {
  const [cancelledAppointment, setCancelledAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const appointment = await requestJson<Appointment>(`/public/appointments/${appointmentId}/cancel`, {
        body: JSON.stringify({ token }),
        method: "POST"
      });
      setCancelledAppointment(appointment);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "No se pudo cancelar el turno");
    }
  }

  return (
    <main className="booking-shell">
      <section className="panel stack">
        <h1 className="inline">
          <Ban size={24} />
          Cancelar turno
        </h1>
        {error ? <div className="error">{error}</div> : null}
        {cancelledAppointment ? (
          <div className="message">
            <CheckCircle2 size={18} /> Turno cancelado: {cancelledAppointment.service.name} el{" "}
            {formatDateTime(cancelledAppointment.startsAt)}.
          </div>
        ) : (
          <form className="stack" onSubmit={(event) => void handleCancel(event)}>
            <label>
              Token de cancelacion
              <input required value={token} onChange={(event) => setToken(event.target.value)} />
            </label>
            <button className="button-danger" type="submit">
              <Ban size={18} />
              Cancelar turno
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
