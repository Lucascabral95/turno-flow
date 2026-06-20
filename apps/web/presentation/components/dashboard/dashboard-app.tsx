"use client";

import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  PencilLine,
  Save,
  Scissors,
  Trash2,
  X,
  Users
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type {
  Appointment,
  AvailabilitySlot,
  CurrentBusiness,
  DashboardMetrics,
  NotificationHistoryItem,
  ReminderSettings
} from "../../../lib/api";
import { formatMoney, formatSlotTime, requestJson } from "../../../lib/api";
import {
  type AvailabilityExceptionFormValues,
  availabilityExceptionFormSchema,
  type AvailabilityRuleFormValues,
  availabilityRuleFormSchema,
  type BusinessFormValues,
  businessFormSchema,
  type ServiceFormValues,
  serviceFormSchema,
  type StaffFormValues,
  staffFormSchema
} from "../../../lib/dashboard-forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { createLocalDateString } from "../../../lib/booking-forms";
import { formNumber, formString } from "../../../lib/form";
import { AppointmentsView } from "./dashboard-appointments";
import { AuthView, DashboardShell, PageHeader } from "./dashboard-chrome";
import {
  appointmentStatusMessage,
  capitalizeFirst,
  countCoveredWeekdays,
  formatDateOnly,
  summarizeAvailabilityCoverage,
  weekdayName,
  weekdayOptions
} from "./dashboard-helpers";
import { BookingAdminView, HomeView, MetricsPanel } from "./dashboard-overview";
import { RemindersView } from "./dashboard-reminders";
import { Alert, EmptyState, InventoryList, LoadingState, Metric, SummaryValue } from "./dashboard-shared";
import styles from "./dashboard-app.module.scss";
export type DashboardView = "home" | "setup" | "schedule" | "appointments" | "reminders" | "booking" | "metrics";

type SubmitResult = Promise<boolean>;
type AuthMode = "login" | "register";

export function DashboardApp({ initialView = "home" }: { initialView?: DashboardView }) {
  const activeView = initialView;
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
      toast.success(authMode === "login" ? "Sesion iniciada" : "Cuenta creada");
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "No se pudo iniciar sesion";
      setError(message);
      toast.error(message);
    }
  }

  async function handleBusiness(input: BusinessFormValues): SubmitResult {
    setError(null);
    const payload = {
      email: input.email || undefined,
      name: input.name,
      slug: input.slug || undefined,
      timezone: input.timezone || undefined
    };

    try {
      await authRequest<CurrentBusiness>("/businesses/current", {
        body: JSON.stringify(payload),
        method: business ? "PATCH" : "POST"
      });
      await refresh();
      toast.success("Negocio guardado");
      return true;
    } catch (businessError) {
      const message = businessError instanceof Error ? businessError.message : "No se pudo guardar el negocio";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleService(input: ServiceFormValues): SubmitResult {
    return submitAndRefresh("/services", {
      bufferMinutes: input.bufferMinutes,
      durationMinutes: input.durationMinutes,
      name: input.name,
      priceCents: input.price * 100
    }, "Servicio agregado");
  }

  async function handleServiceUpdate(serviceId: string, input: ServiceFormValues): SubmitResult {
    setError(null);
    try {
      await authRequest(`/services/${serviceId}`, {
        body: JSON.stringify({
          bufferMinutes: input.bufferMinutes,
          durationMinutes: input.durationMinutes,
          name: input.name,
          priceCents: input.price * 100
        }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Servicio actualizado");
      return true;
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "No se pudo actualizar el servicio";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleServiceDelete(serviceId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/services/${serviceId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Servicio eliminado");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el servicio";
      setError(message);
      toast.error(message);
    }
  }

  async function handleStaff(input: StaffFormValues): SubmitResult {
    return submitAndRefresh("/staff-members", {
      email: input.email || undefined,
      name: input.name
    }, "Profesional agregado");
  }

  async function handleStaffUpdate(staffMemberId: string, input: StaffFormValues): SubmitResult {
    setError(null);
    try {
      await authRequest(`/staff-members/${staffMemberId}`, {
        body: JSON.stringify({
          email: input.email || undefined,
          name: input.name
        }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Profesional actualizado");
      return true;
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "No se pudo actualizar el profesional";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleStaffDelete(staffMemberId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/staff-members/${staffMemberId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Profesional eliminado");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el profesional";
      setError(message);
      toast.error(message);
    }
  }

  async function handleAvailability(input: AvailabilityRuleFormValues): SubmitResult {
    return submitAndRefresh("/availability-rules", input, "Disponibilidad agregada");
  }

  async function handleAvailabilityDelete(ruleId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/availability-rules/${ruleId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Disponibilidad borrada");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo borrar la disponibilidad";
      setError(message);
      toast.error(message);
    }
  }

  async function handleAvailabilityException(input: AvailabilityExceptionFormValues): SubmitResult {
    return submitAndRefresh("/availability-exceptions", {
      date: input.date,
      endTime: input.endTime,
      reason: input.reason || undefined,
      staffMemberId: input.staffMemberId || undefined,
      startTime: input.startTime,
      type: input.type
    }, "Excepcion agregada");
  }

  async function submitAndRefresh(path: string, payload: unknown, successMessage: string): SubmitResult {
    setError(null);
    try {
      await authRequest(path, {
        body: JSON.stringify(payload),
        method: "POST"
      });
      await refresh();
      toast.success(successMessage);
      return true;
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "No se pudo guardar";
      setError(message);
      toast.error(message);
      return false;
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
      toast.success(appointmentStatusMessage(status));
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "No se pudo actualizar el turno";
      setError(message);
      toast.error(message);
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
      toast.success("Recordatorios guardados");
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : "No se pudo guardar la configuracion";
      setError(message);
      toast.error(message);
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

  if (!token) {
    return (
      <main className={styles.authShell}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <AuthView authMode={authMode} onAuthMode={setAuthMode} onSubmit={(event) => void handleAuth(event)} />
      </main>
    );
  }

  return (
    <DashboardShell activeView={activeView} business={business} loading={loading}>
      <PageHeader
        activeView={activeView}
        business={business}
        loading={loading}
        onLogout={logout}
        onRefresh={() => void refresh()}
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading && !business ? <LoadingState /> : null}

      <section className="dashboard-content">
        {activeView === "home" ? <HomeView appointments={appointments} business={business} metrics={metrics} /> : null}
        {activeView === "setup" ? (
          <SetupView
            business={business}
            onBusinessSubmit={handleBusiness}
            onServiceDelete={(serviceId) => {
              void handleServiceDelete(serviceId);
            }}
            onServiceSubmit={handleService}
            onServiceUpdate={handleServiceUpdate}
            onStaffDelete={(staffMemberId) => {
              void handleStaffDelete(staffMemberId);
            }}
            onStaffSubmit={handleStaff}
            onStaffUpdate={handleStaffUpdate}
          />
        ) : null}
        {activeView === "schedule" ? (
          <ScheduleView
            business={business}
            onAvailabilityExceptionSubmit={handleAvailabilityException}
            onAvailabilityRuleDelete={(ruleId) => {
              void handleAvailabilityDelete(ruleId);
            }}
            onAvailabilitySubmit={handleAvailability}
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
            appointments={appointments}
            history={notificationHistory}
            settings={reminderSettings}
            onSubmit={(event) => void handleReminderSettings(event)}
          />
        ) : null}
        {activeView === "booking" ? <BookingAdminView business={business} /> : null}
        {activeView === "metrics" ? <MetricsPanel metrics={metrics} /> : null}
      </section>
    </DashboardShell>
  );
}

function SetupView({
  business,
  onBusinessSubmit,
  onServiceDelete,
  onServiceSubmit,
  onServiceUpdate,
  onStaffDelete,
  onStaffSubmit,
  onStaffUpdate
}: {
  business: CurrentBusiness | null;
  onBusinessSubmit: (input: BusinessFormValues) => SubmitResult;
  onServiceDelete: (serviceId: string) => void;
  onServiceSubmit: (input: ServiceFormValues) => SubmitResult;
  onServiceUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
  onStaffDelete: (staffMemberId: string) => void;
  onStaffSubmit: (input: StaffFormValues) => SubmitResult;
  onStaffUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
}) {
  return (
    <section className={`stack ${styles.setupView}`}>
      <section className="feature-banner dashboard-section-banner">
        <div>
          <span className="badge badge-soft">Configuracion operativa</span>
          <h2>Define la identidad del negocio, los servicios que vendes y quienes atienden.</h2>
          <p>Esta base alimenta reservas, disponibilidad, metricas y comunicaciones. Si esta parte queda prolija, el resto del flujo funciona mejor.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<Scissors size={18} />} label="Servicios" value={business?.services.length ?? 0} />
          <Metric icon={<Users size={18} />} label="Staff" value={business?.staffMembers.length ?? 0} />
          <Metric icon={<CalendarClock size={18} />} label="Reglas activas" value={business?.availabilityRules.filter((rule) => rule.active).length ?? 0} />
        </div>
      </section>
      <section className="layout-grid layout-grid-wide">
        <aside className="stack">
          <BusinessPanel business={business} onSubmit={onBusinessSubmit} />
        </aside>
        <section className="stack">
          <BusinessIdentityPanel business={business} />
        </section>
      </section>
      {business ? (
        <section className="grid-2">
          <ServicePanel business={business} onSubmit={onServiceSubmit} />
          <StaffPanel business={business} onSubmit={onStaffSubmit} />
        </section>
      ) : null}
      <section className="stack">
        <SetupInventoryPanel
          business={business}
          onServiceDelete={onServiceDelete}
          onServiceUpdate={onServiceUpdate}
          onStaffDelete={onStaffDelete}
          onStaffUpdate={onStaffUpdate}
        />
      </section>
    </section>
  );
}

function ScheduleView({
  business,
  onAvailabilityExceptionSubmit,
  onAvailabilityRuleDelete,
  onAvailabilitySubmit
}: {
  business: CurrentBusiness | null;
  onAvailabilityExceptionSubmit: (input: AvailabilityExceptionFormValues) => SubmitResult;
  onAvailabilityRuleDelete: (ruleId: string) => void;
  onAvailabilitySubmit: (input: AvailabilityRuleFormValues) => SubmitResult;
}) {
  if (!business) {
    return <div className="message">Configura tu negocio para cargar servicios, staff y disponibilidad.</div>;
  }

  return (
    <section className={`stack ${styles.scheduleView}`}>
      <section className="feature-banner dashboard-section-banner">
        <div>
          <span className="badge badge-soft">Agenda semanal</span>
          <h2>Asigna una disponibilidad semanal por dia para cada profesional y controla excepciones puntuales.</h2>
          <p>La regla operativa queda clara: un profesional no puede tener dos horarios activos el mismo dia de la semana.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<CalendarDays size={18} />} label="Dias cubiertos" value={countCoveredWeekdays(business.availabilityRules)} />
          <Metric icon={<Users size={18} />} label="Profesionales activos" value={business.staffMembers.filter((member) => member.active).length} />
          <Metric icon={<Clock size={18} />} label="Excepciones" value={business.availabilityExceptions.length} />
        </div>
      </section>
      <WeeklyAvailabilityBoard business={business} onDeleteRule={onAvailabilityRuleDelete} />
      <section className="layout-grid layout-grid-wide">
        <aside className="stack">
          <AvailabilityPanel business={business} onSubmit={onAvailabilitySubmit} />
          <AvailabilityExceptionPanel business={business} onSubmit={onAvailabilityExceptionSubmit} />
        </aside>
        <section className="stack">
          <SchedulePreview business={business} />
          <section className="grid-2">
            <AvailabilityRulesPanel business={business} onDeleteRule={onAvailabilityRuleDelete} />
            <AvailabilityExceptionsPanel business={business} />
          </section>
        </section>
      </section>
    </section>
  );
}

function BusinessIdentityPanel({ business }: { business: CurrentBusiness | null }) {
  if (!business) {
    return (
      <section className="panel stack">
        <div className="form-header">
          <h2>Identidad del negocio</h2>
          <p>Primero crea el negocio. Despues vas a poder revisar el resumen y abrir el flujo publico.</p>
        </div>
        <EmptyState
          compact
          title="Sin negocio configurado"
          description="Carga nombre, slug y zona horaria para habilitar el resto de la operacion."
        />
      </section>
    );
  }

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h2>Identidad del negocio</h2>
          <p>Resumen rapido de la configuracion base que impacta la reserva publica y la operacion diaria.</p>
        </div>
        <span className="badge badge-soft">Activo</span>
      </header>
      <div className="summary-grid">
        <SummaryValue label="Nombre" value={business.name} />
        <SummaryValue label="Slug publico" value={business.slug} />
        <SummaryValue label="Zona horaria" value={business.timezone} />
        <SummaryValue label="Email" value={business.email ?? "No configurado"} />
      </div>
      <Alert>La URL publica del negocio queda en `/{business.slug}` y la reserva directa en `/{business.slug}/book`.</Alert>
    </section>
  );
}

function SetupInventoryPanel({
  business,
  onServiceDelete,
  onServiceUpdate,
  onStaffDelete,
  onStaffUpdate
}: {
  business: CurrentBusiness | null;
  onServiceDelete: (serviceId: string) => void;
  onServiceUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
  onStaffDelete: (staffMemberId: string) => void;
  onStaffUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
}) {
  if (!business) {
    return (
      <EmptyState
        title="Todavia no hay inventario operativo"
        description="Cuando crees el negocio vas a poder cargar servicios y profesionales en esta misma pantalla."
      />
    );
  }

  return (
    <section className="grid-3">
      <ServiceManagementPanel
        business={business}
        onDelete={onServiceDelete}
        onUpdate={onServiceUpdate}
      />
      <StaffManagementPanel
        business={business}
        onDelete={onStaffDelete}
        onUpdate={onStaffUpdate}
      />
      <InventoryList
        icon={<CalendarClock size={18} />}
        title="Cobertura semanal"
        values={summarizeAvailabilityCoverage(business.availabilityRules, business.staffMembers)}
      />
    </section>
  );
}

function WeeklyAvailabilityBoard({
  business,
  onDeleteRule
}: {
  business: CurrentBusiness;
  onDeleteRule: (ruleId: string) => void;
}) {
  const activeRules = business.availabilityRules.filter((rule) => rule.active);

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h2>Mapa semanal por profesional</h2>
          <p>Cada tarjeta muestra como queda distribuida la agenda semanal real por dia.</p>
        </div>
      </header>
      <div className="weekday-board">
        {weekdayOptions.map((day) => {
          const rulesForDay = activeRules.filter((rule) => rule.weekday === day.value);

          return (
            <article className="weekday-card" key={day.value}>
              <header className="weekday-card-header">
                <strong>{day.label}</strong>
                <span>{rulesForDay.length} regla{rulesForDay.length === 1 ? "" : "s"}</span>
              </header>
              {rulesForDay.length === 0 ? (
                <div className="weekday-card-empty">Sin cobertura</div>
              ) : (
                <div className="weekday-card-list">
                  {rulesForDay.map((rule) => {
                    const staffName =
                      business.staffMembers.find((staffMember) => staffMember.id === rule.staffMemberId)?.name ?? "Profesional";

                    return (
                      <div className="weekday-card-item" key={rule.id}>
                        <div>
                          <strong>{capitalizeFirst(staffName)}</strong>
                          <span>
                            {rule.startTime} - {rule.endTime}
                          </span>
                        </div>
                        <button
                          aria-label={`Borrar disponibilidad de ${capitalizeFirst(staffName)} ${weekdayName(rule.weekday)}`}
                          className="icon-button icon-button-danger"
                          onClick={() => onDeleteRule(rule.id)}
                          title="Borrar disponibilidad"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AvailabilityRulesPanel({
  business,
  onDeleteRule
}: {
  business: CurrentBusiness;
  onDeleteRule: (ruleId: string) => void;
}) {
  const rules = business.availabilityRules.filter((rule) => rule.active);

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h3>Reglas semanales</h3>
          <p>Vista textual de la configuracion activa.</p>
        </div>
      </header>
      {rules.length === 0 ? (
        <EmptyState compact title="Sin reglas" description="Agrega una disponibilidad semanal para empezar a mostrar slots." />
      ) : (
        <div className="list">
          {rules.map((rule) => {
            const staffName =
              business.staffMembers.find((staffMember) => staffMember.id === rule.staffMemberId)?.name ?? "Profesional";

            return (
              <article className="availability-rule-row" key={rule.id}>
                <div className="availability-rule-date">
                  <strong>{weekdayName(rule.weekday)}</strong>
                  <span>{rule.startTime} - {rule.endTime}</span>
                </div>
                <span className="badge badge-soft">{capitalizeFirst(staffName)}</span>
                <button
                  aria-label={`Borrar disponibilidad de ${capitalizeFirst(staffName)} ${weekdayName(rule.weekday)}`}
                  className="icon-button icon-button-danger"
                  onClick={() => onDeleteRule(rule.id)}
                  title="Borrar disponibilidad"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailabilityExceptionsPanel({ business }: { business: CurrentBusiness }) {
  const exceptions = business.availabilityExceptions;

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h3>Excepciones</h3>
          <p>Bloqueos y aperturas puntuales aplicadas sobre la agenda.</p>
        </div>
      </header>
      {exceptions.length === 0 ? (
        <EmptyState compact title="Sin excepciones" description="Todavia no hay feriados, ausencias ni aperturas especiales cargadas." />
      ) : (
        <div className="list">
          {exceptions.map((exception) => {
            const staffName = exception.staffMemberId
              ? business.staffMembers.find((staffMember) => staffMember.id === exception.staffMemberId)?.name ?? "Profesional"
              : "Todos";

            return (
              <article className="list-item" key={exception.id}>
                <header>
                  <strong>{formatDateOnly(exception.date)}</strong>
                  <span className={exception.type === "BLOCKED" ? "badge badge-danger" : "badge badge-warning"}>
                    {exception.type === "BLOCKED" ? "Bloqueo" : "Apertura"}
                  </span>
                </header>
                <span>
                  {staffName} - {exception.startTime} a {exception.endTime}
                </span>
                {exception.reason ? <span>{exception.reason}</span> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BusinessPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness | null;
  onSubmit: (input: BusinessFormValues) => SubmitResult;
}) {
  const form = useForm<BusinessFormValues>({
    defaultValues: {
      email: business?.email ?? "",
      name: business?.name ?? "",
      slug: "",
      timezone: business?.timezone ?? "America/Argentina/Buenos_Aires"
    },
    resolver: zodResolver(businessFormSchema)
  });

  useEffect(() => {
    form.reset({
      email: business?.email ?? "",
      name: business?.name ?? "",
      slug: "",
      timezone: business?.timezone ?? "America/Argentina/Buenos_Aires"
    });
  }, [business, form]);

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                ...values,
                slug: ""
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h2>{business ? "Negocio" : "Configurar negocio"}</h2>
        <p>Datos base para identificar tu workspace y publicar la agenda.</p>
      </div>
      <label>
        Nombre
        <input {...form.register("name")} placeholder="Barberia Lucas" />
        {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
      </label>
      {!business ? (
        <label>
          Slug publico
          <input {...form.register("slug")} placeholder="barberia-lucas" />
          <span className="field-hint">Se usa para la URL publica del negocio.</span>
          {form.formState.errors.slug ? <span className="field-error">{form.formState.errors.slug.message}</span> : null}
        </label>
      ) : null}
      <label>
        Zona horaria
        <input {...form.register("timezone")} />
        {form.formState.errors.timezone ? <span className="field-error">{form.formState.errors.timezone.message}</span> : null}
      </label>
      <label>
        Email
        <input {...form.register("email")} type="email" />
        {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
      </label>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <CheckCircle2 size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Guardar negocio"}
      </button>
    </form>
  );
}

function ServicePanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: ServiceFormValues) => SubmitResult;
}) {
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      bufferMinutes: 0,
      durationMinutes: 30,
      name: "",
      price: 0
    },
    resolver: zodResolver(serviceFormSchema)
  });
  const existingNames = business.services
    .filter((service) => service.active)
    .map((service) => service.name.trim().toLowerCase());

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            if (existingNames.includes(values.name.trim().toLowerCase())) {
              form.setError("name", {
                message: "Ya existe un servicio activo con ese nombre"
              });
              return;
            }

            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                bufferMinutes: 0,
                durationMinutes: 30,
                name: "",
                price: 0
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nuevo servicio</h3>
        <p>Define nombre, duracion, buffer y precio con un criterio consistente para la agenda.</p>
      </div>
      <label>
        Nombre
        <input {...form.register("name")} placeholder="Corte clasico" />
        {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
      </label>
      <div className="grid-3">
        <label>
          Duracion
          <input {...form.register("durationMinutes", { valueAsNumber: true })} min={5} type="number" />
          {form.formState.errors.durationMinutes ? (
            <span className="field-error">{form.formState.errors.durationMinutes.message}</span>
          ) : null}
        </label>
        <label>
          Buffer
          <input {...form.register("bufferMinutes", { valueAsNumber: true })} min={0} type="number" />
          {form.formState.errors.bufferMinutes ? (
            <span className="field-error">{form.formState.errors.bufferMinutes.message}</span>
          ) : null}
        </label>
        <label>
          Precio
          <input {...form.register("price", { valueAsNumber: true })} min={0} type="number" />
          {form.formState.errors.price ? <span className="field-error">{form.formState.errors.price.message}</span> : null}
        </label>
      </div>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Scissors size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar servicio"}
      </button>
    </form>
  );
}

function StaffPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: StaffFormValues) => SubmitResult;
}) {
  const form = useForm<StaffFormValues>({
    defaultValues: {
      email: "",
      name: ""
    },
    resolver: zodResolver(staffFormSchema)
  });
  const existingEmails = business.staffMembers
    .map((staffMember) => staffMember.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const normalizedEmail = values.email?.trim().toLowerCase() ?? "";

            if (normalizedEmail && existingEmails.includes(normalizedEmail)) {
              form.setError("email", {
                message: "Ya existe un profesional con ese email"
              });
              return;
            }

            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                email: "",
                name: ""
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nuevo profesional</h3>
        <p>Cada profesional define su propia agenda semanal y aparece en el flujo publico de reserva.</p>
      </div>
      <label>
        Nombre
        <input {...form.register("name")} placeholder="Lucas" />
        {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
      </label>
      <label>
        Email
        <input {...form.register("email")} type="email" />
        {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
      </label>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Users size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar profesional"}
      </button>
    </form>
  );
}

function ServiceManagementPanel({
  business,
  onDelete,
  onUpdate
}: {
  business: CurrentBusiness;
  onDelete: (serviceId: string) => void;
  onUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
}) {
  const services = business.services.filter((service) => service.active);

  return (
    <section className="panel stack inventory-panel management-panel">
      <header className="inventory-panel-header">
        <h3 className="inline">
          <Scissors size={18} />
          Servicios cargados
        </h3>
        <span className="badge badge-soft">{services.length}</span>
      </header>
      <p className="management-copy">Edita nombre, duracion, buffer y precio sin salir de configuracion.</p>
      {services.length === 0 ? (
        <EmptyState compact title="Sin servicios" description="Todavia no cargaste servicios activos." />
      ) : (
        <div className="management-list">
          {services.map((service) => (
            <ManagedServiceItem
              existingNames={services.map((item) => item.name)}
              key={service.id}
              onDelete={onDelete}
              onUpdate={onUpdate}
              service={service}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManagedServiceItem({
  existingNames,
  onDelete,
  onUpdate,
  service
}: {
  existingNames: string[];
  onDelete: (serviceId: string) => void;
  onUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
  service: CurrentBusiness["services"][number];
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      bufferMinutes: service.bufferMinutes,
      durationMinutes: service.durationMinutes,
      name: service.name,
      price: Math.round(service.priceCents / 100)
    },
    resolver: zodResolver(serviceFormSchema)
  });

  useEffect(() => {
    form.reset({
      bufferMinutes: service.bufferMinutes,
      durationMinutes: service.durationMinutes,
      name: service.name,
      price: Math.round(service.priceCents / 100)
    });
  }, [form, service]);

  return (
    <article className="management-card">
      <div className="management-card-header">
        <div className="management-card-copy">
          <strong>{capitalizeFirst(service.name)}</strong>
          <span>
            {service.durationMinutes} min · Buffer {service.bufferMinutes} min · {formatMoney(service.priceCents)}
          </span>
        </div>
        <div className="management-card-actions">
          <button
            className="button-muted"
            onClick={() => {
              if (editing) {
                form.reset({
                  bufferMinutes: service.bufferMinutes,
                  durationMinutes: service.durationMinutes,
                  name: service.name,
                  price: Math.round(service.priceCents / 100)
                });
              }
              setEditing((current) => !current);
            }}
            type="button"
          >
            {editing ? <X size={16} /> : <PencilLine size={16} />}
            {editing ? "Cancelar" : "Editar"}
          </button>
          <button
            className="button-danger"
            onClick={() => {
              if (window.confirm(`Se va a eliminar el servicio "${capitalizeFirst(service.name)}".`)) {
                onDelete(service.id);
              }
            }}
            type="button"
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>

      {editing ? (
        <form
          className="management-form"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              void (async () => {
                const normalizedName = values.name.trim().toLowerCase();
                const duplicated = existingNames.some(
                  (existingName) => existingName.trim().toLowerCase() === normalizedName && existingName !== service.name
                );

                if (duplicated) {
                  form.setError("name", {
                    message: "Ya existe otro servicio activo con ese nombre"
                  });
                  return;
                }

                const submitted = await onUpdate(service.id, values);
                if (submitted) {
                  setEditing(false);
                }
              })();
            })(event);
          }}
        >
          <label>
            Nombre
            <input {...form.register("name")} />
            {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
          </label>
          <div className="grid-3">
            <label>
              Duracion
              <input {...form.register("durationMinutes", { valueAsNumber: true })} min={5} type="number" />
              {form.formState.errors.durationMinutes ? (
                <span className="field-error">{form.formState.errors.durationMinutes.message}</span>
              ) : null}
            </label>
            <label>
              Buffer
              <input {...form.register("bufferMinutes", { valueAsNumber: true })} min={0} type="number" />
              <span className="field-hint">Tiempo de margen para limpieza, preparacion o cambio de cliente.</span>
              {form.formState.errors.bufferMinutes ? (
                <span className="field-error">{form.formState.errors.bufferMinutes.message}</span>
              ) : null}
            </label>
            <label>
              Precio
              <input {...form.register("price", { valueAsNumber: true })} min={0} type="number" />
              {form.formState.errors.price ? <span className="field-error">{form.formState.errors.price.message}</span> : null}
            </label>
          </div>
          <div className="management-form-actions">
            <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
              <Save size={16} />
              {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function StaffManagementPanel({
  business,
  onDelete,
  onUpdate
}: {
  business: CurrentBusiness;
  onDelete: (staffMemberId: string) => void;
  onUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
}) {
  const staffMembers = business.staffMembers.filter((staffMember) => staffMember.active);

  return (
    <section className="panel stack inventory-panel management-panel">
      <header className="inventory-panel-header">
        <h3 className="inline">
          <Users size={18} />
          Profesionales cargados
        </h3>
        <span className="badge badge-soft">{staffMembers.length}</span>
      </header>
      <p className="management-copy">Mantiene actualizados los datos de quienes atienden y aparecen en la agenda publica.</p>
      {staffMembers.length === 0 ? (
        <EmptyState compact title="Sin profesionales" description="Todavia no cargaste profesionales activos." />
      ) : (
        <div className="management-list">
          {staffMembers.map((staffMember) => (
            <ManagedStaffItem
              existingEmails={staffMembers.map((item) => item.email)}
              key={staffMember.id}
              onDelete={onDelete}
              onUpdate={onUpdate}
              staffMember={staffMember}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManagedStaffItem({
  existingEmails,
  onDelete,
  onUpdate,
  staffMember
}: {
  existingEmails: Array<string | null>;
  onDelete: (staffMemberId: string) => void;
  onUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
  staffMember: CurrentBusiness["staffMembers"][number];
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<StaffFormValues>({
    defaultValues: {
      email: staffMember.email ?? "",
      name: staffMember.name
    },
    resolver: zodResolver(staffFormSchema)
  });

  useEffect(() => {
    form.reset({
      email: staffMember.email ?? "",
      name: staffMember.name
    });
  }, [form, staffMember]);

  return (
    <article className="management-card">
      <div className="management-card-header">
        <div className="management-card-copy">
          <strong>{capitalizeFirst(staffMember.name)}</strong>
          <span>{staffMember.email || "Sin email configurado"}</span>
        </div>
        <div className="management-card-actions">
          <button
            className="button-muted"
            onClick={() => {
              if (editing) {
                form.reset({
                  email: staffMember.email ?? "",
                  name: staffMember.name
                });
              }
              setEditing((current) => !current);
            }}
            type="button"
          >
            {editing ? <X size={16} /> : <PencilLine size={16} />}
            {editing ? "Cancelar" : "Editar"}
          </button>
          <button
            className="button-danger"
            onClick={() => {
              if (window.confirm(`Se va a eliminar el profesional "${capitalizeFirst(staffMember.name)}".`)) {
                onDelete(staffMember.id);
              }
            }}
            type="button"
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>

      {editing ? (
        <form
          className="management-form"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              void (async () => {
                const normalizedEmail = values.email?.trim().toLowerCase() ?? "";
                const duplicated = existingEmails.some((email) => {
                  const currentEmail = email?.trim().toLowerCase() ?? "";
                  const selfEmail = staffMember.email?.trim().toLowerCase() ?? "";
                  return normalizedEmail !== "" && currentEmail === normalizedEmail && currentEmail !== selfEmail;
                });

                if (duplicated) {
                  form.setError("email", {
                    message: "Ya existe otro profesional con ese email"
                  });
                  return;
                }

                const submitted = await onUpdate(staffMember.id, values);
                if (submitted) {
                  setEditing(false);
                }
              })();
            })(event);
          }}
        >
          <div className="grid-2">
            <label>
              Nombre
              <input {...form.register("name")} />
              {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
            </label>
            <label>
              Email
              <input {...form.register("email")} type="email" />
              {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
            </label>
          </div>
          <div className="management-form-actions">
            <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
              <Save size={16} />
              {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function AvailabilityPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: AvailabilityRuleFormValues) => SubmitResult;
}) {
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);
  const defaultStaffMemberId = activeStaffMembers[0]?.id ?? "";
  const form = useForm<AvailabilityRuleFormValues>({
    defaultValues: {
      endTime: "18:00",
      staffMemberId: defaultStaffMemberId,
      startTime: "09:00",
      weekday: 1
    },
    resolver: zodResolver(availabilityRuleFormSchema)
  });
  const selectedStaffMemberId = form.watch("staffMemberId");
  const occupiedWeekdays = business.availabilityRules
    .filter((rule) => rule.active && rule.staffMemberId === selectedStaffMemberId)
    .map((rule) => rule.weekday);
  const availableWeekdays = weekdayOptions.filter((option) => !occupiedWeekdays.includes(option.value));

  useEffect(() => {
    if (!selectedStaffMemberId) {
      return;
    }

    const currentWeekday = form.getValues("weekday");
    if (availableWeekdays.some((option) => option.value === currentWeekday)) {
      return;
    }

    form.setValue("weekday", availableWeekdays[0]?.value ?? 1, {
      shouldDirty: false,
      shouldValidate: false
    });
  }, [availableWeekdays, form, selectedStaffMemberId]);

  if (activeStaffMembers.length === 0) {
    return (
      <section className="panel stack">
        <div className="form-header">
          <h3>Nueva disponibilidad</h3>
          <p>Necesitas al menos un profesional activo antes de abrir dias y horarios.</p>
        </div>
        <EmptyState compact title="Sin profesionales activos" description="Crea un profesional en configuracion y despues vuelve a esta vista." />
      </section>
    );
  }

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            if (occupiedWeekdays.includes(values.weekday)) {
              form.setError("weekday", {
                message: "Ese profesional ya tiene una regla activa para ese dia"
              });
              return;
            }

            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                endTime: values.endTime,
                staffMemberId: values.staffMemberId,
                startTime: values.startTime,
                weekday: availableWeekdays[0]?.value ?? values.weekday
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nueva disponibilidad</h3>
        <p>Una regla activa por dia para cada profesional. Eso evita superposiciones semanales confusas.</p>
      </div>
      <label>
        Profesional
        <select {...form.register("staffMemberId")}>
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
          <select {...form.register("weekday", { valueAsNumber: true })}>
            {weekdayOptions.map((option) => (
              <option disabled={occupiedWeekdays.includes(option.value)} key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.formState.errors.weekday ? <span className="field-error">{form.formState.errors.weekday.message}</span> : null}
        </label>
        <label>
          Desde
          <input {...form.register("startTime")} type="time" />
          {form.formState.errors.startTime ? <span className="field-error">{form.formState.errors.startTime.message}</span> : null}
        </label>
        <label>
          Hasta
          <input {...form.register("endTime")} type="time" />
          {form.formState.errors.endTime ? <span className="field-error">{form.formState.errors.endTime.message}</span> : null}
        </label>
      </div>
      {availableWeekdays.length === 0 ? (
        <Alert>Ese profesional ya tiene los siete dias semanales ocupados. Usa excepciones si solo necesitas ajustar una fecha puntual.</Alert>
      ) : null}
      <button className="button-primary" disabled={form.formState.isSubmitting || availableWeekdays.length === 0} type="submit">
        <CalendarClock size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar disponibilidad"}
      </button>
    </form>
  );
}

function AvailabilityExceptionPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: AvailabilityExceptionFormValues) => SubmitResult;
}) {
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);
  const form = useForm<AvailabilityExceptionFormValues>({
    defaultValues: {
      date: createLocalDateString(),
      endTime: "10:00",
      reason: "",
      staffMemberId: "",
      startTime: "09:00",
      type: "BLOCKED"
    },
    resolver: zodResolver(availabilityExceptionFormSchema)
  });

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                ...values,
                reason: ""
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nueva excepcion</h3>
        <p>Usa bloqueos para feriados o ausencias, y aperturas extra para huecos excepcionales.</p>
      </div>
      <label>
        Tipo
        <select {...form.register("type")}>
          <option value="BLOCKED">Bloqueo</option>
          <option value="EXTRA_OPENING">Apertura extra</option>
        </select>
      </label>
      <label>
        Profesional
        <select {...form.register("staffMemberId")}>
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
          <input {...form.register("date")} type="date" />
          {form.formState.errors.date ? <span className="field-error">{form.formState.errors.date.message}</span> : null}
        </label>
        <label>
          Desde
          <input {...form.register("startTime")} type="time" />
          {form.formState.errors.startTime ? <span className="field-error">{form.formState.errors.startTime.message}</span> : null}
        </label>
        <label>
          Hasta
          <input {...form.register("endTime")} type="time" />
          {form.formState.errors.endTime ? <span className="field-error">{form.formState.errors.endTime.message}</span> : null}
        </label>
      </div>
      <label>
        Motivo
        <input {...form.register("reason")} placeholder="Feriado, capacitacion, apertura especial" />
      </label>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Clock size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar excepcion"}
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
            {formatSlotTime(slot.startsAt)}
          </div>
        ))}
      </div>
      {slots.length === 0 ? <div className="message">No hay horarios visibles para ese dia.</div> : null}
    </section>
  );
}

