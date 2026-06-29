"use client";

import { ArrowRight, Ban, CalendarClock, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { Appointment, AvailabilitySlot, Business } from "../../lib/api";
import { formatSlotTime, requestJson } from "../../lib/api";
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
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
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
    setError(null);
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

  const activeAppointment = Boolean(appointment && isActiveAppointment(appointment) && !cancelledAppointment);
  const selectedSlot = useMemo(
    () => rescheduleSlots.find((slot) => buildSlotKey(slot) === rescheduleSlotKey) ?? null,
    [rescheduleSlotKey, rescheduleSlots]
  );

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmittingCancel(true);

    try {
      const cancelled = await requestJson<Appointment>(`/public/appointments/${appointmentId}/cancel`, {
        body: JSON.stringify({ token }),
        method: "POST"
      });
      setCancelledAppointment(cancelled);
      setAppointment((currentAppointment) => currentAppointment ? { ...cancelled, business: currentAppointment.business } : currentAppointment);
      toast.success("Turno cancelado");
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : "No se pudo cancelar el turno";
      setError(message);
      toast.error(message);
    } finally {
      setSubmittingCancel(false);
    }
  }

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!appointment) {
      setError("No se pudo cargar el turno");
      return;
    }

    if (!selectedSlot) {
      setError("Elegir un horario disponible antes de confirmar.");
      return;
    }

    setSubmittingReschedule(true);
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
      setRescheduleDate(dateInputValue(updatedAppointment.startsAt, appointment.business.timezone));
      toast.success("Turno reprogramado");
    } catch (rescheduleError) {
      const message = rescheduleError instanceof Error ? rescheduleError.message : "No se pudo reprogramar el turno";
      setError(message);
      toast.error(message);
    } finally {
      setSubmittingReschedule(false);
    }
  }

  return (
    <main className={styles.cancelAppointment}>
      <section className={styles.hero}>
        <span className="page-kicker">Gestion de turno</span>
        <h1>Modifica tu reserva sin escribirle al negocio.</h1>
        <p>Elegi un nuevo horario disponible o cancela tu turno si no podes asistir.</p>
      </section>

      {loadingAppointment ? <div className="message">Cargando datos del turno...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {!token ? (
        <section className={`panel stack ${styles.tokenPanel}`}>
          <h2>Ingresa el token de gestion</h2>
          <p>El token viene incluido en el link que recibiste por email.</p>
          <input onChange={(event) => setToken(event.target.value)} placeholder="Token del turno" value={token} />
        </section>
      ) : null}

      {appointment ? (
        <section className={styles.workspace}>
          <AppointmentSummary
            activeAppointment={activeAppointment}
            appointment={appointment}
            cancelledAppointment={cancelledAppointment}
            rescheduledAppointment={rescheduledAppointment}
          />

          <section className={`panel stack ${styles.actionPanel}`}>
            <header className="panel-header">
              <div>
                <h2 className="inline">
                  <CalendarClock size={20} />
                  Cambiar dia y horario
                </h2>
                <p>Los horarios se calculan con disponibilidad real y turnos ya ocupados.</p>
              </div>
              <span className="badge badge-soft">{rescheduleSlots.length} horarios</span>
            </header>

            <form className="stack" onSubmit={(event) => void handleReschedule(event)}>
              {rescheduledAppointment ? (
                <div className="message">
                  <CheckCircle2 size={18} /> Nuevo horario confirmado:{" "}
                  {formatBusinessDateTime(rescheduledAppointment.startsAt, appointment.business.timezone)}.
                </div>
              ) : null}

              <label>
                Dia
                <input
                  disabled={!activeAppointment}
                  min={dateInputValue(new Date().toISOString(), appointment.business.timezone)}
                  onChange={(event) => setRescheduleDate(event.target.value)}
                  required
                  type="date"
                  value={rescheduleDate}
                />
              </label>

              <div className={styles.slotHeader}>
                <span>Horarios disponibles</span>
                {selectedSlot ? (
                  <strong>
                    Seleccionado: {formatSlotTime(selectedSlot.startsAt, appointment.business.timezone)}
                  </strong>
                ) : (
                  <strong>Elegir un horario</strong>
                )}
              </div>

              <div className={styles.slotGrid} role="group" aria-label="Horarios disponibles">
                {rescheduleLoading ? <span>Buscando horarios...</span> : null}
                {!rescheduleLoading && activeAppointment && rescheduleSlots.length === 0 ? (
                  <span>No hay horarios disponibles para ese dia.</span>
                ) : null}
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
                      {formatSlotTime(slot.startsAt, appointment.business.timezone)}
                    </button>
                  );
                })}
              </div>

              <button className="button-primary" disabled={!activeAppointment || !selectedSlot || submittingReschedule} type="submit">
                <ArrowRight size={18} />
                {submittingReschedule ? "Confirmando..." : "Confirmar nuevo horario"}
              </button>
            </form>
          </section>

          <section className={`panel stack ${styles.cancelPanel}`}>
            <h2 className="inline">
              <Ban size={20} />
              Cancelar turno
            </h2>
            <p>Usa esta opcion solo si no queres elegir otro horario.</p>
            <form onSubmit={(event) => void handleCancel(event)}>
              <button className="button-danger" disabled={!activeAppointment || submittingCancel} type="submit">
                <Ban size={18} />
                {submittingCancel ? "Cancelando..." : "Cancelar turno"}
              </button>
            </form>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function AppointmentSummary({
  activeAppointment,
  appointment,
  cancelledAppointment,
  rescheduledAppointment
}: {
  activeAppointment: boolean;
  appointment: PublicAppointment;
  cancelledAppointment: Appointment | null;
  rescheduledAppointment: Appointment | null;
}) {
  const finalStatus = cancelledAppointment ? "Cancelado" : activeAppointment ? "Activo" : "Cerrado";

  return (
    <aside className={`panel stack ${styles.summaryPanel}`}>
      <header className={styles.summaryHeader}>
        <span className="page-kicker">{appointment.business.name}</span>
        <h2>{appointment.service.name}</h2>
        <p>{appointment.customer.name}</p>
      </header>

      <div className={styles.statusPill}>
        <ShieldCheck size={16} />
        {finalStatus}
      </div>

      <div className={styles.summaryRows}>
        <SummaryRow label="Horario actual" value={formatBusinessDateTime(appointment.startsAt, appointment.business.timezone)} />
        <SummaryRow label="Profesional" value={appointment.staffMember.name} />
        <SummaryRow label="Email" value={appointment.customer.email} />
        {appointment.customer.phone ? <SummaryRow label="Telefono" value={appointment.customer.phone} /> : null}
      </div>

      {rescheduledAppointment ? (
        <div className={styles.successBox}>
          <CheckCircle2 size={18} />
          <span>El negocio recibio el cambio y el cliente recibira la confirmacion por email.</span>
        </div>
      ) : null}

      {!activeAppointment ? (
        <div className={styles.lockedBox}>
          <Clock3 size={18} />
          <span>Este turno ya no admite cambios operativos.</span>
        </div>
      ) : null}
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function formatBusinessDateTime(value: string, timeZone = "America/Argentina/Buenos_Aires"): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(value));
}
