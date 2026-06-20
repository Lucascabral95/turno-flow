"use client";

import { BellRing, CalendarClock, CheckCircle2, Mail } from "lucide-react";
import type { FormEvent } from "react";

import type { Appointment, NotificationHistoryItem, ReminderSettings } from "../../../lib/api";
import { formatDateTime, formatPercent } from "../../../lib/api";
import {
  capitalizeFirst,
  formatReminderOffset,
  isActionableAppointment,
  notificationStatusClass,
  notificationStatusLabel
} from "./dashboard-helpers";
import { EmptyState, Metric, SummaryValue } from "./dashboard-shared";
import styles from "./dashboard-reminders.module.scss";

export function RemindersView({
  appointments,
  history,
  onSubmit,
  settings
}: {
  appointments: Appointment[];
  history: NotificationHistoryItem[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  settings: ReminderSettings | null;
}) {
  return (
    <section className={`stack ${styles.remindersView}`}>
      <ReminderCommandCenter appointments={appointments} history={history} settings={settings} />
      <section className="layout-grid">
        <aside className="stack">
          <ReminderSettingsPanel onSubmit={onSubmit} settings={settings} />
        </aside>
        <section className="stack">
          <ReminderSummaryPanel history={history} settings={settings} />
          <ReminderQueuePanel appointments={appointments} settings={settings} />
          <NotificationHistoryPanel history={history} />
        </section>
      </section>
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
    <form className={`panel stack reminder-settings-card ${styles.settingsPanel}`} onSubmit={onSubmit}>
      <header className="panel-header">
        <div>
          <h2 className="inline">
            <BellRing size={20} />
            Configuracion
          </h2>
          <p>Controla si el worker debe preparar avisos y cuanto antes debe hacerlo.</p>
        </div>
        <span className={settings?.enabled ? "badge" : "badge badge-warning"}>{settings?.enabled ? "Activo" : "Pausado"}</span>
      </header>
      <label>
        Recordatorios automaticos
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
        <span className="field-hint">Canal simulado para validar el flujo sin proveedor externo.</span>
      </label>
      <label>
        Template
        <input defaultValue={settings?.template ?? "appointment_reminder_24h"} name="template" />
      </label>
      <div className="reminder-flow">
        <div>
          <strong>1</strong>
          <span>Turno confirmado</span>
        </div>
        <div>
          <strong>2</strong>
          <span>ReminderScheduled</span>
        </div>
        <div>
          <strong>3</strong>
          <span>ReminderSent / Failed</span>
        </div>
      </div>
      <button className="button-primary" type="submit">
        <CheckCircle2 size={18} />
        Guardar recordatorios
      </button>
    </form>
  );
}

function ReminderCommandCenter({
  appointments,
  history,
  settings
}: {
  appointments: Appointment[];
  history: NotificationHistoryItem[];
  settings: ReminderSettings | null;
}) {
  const activeAppointments = appointments.filter(isActionableAppointment);
  const sentCount = history.filter((item) => item.status === "sent").length;
  const failedCount = history.filter((item) => item.status === "failed").length;
  const pendingCount = history.filter((item) => item.status === "pending").length;
  const deliveryRate = history.length > 0 ? sentCount / history.length : 0;

  return (
    <section className={`reminder-command panel ${styles.remindersView}`}>
      <div className="reminder-command-copy">
        <span className="page-kicker">Automatizacion</span>
        <h2>Recordatorios que bajan ausencias sin bloquear la agenda.</h2>
        <p>
          La configuracion se guarda por negocio. El worker toma los turnos activos, calcula el horario de aviso y registra cada entrega mock
          como pendiente, enviada o fallida.
        </p>
      </div>
      <div className="reminder-command-grid">
        <SummaryValue label="Turnos elegibles" value={String(activeAppointments.length)} />
        <SummaryValue label="Anticipacion" value={formatReminderOffset(settings?.offsetMinutes ?? 1440)} />
        <SummaryValue label="Entregabilidad" value={`${formatPercent(deliveryRate)}%`} />
        <SummaryValue label="Requieren atencion" value={String(failedCount + pendingCount)} />
      </div>
    </section>
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
    <section className={`metric-grid ${styles.summaryPanel}`}>
      <Metric label="Estado" value={settings?.enabled ? "Activo" : "Pausado"} />
      <Metric label="Enviados" value={sentCount} />
      <Metric label="Pendientes" value={pendingCount} tone="warning" />
      <Metric label="Fallidos" value={failedCount} tone="danger" />
    </section>
  );
}

function NotificationHistoryPanel({ history }: { history: NotificationHistoryItem[] }) {
  return (
    <section className={`panel stack ${styles.historyPanel}`}>
      <header className="panel-header">
        <div>
          <h2 className="inline">
            <Mail size={20} />
            Historial de notificaciones
          </h2>
          <p>Auditoria de entregas mock, intentos, errores y turno asociado.</p>
        </div>
        <span className="badge badge-soft">{history.length} registros</span>
      </header>
      {history.length === 0 ? (
        <EmptyState compact title="Sin entregas procesadas" description="Cuando el worker procese recordatorios, este historial va a mostrar cada intento." />
      ) : (
        <div className="table-shell">
          <table className="data-table notification-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Turno</th>
                <th>Estado</th>
                <th>Intentos</th>
                <th>Creado</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-primary">
                      <strong>{capitalizeFirst(item.appointment?.customer.name ?? item.email)}</strong>
                      <span>{item.email}</span>
                    </div>
                  </td>
                  <td>
                    {item.appointment ? (
                      <div className="table-primary">
                        <strong>{item.appointment.service.name}</strong>
                        <span>{formatDateTime(item.appointment.startsAt)}</span>
                      </div>
                    ) : (
                      <span className="muted-text">Sin turno asociado</span>
                    )}
                  </td>
                  <td><span className={notificationStatusClass(item.status)}>{notificationStatusLabel(item.status)}</span></td>
                  <td>{item.attempts}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <div className="table-primary">
                      <strong>{item.sentAt ? formatDateTime(item.sentAt) : "Pendiente"}</strong>
                      {item.lastError ? <span className="danger-text">{item.lastError}</span> : <span>{item.template}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReminderQueuePanel({
  appointments,
  settings
}: {
  appointments: Appointment[];
  settings: ReminderSettings | null;
}) {
  const offsetMinutes = settings?.offsetMinutes ?? 1440;
  const queue = appointments
    .filter(isActionableAppointment)
    .map((appointment) => ({
      appointment,
      reminderAt: new Date(new Date(appointment.startsAt).getTime() - offsetMinutes * 60_000)
    }))
    .sort((left, right) => left.reminderAt.getTime() - right.reminderAt.getTime())
    .slice(0, 6);

  return (
    <section className={`panel stack ${styles.queuePanel}`}>
      <header className="panel-header">
        <div>
          <h2 className="inline">
            <CalendarClock size={20} />
            Proximos recordatorios
          </h2>
          <p>Vista operativa calculada con la anticipacion configurada.</p>
        </div>
        <span className={settings?.enabled ? "badge" : "badge badge-warning"}>{settings?.enabled ? "Activos" : "Pausados"}</span>
      </header>
      {queue.length === 0 ? (
        <EmptyState compact title="Sin recordatorios pendientes" description="Cuando haya turnos activos, vas a ver aca la proxima cola de avisos." />
      ) : (
        <div className="reminder-timeline">
          {queue.map(({ appointment, reminderAt }) => (
            <article className="reminder-timeline-item" key={appointment.id}>
              <div className="timeline-dot" />
              <div>
                <strong>{capitalizeFirst(appointment.customer.name)}</strong>
                <span>{appointment.service.name} con {capitalizeFirst(appointment.staffMember.name)}</span>
              </div>
              <div className="timeline-date">
                <strong>{formatDateTime(reminderAt.toISOString())}</strong>
                <span>Turno: {formatDateTime(appointment.startsAt)}</span>
              </div>
              <span className={settings?.enabled ? "badge badge-soft" : "badge badge-warning"}>
                {settings?.enabled ? "Programable" : "Pausado"}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
