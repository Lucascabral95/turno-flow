"use client";

import { CalendarDays, LogOut, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Appointment, CustomerPortalProfile } from "../../lib/api";
import { formatDateTime, requestJson } from "../../lib/api";
import styles from "./customer-portal-dashboard.module.scss";

const CUSTOMER_TOKEN_KEY = "turnoflow.customer_token";
const activeStatuses = new Set(["pending", "confirmed"]);

export function CustomerPortalDashboard() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<CustomerPortalProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebookingId, setRebookingId] = useState<string | null>(null);
  const [rebookStartsAt, setRebookStartsAt] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(CUSTOMER_TOKEN_KEY));
  }, []);

  useEffect(() => {
    if (token === undefined) {
      return;
    }

    if (!token) {
      window.location.href = "/portal/login";
      return;
    }

    void loadData(token);
  }, [token]);

  async function loadData(accessToken: string) {
    setLoading(true);
    setError(null);

    try {
      const [profileResponse, appointmentsResponse] = await Promise.all([
        requestJson<CustomerPortalProfile>("/customer-portal/me", { headers: authHeader(accessToken) }),
        requestJson<Appointment[]>("/customer-portal/appointments", { headers: authHeader(accessToken) })
      ]);
      setProfile(profileResponse);
      setAppointments(appointmentsResponse);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message.toLowerCase().includes("bearer")) {
        window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
        window.location.href = "/portal/login";
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar tus turnos");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    window.location.href = "/portal/login";
  }

  async function handleCancel(appointmentId: string) {
    if (!token) {
      return;
    }

    setBusyId(appointmentId);
    try {
      await requestJson(`/customer-portal/appointments/${appointmentId}/cancel`, {
        headers: authHeader(token),
        method: "POST"
      });
      toast.success("Turno cancelado");
      await loadData(token);
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : "No se pudo cancelar el turno");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRebook(appointmentId: string) {
    if (!token || !rebookStartsAt) {
      return;
    }

    setBusyId(appointmentId);
    try {
      await requestJson(`/customer-portal/appointments/${appointmentId}/rebook`, {
        body: JSON.stringify({ startsAt: new Date(rebookStartsAt).toISOString() }),
        headers: authHeader(token),
        method: "POST"
      });
      toast.success("Turno reservado");
      setRebookingId(null);
      setRebookStartsAt("");
      await loadData(token);
    } catch (rebookError) {
      toast.error(rebookError instanceof Error ? rebookError.message : "No se pudo reservar el turno");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={styles.portal}>
      <header className={styles.header}>
        <div>
          <span className="page-kicker">Portal de turnos</span>
          <h1>{profile ? `Hola, ${profile.name}` : "Tu portal"}</h1>
        </div>
        <button className="button-muted" onClick={handleLogout} type="button">
          <LogOut size={16} />
          Salir
        </button>
      </header>

      {loading ? <div className="message">Cargando tus turnos...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className={`panel stack ${styles.appointmentsPanel}`}>
        <header className="panel-header">
          <h2 className="inline">
            <CalendarDays size={20} />
            Mis turnos
          </h2>
        </header>

        {!loading && appointments.length === 0 ? <p>Todavia no tenes turnos.</p> : null}

        <div className={styles.appointmentList}>
          {appointments.map((appointment) => {
            const active = activeStatuses.has(appointment.status);
            const isBusy = busyId === appointment.id;

            return (
              <div className={styles.appointmentCard} key={appointment.id}>
                <div>
                  <strong>{appointment.service.name}</strong>
                  <p>{formatDateTime(appointment.startsAt)}</p>
                  <p className={styles.muted}>con {appointment.staffMember.name}</p>
                </div>

                <div className={styles.appointmentActions}>
                  <span className={styles.statusBadge}>{statusLabel(appointment.status)}</span>

                  {active ? (
                    <button
                      className="button-danger"
                      disabled={isBusy}
                      onClick={() => void handleCancel(appointment.id)}
                      type="button"
                    >
                      <X size={16} />
                      Cancelar
                    </button>
                  ) : (
                    <button
                      className="button-primary"
                      disabled={isBusy}
                      onClick={() => setRebookingId(rebookingId === appointment.id ? null : appointment.id)}
                      type="button"
                    >
                      <RotateCcw size={16} />
                      Reservar de nuevo
                    </button>
                  )}
                </div>

                {rebookingId === appointment.id ? (
                  <form
                    className={styles.rebookForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleRebook(appointment.id);
                    }}
                  >
                    <label>
                      Nueva fecha y horario
                      <input
                        onChange={(event) => setRebookStartsAt(event.target.value)}
                        required
                        type="datetime-local"
                        value={rebookStartsAt}
                      />
                    </label>
                    <button className="button-primary" disabled={isBusy} type="submit">
                      {isBusy ? "Reservando..." : "Confirmar"}
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function statusLabel(status: Appointment["status"]): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "confirmed":
      return "Confirmado";
    case "completed":
      return "Completado";
    case "cancelled_by_customer":
      return "Cancelado";
    case "cancelled_by_business":
      return "Cancelado por el negocio";
    case "no_show":
      return "No asistio";
    default:
      return status;
  }
}
