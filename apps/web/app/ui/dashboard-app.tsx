"use client";

import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Mail,
  LogIn,
  TrendingDown,
  TrendingUp,
  RefreshCcw,
  Scissors,
  Settings2,
  ShieldAlert,
  UserPlus,
  Users
} from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  Appointment,
  AvailabilitySlot,
  CurrentBusiness,
  DashboardMetrics,
  NotificationHistoryItem,
  ReminderSettings
} from "../../lib/api";
import { formatDateTime, formatMoney, formatPercent, requestJson } from "../../lib/api";
import {
  buildRecurringCustomerBars,
  buildTopServiceBars,
  buildWeeklyChartBars,
  riskTone
} from "../../lib/dashboard-metrics";
import { formNumber, formString } from "../../lib/form";

type AuthMode = "login" | "register";
type DashboardView = "setup" | "schedule" | "appointments" | "reminders";

export function DashboardApp() {
  const [activeView, setActiveView] = useState<DashboardView>("setup");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([]);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
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
      const [currentBusiness, currentAppointments, currentMetrics, currentReminderSettings, currentNotificationHistory] = await Promise.all([
        requestJson<CurrentBusiness | null>("/businesses/current", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }),
        requestJson<Appointment[]>("/appointments", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<DashboardMetrics>("/dashboard/metrics", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null),
        requestJson<ReminderSettings>("/businesses/current/reminder-settings", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null),
        requestJson<NotificationHistoryItem[]>("/dashboard/notifications", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => [])
      ]);
      setBusiness(currentBusiness);
      setAppointments(currentAppointments);
      setMetrics(currentMetrics);
      setReminderSettings(currentReminderSettings);
      setNotificationHistory(currentNotificationHistory);
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

  async function handleAvailabilityException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitAndRefresh(event.currentTarget, "/availability-exceptions", {
      date: formString(formData, "date"),
      endTime: formString(formData, "endTime"),
      reason: formString(formData, "reason") || undefined,
      staffMemberId: formString(formData, "staffMemberId") || undefined,
      startTime: formString(formData, "startTime"),
      type: formString(formData, "type", "BLOCKED")
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

  async function handleReminderSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      await authRequest<ReminderSettings>("/businesses/current/reminder-settings", {
        body: JSON.stringify({
          channel: "mock",
          enabled: formString(formData, "enabled", "true") === "true",
          offsetMinutes: formNumber(formData, "offsetMinutes", 1440),
          template: formString(formData, "template", "appointment_reminder_24h")
        }),
        method: "PATCH"
      });
      await refresh();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "No se pudo guardar la configuracion");
    }
  }

  function logout() {
    window.localStorage.removeItem("turnoflow.token");
    setAppointments([]);
    setBusiness(null);
    setMetrics(null);
    setNotificationHistory([]);
    setReminderSettings(null);
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
            <>
              <Link className="button-link button-secondary" href={`/${business.slug}`}>
                Pagina publica
              </Link>
              <Link className="button-link button-secondary" href={`/${business.slug}/book`}>
                Reservar
              </Link>
            </>
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
        <AuthView authMode={authMode} onAuthMode={setAuthMode} onSubmit={(event) => void handleAuth(event)} />
      ) : (
        <>
          <DashboardTabs activeView={activeView} onChange={setActiveView} />
          {activeView === "setup" ? (
            <SetupView
              business={business}
              onBusinessSubmit={(event) => void handleBusiness(event)}
              onServiceSubmit={(event) => void handleService(event)}
              onStaffSubmit={(event) => void handleStaff(event)}
            />
          ) : null}
          {activeView === "schedule" ? (
            <ScheduleView
              business={business}
              onAvailabilityExceptionSubmit={(event) => void handleAvailabilityException(event)}
              onAvailabilitySubmit={(event) => void handleAvailability(event)}
            />
          ) : null}
          {activeView === "appointments" ? (
            <AppointmentsView
              appointments={appointments}
              business={business}
              metrics={metrics}
              onStatus={(appointmentId, status) => {
                void updateAppointmentStatus(appointmentId, status);
              }}
            />
          ) : null}
          {activeView === "reminders" ? (
            <RemindersView
              history={notificationHistory}
              settings={reminderSettings}
              onSubmit={(event) => void handleReminderSettings(event)}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

function AuthView({
  authMode,
  onAuthMode,
  onSubmit
}: {
  authMode: AuthMode;
  onAuthMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="layout-grid">
      <form className="panel stack" onSubmit={onSubmit}>
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
          onClick={() => onAuthMode(authMode === "login" ? "register" : "login")}
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
  );
}

function DashboardTabs({
  activeView,
  onChange
}: {
  activeView: DashboardView;
  onChange: (view: DashboardView) => void;
}) {
  return (
    <nav className="tabbar" aria-label="Dashboard">
      <TabButton active={activeView === "setup"} icon={<Settings2 size={18} />} label="Configuracion" onClick={() => onChange("setup")} />
      <TabButton
        active={activeView === "schedule"}
        icon={<CalendarDays size={18} />}
        label="Disponibilidad"
        onClick={() => onChange("schedule")}
      />
      <TabButton
        active={activeView === "appointments"}
        icon={<ClipboardList size={18} />}
        label="Turnos"
        onClick={() => onChange("appointments")}
      />
      <TabButton active={activeView === "reminders"} icon={<BellRing size={18} />} label="Recordatorios" onClick={() => onChange("reminders")} />
    </nav>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-pressed={active} className="tab-button" onClick={onClick} type="button">
      {icon}
      {label}
    </button>
  );
}

function SetupView({
  business,
  onBusinessSubmit,
  onServiceSubmit,
  onStaffSubmit
}: {
  business: CurrentBusiness | null;
  onBusinessSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onServiceSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStaffSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="layout-grid">
      <aside className="stack">
        <BusinessPanel business={business} onSubmit={onBusinessSubmit} />
        {business ? (
          <>
            <ServicePanel onSubmit={onServiceSubmit} />
            <StaffPanel onSubmit={onStaffSubmit} />
          </>
        ) : null}
      </aside>
      <section className="stack">
        <InventoryPanel business={business} />
      </section>
    </section>
  );
}

function ScheduleView({
  business,
  onAvailabilityExceptionSubmit,
  onAvailabilitySubmit
}: {
  business: CurrentBusiness | null;
  onAvailabilityExceptionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAvailabilitySubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!business) {
    return <div className="message">Configura tu negocio para cargar servicios, staff y disponibilidad.</div>;
  }

  return (
    <section className="layout-grid">
      <aside className="stack">
        <AvailabilityPanel business={business} onSubmit={onAvailabilitySubmit} />
        <AvailabilityExceptionPanel business={business} onSubmit={onAvailabilityExceptionSubmit} />
      </aside>
      <section className="stack">
        <SchedulePreview business={business} />
        <section className="grid-2">
          <InventoryList
            icon={<CalendarClock size={18} />}
            title="Reglas semanales"
            values={business.availabilityRules.map((rule) => `${weekdayName(rule.weekday)} ${rule.startTime}-${rule.endTime}`)}
          />
          <InventoryList
            icon={<Clock size={18} />}
            title="Excepciones"
            values={business.availabilityExceptions.map((exception) => {
              const staff = business.staffMembers.find((staffMember) => staffMember.id === exception.staffMemberId);
              const scope = staff ? staff.name : "Todos";
              return `${formatDateOnly(exception.date)} ${exception.startTime}-${exception.endTime} ${scope} ${exception.type}`;
            })}
          />
        </section>
      </section>
    </section>
  );
}

function AppointmentsView({
  appointments,
  business,
  metrics,
  onStatus
}: {
  appointments: Appointment[];
  business: CurrentBusiness | null;
  metrics: DashboardMetrics | null;
  onStatus: (appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") => void;
}) {
  return (
    <section className="stack">
      <MetricsPanel metrics={metrics} />
      <InventoryPanel business={business} />
      <AppointmentsPanel appointments={appointments} onStatus={onStatus} />
    </section>
  );
}

function RemindersView({
  history,
  onSubmit,
  settings
}: {
  history: NotificationHistoryItem[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  settings: ReminderSettings | null;
}) {
  return (
    <section className="layout-grid">
      <aside className="stack">
        <ReminderSettingsPanel onSubmit={onSubmit} settings={settings} />
      </aside>
      <section className="stack">
        <ReminderSummaryPanel history={history} settings={settings} />
        <NotificationHistoryPanel history={history} />
      </section>
    </section>
  );
}

function BusinessPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h3>Nueva disponibilidad</h3>
      <label>
        Staff
        <select name="staffMemberId" required>
          {activeStaffMembers.map((staffMember) => (
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
      <button className="button-primary" disabled={activeStaffMembers.length === 0} type="submit">
        <CalendarClock size={18} />
        Agregar disponibilidad
      </button>
    </form>
  );
}

function AvailabilityExceptionPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h3>Nueva excepcion</h3>
      <label>
        Tipo
        <select defaultValue="BLOCKED" name="type">
          <option value="BLOCKED">Bloqueo</option>
          <option value="EXTRA_OPENING">Apertura extra</option>
        </select>
      </label>
      <label>
        Staff
        <select name="staffMemberId">
          <option value="">Todos</option>
          {activeStaffMembers.map((staffMember) => (
            <option key={staffMember.id} value={staffMember.id}>
              {staffMember.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-3">
        <label>
          Fecha
          <input defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" />
        </label>
        <label>
          Desde
          <input defaultValue="09:00" name="startTime" required type="time" />
        </label>
        <label>
          Hasta
          <input defaultValue="10:00" name="endTime" required type="time" />
        </label>
      </div>
      <label>
        Motivo
        <input name="reason" placeholder="Feriado, capacitacion, apertura especial" />
      </label>
      <button className="button-primary" type="submit">
        <Clock size={18} />
        Agregar excepcion
      </button>
    </form>
  );
}

function SchedulePreview({ business }: { business: CurrentBusiness }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState(business.services[0]?.id ?? "");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);

  const selectedService = useMemo(
    () => business.services.find((service) => service.id === selectedServiceId) ?? null,
    [business.services, selectedServiceId]
  );

  useEffect(() => {
    setSelectedServiceId((currentServiceId) => currentServiceId || business.services[0]?.id || "");
  }, [business.services]);

  useEffect(() => {
    let active = true;

    async function loadAvailability() {
      if (!selectedServiceId) {
        setSlots([]);
        return;
      }

      setError(null);
      try {
        const slotResponse = await requestJson<AvailabilitySlot[]>(
          `/public/businesses/${business.slug}/availability?serviceId=${selectedServiceId}&date=${date}`
        );

        if (active) {
          setSlots(slotResponse);
        }
      } catch (availabilityError) {
        if (active) {
          setSlots([]);
          setError(availabilityError instanceof Error ? availabilityError.message : "No se pudo cargar disponibilidad");
        }
      }
    }

    void loadAvailability();

    return () => {
      active = false;
    };
  }, [business.slug, date, selectedServiceId]);

  return (
    <section className="panel stack">
      <h2 className="inline">
        <CalendarDays size={20} />
        Preview agenda
      </h2>
      <div className="grid-2">
        <label>
          Servicio
          <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)}>
            {business.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.durationMinutes} min
              </option>
            ))}
          </select>
        </label>
        <label>
          Dia
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" />
        </label>
      </div>
      {selectedService ? <div className="message">{selectedService.name}: {formatMoney(selectedService.priceCents)}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="slot-grid">
        {slots.map((slot) => (
          <div className="slot-chip" key={`${slot.staffMemberId}-${slot.startsAt}`}>
            <Clock size={16} />
            {new Date(slot.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        ))}
      </div>
      {slots.length === 0 ? <div className="message">No hay horarios visibles para ese dia.</div> : null}
    </section>
  );
}

function ReminderSettingsPanel({
  onSubmit,
  settings
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  settings: ReminderSettings | null;
}) {
  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h2 className="inline">
        <BellRing size={20} />
        Configuracion de recordatorios
      </h2>
      <label>
        Recordatorios automáticos
        <select defaultValue={settings?.enabled ? "true" : "false"} name="enabled">
          <option value="true">Activados</option>
          <option value="false">Pausados</option>
        </select>
      </label>
      <label>
        Anticipacion
        <select defaultValue={String(settings?.offsetMinutes ?? 1440)} name="offsetMinutes">
          <option value="60">1 hora antes</option>
          <option value="180">3 horas antes</option>
          <option value="720">12 horas antes</option>
          <option value="1440">24 horas antes</option>
          <option value="2880">48 horas antes</option>
        </select>
      </label>
      <label>
        Canal
        <input disabled name="channel" readOnly value="mock" />
      </label>
      <label>
        Template
        <input defaultValue={settings?.template ?? "appointment_reminder_24h"} name="template" />
      </label>
      <div className="message">
        El MVP guarda entregas simuladas en base y reintenta fallos. Email real queda para la siguiente iteracion.
      </div>
      <button className="button-primary" type="submit">
        <CheckCircle2 size={18} />
        Guardar recordatorios
      </button>
    </form>
  );
}

function ReminderSummaryPanel({
  history,
  settings
}: {
  history: NotificationHistoryItem[];
  settings: ReminderSettings | null;
}) {
  const sentCount = history.filter((item) => item.status === "sent").length;
  const failedCount = history.filter((item) => item.status === "failed").length;
  const pendingCount = history.filter((item) => item.status === "pending").length;

  return (
    <section className="metric-grid">
      <Metric label="Estado" value={settings?.enabled ? "Activo" : "Pausado"} />
      <Metric label="Enviados" value={sentCount} />
      <Metric label="Pendientes" value={pendingCount} tone="warning" />
      <Metric label="Fallidos" value={failedCount} tone="danger" />
    </section>
  );
}

function MetricsPanel({ metrics }: { metrics: DashboardMetrics | null }) {
  const weeklyBars = buildWeeklyChartBars(metrics);
  const serviceBars = buildTopServiceBars(metrics);
  const recurringBars = buildRecurringCustomerBars(metrics);

  return (
    <section className="stack">
      <section className="metric-grid metric-grid-analytics">
        <Metric icon={<CalendarDays size={18} />} label="Turnos del mes" value={metrics?.totalAppointments ?? 0} />
        <Metric icon={<Clock size={18} />} label="Activos" value={metrics?.activeAppointments ?? 0} />
        <Metric icon={<CheckCircle2 size={18} />} label="Completados" value={metrics?.completedAppointments ?? 0} />
        <Metric icon={<AlertTriangle size={18} />} label="Cancelados" value={metrics?.cancelledAppointments ?? 0} tone="warning" />
        <Metric icon={<ShieldAlert size={18} />} label="No-shows" value={metrics?.noShowAppointments ?? 0} tone="danger" />
        <Metric icon={<TrendingUp size={18} />} label="Ingreso estimado" value={formatMoney(metrics?.estimatedRevenueCents ?? 0)} />
        <Metric icon={<TrendingDown size={18} />} label="Perdida estimada" value={formatMoney(metrics?.lostRevenueCents ?? 0)} tone="warning" />
        <Metric icon={<Users size={18} />} label="Tasa de no-show" value={`${formatPercent(metrics?.noShowRate ?? 0)}%`} tone="danger" />
      </section>

      <section className="analytics-grid">
        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2>Actividad semanal</h2>
              <p>Turnos del dashboard de los ultimos 7 dias.</p>
            </div>
            <span className="badge">{metrics?.weeklyBreakdown.length ?? 0} dias</span>
          </header>
          {weeklyBars.length === 0 ? (
            <div className="message">Todavia no hay datos diarios para el grafico.</div>
          ) : (
            <div className="weekly-chart" aria-label="Actividad semanal">
              {weeklyBars.map((bar) => (
                <div className="weekly-column" key={bar.date}>
                  <div className="weekly-bar-stack">
                    <div className="weekly-bar-fill" style={{ height: `${bar.height}%` }} />
                  </div>
                  <strong>{bar.totalAppointments}</strong>
                  <span>{bar.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="legend-row">
            <span className="legend-item"><span className="legend-swatch legend-primary" /> Total diario</span>
            <span className="legend-item"><span className="legend-swatch legend-danger" /> No-shows: {metrics?.noShowAppointments ?? 0}</span>
          </div>
        </section>

        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2>Servicios mas reservados</h2>
              <p>Ranking mensual sobre turnos no cancelados.</p>
            </div>
          </header>
          {serviceBars.length === 0 ? (
            <div className="message">Todavia no hay servicios con reservas en el periodo.</div>
          ) : (
            <div className="stack">
              {serviceBars.map((service) => (
                <article className="rank-row" key={service.label}>
                  <header>
                    <strong>{service.label}</strong>
                    <span>{service.value} reservas</span>
                  </header>
                  <div className="rank-track">
                    <div className="rank-fill" style={{ width: `${service.width}%` }} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="analytics-grid analytics-grid-bottom">
        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2>Clientes recurrentes</h2>
              <p>Clientes con mas de una reserva confirmada o cerrada en el mes.</p>
            </div>
          </header>
          {recurringBars.length === 0 ? (
            <div className="message">Todavia no hay clientes recurrentes en el periodo.</div>
          ) : (
            <div className="stack">
              {recurringBars.map((customer) => (
                <article className="rank-row" key={customer.label}>
                  <header>
                    <strong>{customer.label}</strong>
                    <span>{customer.value} turnos</span>
                  </header>
                  <div className="rank-track">
                    <div className="rank-fill rank-fill-secondary" style={{ width: `${customer.width}%` }} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2>Clientes riesgosos</h2>
              <p>Score persistido por historial de asistencia.</p>
            </div>
          </header>
          <RiskyCustomersTable metrics={metrics} />
        </section>
      </section>
    </section>
  );
}

function NotificationHistoryPanel({ history }: { history: NotificationHistoryItem[] }) {
  return (
    <section className="panel stack">
      <h2 className="inline">
        <Mail size={20} />
        Historial de notificaciones
      </h2>
      {history.length === 0 ? (
        <div className="message">Todavia no hay recordatorios procesados.</div>
      ) : (
        <div className="list">
          {history.map((item) => (
            <article className="list-item" key={item.id}>
              <header>
                <strong>{item.appointment?.customer.name ?? item.email}</strong>
                <span className={notificationStatusClass(item.status)}>{item.status}</span>
              </header>
              <span>{item.email}</span>
              <span>
                {item.appointment
                  ? `${item.appointment.service.name} · ${formatDateTime(item.appointment.startsAt)}`
                  : "Sin turno asociado"}
              </span>
              <div className="detail-grid">
                <span>Template: {item.template}</span>
                <span>Intentos: {item.attempts}</span>
                <span>Creado: {formatDateTime(item.createdAt)}</span>
                <span>Enviado: {item.sentAt ? formatDateTime(item.sentAt) : "Pendiente"}</span>
              </div>
              {item.lastError ? (
                <div className="error inline">
                  <ShieldAlert size={16} />
                  {item.lastError}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  tone,
  value
}: {
  icon?: ReactNode;
  label: string;
  tone?: "danger" | "warning";
  value: number | string;
}) {
  const className = tone === "danger" ? "badge badge-danger" : tone === "warning" ? "badge badge-warning" : "badge";
  return (
    <div className="metric">
      {icon ? <div className="metric-icon">{icon}</div> : null}
      <strong>{value}</strong>
      <span className={className}>{label}</span>
    </div>
  );
}

function RiskyCustomersTable({ metrics }: { metrics: DashboardMetrics | null }) {
  if (!metrics || metrics.riskyCustomers.length === 0) {
    return <div className="message">No hay clientes con riesgo medio o alto todavia.</div>;
  }

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Riesgo</th>
            <th>Score</th>
            <th>No-shows</th>
            <th>Historial</th>
            <th>Senia</th>
          </tr>
        </thead>
        <tbody>
          {metrics.riskyCustomers.map((customer) => (
            <tr key={customer.id}>
              <td>
                <div className="table-primary">
                  <strong>{customer.name}</strong>
                  <span>{customer.email}</span>
                </div>
              </td>
              <td>
                <span className={riskBadgeClass(customer.riskLevel)}>{customer.riskLevel}</span>
              </td>
              <td>{customer.riskScore}</td>
              <td>{customer.noShowCount}</td>
              <td>
                {customer.completedAppointments}/{customer.totalAppointments}
              </td>
              <td>{customer.requiresDeposit ? "Sugerida" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function notificationStatusClass(status: NotificationHistoryItem["status"]): string {
  if (status === "failed") {
    return "badge badge-danger";
  }
  if (status === "sent") {
    return "badge";
  }
  return "badge badge-warning";
}

function riskBadgeClass(level: DashboardMetrics["riskyCustomers"][number]["riskLevel"]): string {
  const tone = riskTone(level);
  if (tone === "danger") {
    return "badge badge-danger";
  }
  if (tone === "warning") {
    return "badge badge-warning";
  }

  return "badge";
}

function weekdayName(weekday: number): string {
  return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][weekday] ?? "Dia";
}

function formatDateOnly(value: string): string {
  return value.slice(0, 10);
}
