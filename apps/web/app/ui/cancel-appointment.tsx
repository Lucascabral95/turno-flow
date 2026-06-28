"use client";

import { Ban, CalendarClock, CheckCircle2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Appointment, AvailabilitySlot, Business } from "../../lib/api";
import { formatDateTime, formatSlotTime, requestJson } from "../../lib/api";
import styles from "./cancel-appointment.module.scss";

type PublicAppointment = Appointment & {
  business: Pick<Business, "id" | "name" | "slug" | "timezone">;
};

export function CancelAppointment({ appointmentId }: { appointmentId: string }) {
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);
  const [cancelledAppointment, setCancelledAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAppointment, setLoadingAppointment] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleSlotKey, setRescheduleSlotKey] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [rescheduledAppointment, setRescheduledAppointment] = useState<Appointment | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;
    setLoadingAppointment(true);
    setError(null);

    requestJson<PublicAppointment>(`/public/appointments/${appointmentId}?token=${encodeURIComponent(token)}`)
      .then((loadedAppointment) => {
        if (!ignore) {
          setAppointment(loadedAppointment);
          setRescheduleDate(dateInputValue(loadedAppointment.startsAt, loadedAppointment.business.timezone));
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          const message = loadError instanceof Error ? loadError.message : "No se pudo cargar el turno";
          setError(message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingAppointment(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [appointmentId, token]);

  useEffect(() => {
    if (!appointment || !rescheduleDate || !isActiveAppointment(appointment)) {
      setRescheduleSlots([]);
      return;
    }

    let ignore = false;
    setRescheduleLoading(true);
    setRescheduleSlotKey("");

    requestJson<AvailabilitySlot[]>(
      `/public/appointments/${appointmentId}/reschedule-slots?token=${encodeURIComponent(token)}&date=${rescheduleDate}`
    )
      .then((slots) => {
        if (!ignore) {
          setRescheduleSlots(normalizeAvailabilitySlots(slots).filter((slot) => new Date(slot.startsAt).getTime() > Date.now()));
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar horarios";
          setError(message);
          setRescheduleSlots([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setRescheduleLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [appointment, appointmentId, rescheduleDate, token]);

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const appointment = await requestJson<Appointment>(`/public/appointments/${appointmentId}/cancel`, {
        body: JSON.stringify({ token }),
        method: "POST"
      });
      setCancelledAppointment(appointment);
      setAppointment((currentAppointment) => currentAppointment ? { ...appointment, business: currentAppointment.business } : currentAppointment);
      toast.success("Turno cancelado");
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : "No se pudo cancelar el turno";
      setError(message);
      toast.error(message);
    }
  }

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!appointment) {
      setError("No se pudo cargar el turno");
      return;
    }

    const selectedSlot = rescheduleSlots.find((slot) => buildSlotKey(slot) === rescheduleSlotKey);
    if (!selectedSlot) {
      setError("Elegí un horario disponible antes de confirmar.");
      return;
    }

    try {
      const updatedAppointment = await requestJson<Appointment>(`/public/appointments/${appointmentId}/reschedule`, {
        body: JSON.stringify({
          staffMemberId: selectedSlot.staffMemberId,
          startsAt: selectedSlot.startsAt,
          token
        }),
        method: "POST"
      });
      setAppointment({ ...updatedAppointment, business: appointment.business });
      setRescheduledAppointment(updatedAppointment);
      toast.success("Turno reprogramado");
    } catch (rescheduleError) {
      const message = rescheduleError instanceof Error ? rescheduleError.message : "No se pudo reprogramar el turno";
      setError(message);
      toast.error(message);
    }
  }

  const activeAppointment = appointment && isActiveAppointment(appointment) && !cancelledAppointment;

  return (
    <main className={styles.cancelAppointment}>
      <section className="panel stack">
        <h1 className="inline">
          <CalendarClock size={24} />
          Gestionar turno
        </h1>
        {loadingAppointment ? <div className="message">Cargando datos del turno...</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {appointment ? (
          <article className={styles.appointmentSummary}>
            <span>{appointment.business.name}</span>
            <strong>{appointment.service.name}</strong>
            <p>
              {formatDateTime(appointment.startsAt)} · {appointment.staffMember.name}
            </p>
            <p>{appointment.customer.name} · {appointment.customer.email}</p>
          </article>
        ) : null}
        {cancelledAppointment ? (
          <div className="message">
            <CheckCircle2 size={18} /> Turno cancelado: {cancelledAppointment.service.name} el{" "}
            {formatDateTime(cancelledAppointment.startsAt)}.
          </div>
        ) : (
          <>
            <form className="stack" onSubmit={(event) => void handleReschedule(event)}>
              <h2>Cambiar horario</h2>
              {rescheduledAppointment ? (
                <div className="message">
                  <CheckCircle2 size={18} /> Nuevo horario confirmado: {formatDateTime(rescheduledAppointment.startsAt)}.
                </div>
              ) : null}
              <label>
                Día
                <input
                  disabled={!activeAppointment}
                  min={dateInputValue(new Date().toISOString(), appointment?.business.timezone)}
                  onChange={(event) => setRescheduleDate(event.target.value)}
                  required
                  type="date"
                  value={rescheduleDate}
                />
              </label>
              <div className={styles.slotGrid} role="group" aria-label="Horarios disponibles">
                {rescheduleLoading ? <span>Buscando horarios...</span> : null}
                {!rescheduleLoading && activeAppointment && rescheduleSlots.length === 0 ? <span>No hay horarios disponibles para ese día.</span> : null}
                {!activeAppointment ? <span>Este turno ya no permite cambios.</span> : null}
                {rescheduleSlots.map((slot) => {
                  const slotKey = buildSlotKey(slot);

                  return (
                    <button
                      aria-pressed={rescheduleSlotKey === slotKey}
                      className={rescheduleSlotKey === slotKey ? styles.selectedSlot : undefined}
                      disabled={!activeAppointment}
                      key={slotKey}
                      onClick={() => setRescheduleSlotKey(slotKey)}
                      type="button"
                    >
                      {formatSlotTime(slot.startsAt, appointment?.business.timezone)}
                    </button>
                  );
                })}
              </div>
              <button className="button-primary" disabled={!activeAppointment || !rescheduleSlotKey} type="submit">
                <CalendarClock size={18} />
                Confirmar nuevo horario
              </button>
            </form>
            <form className="stack" onSubmit={(event) => void handleCancel(event)}>
              <label>
                Token de gestion
                <input required value={token} onChange={(event) => setToken(event.target.value)} />
              </label>
              <button className="button-danger" disabled={!activeAppointment} type="submit">
                <Ban size={18} />
                Cancelar turno
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function buildSlotKey(slot: AvailabilitySlot): string {
  return `${slot.staffMemberId}:${slot.startsAt}`;
}

function normalizeAvailabilitySlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const uniqueSlots = new Map<string, AvailabilitySlot>();

  for (const slot of slots) {
    const existingSlot = uniqueSlots.get(slot.startsAt);

    if (!existingSlot || slot.staffMemberId.localeCompare(existingSlot.staffMemberId) < 0) {
      uniqueSlots.set(slot.startsAt, slot);
    }
  }

  return [...uniqueSlots.values()].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

function isActiveAppointment(appointment: Appointment): boolean {
  return appointment.status === "pending" || appointment.status === "confirmed";
}

function dateInputValue(value: string, timeZone = "America/Argentina/Buenos_Aires"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}
