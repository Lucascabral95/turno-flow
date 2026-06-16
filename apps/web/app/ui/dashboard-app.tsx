"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LogIn,
  RefreshCcw,
  Scissors,
  UserPlus,
  Users
} from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import type { Appointment, CurrentBusiness, DashboardMetrics } from "../../lib/api";
import {
  formatDateTime,
  formatMoney,
  requestJson
} from "../../lib/api";
import { formNumber, formString } from "../../lib/form";

type AuthMode = "login" | "register";

export function DashboardApp() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("turnoflow.token");
    if (storedToken) {
      setToken(storedToken);
      void refresh(storedToken);
    }
  }, []);

  async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    return requestJson<T>(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
  }

  async function refresh(activeToken = token) {
    if (!activeToken) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [currentBusiness, currentAppointments, currentMetrics] = await Promise.all([
        requestJson<CurrentBusiness | null>("/businesses/current", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }),
        requestJson<Appointment[]>("/appointments", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<DashboardMetrics>("/dashboard/metrics", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null)
      ]);
      setBusiness(currentBusiness);
      setAppointments(currentAppointments);
      setMetrics(currentMetrics);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "No se pudo cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload =
      authMode === "register"
        ? {
            email: formString(formData, "email"),
            name: formString(formData, "name"),
            password: formString(formData, "password")
          }
        : {
            email: formString(formData, "email"),
            password: formString(formData, "password")
          };

    try {
      const response = await requestJson<{ accessToken: string }>(`/auth/${authMode}`, {
        body: JSON.stringify(payload),
        method: "POST"
      });
      window.localStorage.setItem("turnoflow.token", response.accessToken);
      setToken(response.accessToken);
      await refresh(response.accessToken);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "No se pudo iniciar sesion");
    }
  }

  async function handleBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: formString(formData, "email") || undefined,
      name: formString(formData, "name"),
      slug: formString(formData, "slug") || undefined,
      timezone: formString(formData, "timezone") || undefined
    };

    try {
      await authRequest<CurrentBusiness>("/businesses/current", {
        body: JSON.stringify(payload),
        method: business ? "PATCH" : "POST"
      });
      await refresh();
      event.currentTarget.reset();
    } catch (businessError) {
      setError(businessError instanceof Error ? businessError.message : "No se pudo guardar el negocio");
    }
  }

  async function handleService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitAndRefresh(event.currentTarget, "/services", {
      bufferMinutes: formNumber(formData, "bufferMinutes"),
      durationMinutes: formNumber(formData, "durationMinutes", 30),
      name: formString(formData, "name"),
      priceCents: Math.round(formNumber(formData, "price") * 100)
    });
  }

  async function handleStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitAndRefresh(event.currentTarget, "/staff-members", {
      email: formString(formData, "email") || undefined,
      name: formString(formData, "name")
    });
  }

  async function handleAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitAndRefresh(event.currentTarget, "/availability-rules", {
      endTime: formString(formData, "endTime"),
      staffMemberId: formString(formData, "staffMemberId"),
      startTime: formString(formData, "startTime"),
      weekday: formNumber(formData, "weekday", 1)
    });
  }

  async function submitAndRefresh(form: HTMLFormElement, path: string, payload: unknown) {
    setError(null);
    try {
      await authRequest(path, {
        body: JSON.stringify(payload),
        method: "POST"
      });
      form.reset();
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar");
    }
  }

  async function updateAppointmentStatus(appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") {
    setError(null);
    try {
      await authRequest(`/appointments/${appointmentId}/status`, {
        body: JSON.stringify({ status }),
        method: "PATCH"
      });
      await refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "No se pudo actualizar el turno");
    }
  }

  function logout() {
    window.localStorage.removeItem("turnoflow.token");
    setAppointments([]);
    setBusiness(null);
    setMetrics(null);
    setToken(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>TurnoFlow</h1>
          <span>Agenda, no-shows, lista de espera y recordatorios</span>
        </div>
        <div className="inline">
          {business ? (
            <Link className="button-link button-secondary" href={`/${business.slug}`}>
              Pagina publica
            </Link>
          ) : null}
          {token ? (
            <>
              <button className="button-muted" disabled={loading} onClick={() => void refresh()} type="button">
                <RefreshCcw size={18} />
                Actualizar
              </button>
              <button className="button-danger" onClick={logout} type="button">
                Salir
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {!token ? (
        <section className="layout-grid">
          <form className="panel stack" onSubmit={(event) => void handleAuth(event)}>
            <h2>{authMode === "login" ? "Entrar" : "Crear usuario"}</h2>
            {authMode === "register" ? (
              <label>
                Nombre
                <input name="name" required />
              </label>
            ) : null}
            <label>
              Email
              <input name="email" required type="email" />
            </label>
            <label>
              Password
              <input minLength={8} name="password" required type="password" />
            </label>
            <button className="button-primary" type="submit">
              {authMode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
              {authMode === "login" ? "Entrar" : "Registrarme"}
            </button>
            <button
              className="button-muted"
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              type="button"
            >
              {authMode === "login" ? "Crear cuenta" : "Ya tengo cuenta"}
            </button>
          </form>
          <section className="panel stack">
            <h2>Demo local</h2>
            <p>Despues de correr `make db-seed`, podes entrar con:</p>
            <div className="message">lucas@turnoflow.local / turnoflow123</div>
          </section>
        </section>
      ) : (
        <section className="layout-grid">
          <aside className="stack">
            <BusinessPanel business={business} onSubmit={(event) => void handleBusiness(event)} />
            {business ? (
              <>
                <ServicePanel onSubmit={(event) => void handleService(event)} />
                <StaffPanel onSubmit={(event) => void handleStaff(event)} />
                <AvailabilityPanel business={business} onSubmit={(event) => void handleAvailability(event)} />
              </>
            ) : null}
          </aside>

          <section className="stack">
            <MetricsPanel metrics={metrics} />
            <InventoryPanel business={business} />
            <AppointmentsPanel
              appointments={appointments}
              onStatus={(appointmentId, status) => {
                void updateAppointmentStatus(appointmentId, status);
              }}
            />
          </section>
        </section>
      )}
    </main>
  );
}

function BusinessPanel({ business, onSubmit }: { business: CurrentBusiness | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h2>{business ? "Negocio" : "Configurar negocio"}</h2>
      <label>
        Nombre
        <input defaultValue={business?.name ?? ""} name="name" required />
      </label>
      {!business ? (
        <label>
          Slug publico
          <input name="slug" placeholder="barberia-lucas" />
        </label>
      ) : null}
      <label>
        Zona horaria
        <input defaultValue={business?.timezone ?? "America/Argentina/Buenos_Aires"} name="timezone" />
      </label>
      <label>
        Email
        <input defaultValue={business?.email ?? ""} name="email" type="email" />
      </label>
      <button className="button-primary" type="submit">
        <CheckCircle2 size={18} />
        Guardar negocio
      </button>
    </form>
  );
}

function ServicePanel({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h3>Nuevo servicio</h3>
      <label>
        Nombre
        <input name="name" required placeholder="Corte clasico" />
      </label>
      <div className="grid-3">
        <label>
          Duracion
          <input defaultValue={30} min={5} name="durationMinutes" required type="number" />
        </label>
        <label>
          Buffer
          <input defaultValue={0} min={0} name="bufferMinutes" required type="number" />
        </label>
        <label>
          Precio
          <input defaultValue={0} min={0} name="price" required type="number" />
        </label>
      </div>
      <button className="button-primary" type="submit">
        <Scissors size={18} />
        Agregar servicio
      </button>
    </form>
  );
}

function StaffPanel({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h3>Nuevo profesional</h3>
      <label>
        Nombre
        <input name="name" required placeholder="Lucas" />
      </label>
      <label>
        Email
        <input name="email" type="email" />
      </label>
      <button className="button-primary" type="submit">
        <Users size={18} />
        Agregar staff
      </button>
    </form>
  );
}

function AvailabilityPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h3>Nueva disponibilidad</h3>
      <label>
        Staff
        <select name="staffMemberId" required>
          {business.staffMembers
            .filter((staffMember) => staffMember.active)
            .map((staffMember) => (
              <option key={staffMember.id} value={staffMember.id}>
                {staffMember.name}
              </option>
            ))}
        </select>
      </label>
      <div className="grid-3">
        <label>
          Dia
          <select defaultValue={1} name="weekday">
            <option value={1}>Lunes</option>
            <option value={2}>Martes</option>
            <option value={3}>Miercoles</option>
            <option value={4}>Jueves</option>
            <option value={5}>Viernes</option>
            <option value={6}>Sabado</option>
            <option value={0}>Domingo</option>
          </select>
        </label>
        <label>
          Desde
          <input defaultValue="09:00" name="startTime" required type="time" />
        </label>
        <label>
          Hasta
          <input defaultValue="18:00" name="endTime" required type="time" />
        </label>
      </div>
      <button className="button-primary" type="submit">
        <CalendarClock size={18} />
        Agregar disponibilidad
      </button>
    </form>
  );
}

function MetricsPanel({ metrics }: { metrics: DashboardMetrics | null }) {
  return (
    <section className="metric-grid">
      <Metric label="Turnos" value={metrics?.totalAppointments ?? 0} />
      <Metric label="Activos" value={metrics?.activeAppointments ?? 0} />
      <Metric label="No-shows" value={metrics?.noShowAppointments ?? 0} tone="danger" />
      <Metric label="Perdida estimada" value={formatMoney(metrics?.lostRevenueCents ?? 0)} tone="warning" />
    </section>
  );
}

function Metric({ label, tone, value }: { label: string; tone?: "danger" | "warning"; value: number | string }) {
  const className = tone === "danger" ? "badge badge-danger" : tone === "warning" ? "badge badge-warning" : "badge";
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span className={className}>{label}</span>
    </div>
  );
}

function InventoryPanel({ business }: { business: CurrentBusiness | null }) {
  if (!business) {
    return <div className="message">Configura tu negocio para cargar servicios, staff y disponibilidad.</div>;
  }

  return (
    <section className="grid-3">
      <InventoryList icon={<Scissors size={18} />} title="Servicios" values={business.services.map((service) => service.name)} />
      <InventoryList icon={<Users size={18} />} title="Staff" values={business.staffMembers.map((staffMember) => staffMember.name)} />
      <InventoryList
        icon={<CalendarClock size={18} />}
        title="Disponibilidad"
        values={business.availabilityRules.map((rule) => `${weekdayName(rule.weekday)} ${rule.startTime}-${rule.endTime}`)}
      />
    </section>
  );
}

function InventoryList({ icon, title, values }: { icon: ReactNode; title: string; values: string[] }) {
  return (
    <section className="panel stack">
      <h3 className="inline">
        {icon}
        {title}
      </h3>
      {values.length === 0 ? (
        <span className="badge badge-warning">Sin datos</span>
      ) : (
        <div className="list">
          {values.map((value) => (
            <div className="list-item" key={value}>
              {value}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AppointmentsPanel({
  appointments,
  onStatus
}: {
  appointments: Appointment[];
  onStatus: (appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") => void;
}) {
  return (
    <section className="panel stack">
      <h2 className="inline">
        <ClipboardList size={20} />
        Turnos
      </h2>
      {appointments.length === 0 ? (
        <div className="message">Todavia no hay turnos.</div>
      ) : (
        <div className="list">
          {appointments.map((appointment) => (
            <article className="list-item" key={appointment.id}>
              <header>
                <strong>{appointment.customer.name}</strong>
                <span className={statusClass(appointment.status)}>{appointment.status}</span>
              </header>
              <span>{appointment.service.name}</span>
              <span>{formatDateTime(appointment.startsAt)}</span>
              <div className="inline">
                <button className="button-secondary" onClick={() => onStatus(appointment.id, "completed")} type="button">
                  Completar
                </button>
                <button className="button-danger" onClick={() => onStatus(appointment.id, "no_show")} type="button">
                  No-show
                </button>
                <button className="button-muted" onClick={() => onStatus(appointment.id, "cancelled_by_business")} type="button">
                  Cancelar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function statusClass(status: Appointment["status"]): string {
  if (status === "no_show" || status.startsWith("cancelled")) {
    return "badge badge-danger";
  }
  if (status === "completed") {
    return "badge";
  }
  return "badge badge-warning";
}

function weekdayName(weekday: number): string {
  return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][weekday] ?? "Dia";
}
