"use client";

import { CheckCircle2, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Appointment } from "../../lib/api";
import { formatDateTime, requestJson } from "../../lib/api";
import styles from "./accept-waitlist-offer.module.scss";

export function AcceptWaitlistOffer({ token }: { token: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function acceptOffer() {
    setError(null);
    setLoading(true);
    try {
      const response = await requestJson<Appointment>(`/public/waitlist-offers/${token}/accept`, {
        method: "POST"
      });
      setAppointment(response);
      toast.success("Turno confirmado");
    } catch (acceptError) {
      const message = acceptError instanceof Error ? acceptError.message : "No se pudo aceptar la oferta";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.acceptWaitlistOffer}>
      <section className="panel stack">
        <h1 className="inline">
          <MailCheck size={24} />
          Oferta de lista de espera
        </h1>
        {error ? <div className="error">{error}</div> : null}
        {appointment ? (
          <div className="message">
            <CheckCircle2 size={18} /> Turno confirmado para {appointment.service.name} el{" "}
            {formatDateTime(appointment.startsAt)}.
          </div>
        ) : (
          <button className="button-primary" disabled={loading} onClick={() => void acceptOffer()} type="button">
            <CheckCircle2 size={18} />
            Aceptar turno disponible
          </button>
        )}
      </section>
    </main>
  );
}
