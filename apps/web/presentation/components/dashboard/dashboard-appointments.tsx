"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Clock, Download, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Appointment, CurrentBusiness, DashboardMetrics } from "../../../lib/api";
import { formatDateTime, formatMoney } from "../../../lib/api";
import { appointmentStatusLabel, capitalizeFirst, isActionableAppointment, statusClass } from "./dashboard-helpers";
import { EmptyState, InventoryPanel, Metric } from "./dashboard-shared";

export function AppointmentsView({
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
  const activeAppointments = appointments.filter(isActionableAppointment).length;
  const noShowAppointments = appointments.filter((appointment) => appointment.status === "no_show").length;
  const cancelledAppointments = appointments.filter((appointment) => appointment.status.startsWith("cancelled")).length;
  const estimatedPipelineCents = appointments
    .filter(isActionableAppointment)
    .reduce((total, appointment) => total + appointment.service.priceCents, 0);

  return (
    <section className="stack">
      <section className="appointments-command panel">
        <div className="appointments-command-copy">
          <span className="page-kicker">Operacion diaria</span>
          <h2>Controla la agenda activa, cierres, cancelaciones y ausencias.</h2>
          <p>Esta vista actualiza estados de turno y alimenta metricas, riesgo de cliente, lista de espera y perdida estimada por no-show.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<Clock size={18} />} label="Turnos activos" value={activeAppointments} />
          <Metric icon={<TrendingUp size={18} />} label="Pipeline activo" value={formatMoney(estimatedPipelineCents)} />
          <Metric icon={<ShieldAlert size={18} />} label="No-shows" value={noShowAppointments} tone="danger" />
          <Metric icon={<AlertTriangle size={18} />} label="Cancelados" value={cancelledAppointments} tone="warning" />
        </div>
      </section>
      <section className="grid-3">
        <Metric icon={<CalendarDays size={18} />} label="Turnos del mes" value={metrics?.totalAppointments ?? appointments.length} />
        <Metric icon={<CheckCircle2 size={18} />} label="Completados" value={metrics?.completedAppointments ?? 0} />
        <Metric icon={<TrendingDown size={18} />} label="Perdida estimada" value={formatMoney(metrics?.lostRevenueCents ?? 0)} tone="warning" />
      </section>
      <InventoryPanel business={business} />
      <AppointmentsOperationsPanel appointments={appointments} onStatus={onStatus} />
      <AppointmentHistoryPanel appointments={appointments} />
    </section>
  );
}

function AppointmentsOperationsPanel({
  appointments,
  onStatus
}: {
  appointments: Appointment[];
  onStatus: (appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"active" | Appointment["status"]>("active");
  const [query, setQuery] = useState("");
  const filteredAppointments = appointments
    .filter((appointment) => {
      if (statusFilter === "active") {
        return isActionableAppointment(appointment);
      }
      return appointment.status === statusFilter;
    })
    .filter((appointment) => {
      const normalizedQuery = query.trim().toLowerCase();

      if (!normalizedQuery) {
        return true;
      }

      return [
        appointment.customer.name,
        appointment.customer.email,
        appointment.customer.phone ?? "",
        appointment.service.name,
        appointment.staffMember.name,
        appointment.status
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  return (
    <section className="panel stack appointments-panel">
      <header className="panel-header">
        <div>
          <h2 className="inline">
            <ClipboardList size={20} />
            Turnos
          </h2>
          <p>Filtra, revisa cliente/servicio/profesional y cambia estados operativos.</p>
        </div>
        <span className="badge badge-soft">{filteredAppointments.length} visibles</span>
      </header>
      <div className="appointments-toolbar">
        <label>
          Buscar
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cliente, email, servicio o profesional"
            value={query}
          />
        </label>
        <label>
          Estado
          <select
            onChange={(event) => setStatusFilter(event.target.value as "active" | Appointment["status"])}
            value={statusFilter}
          >
            <option value="active">Activos</option>
            <option value="pending">Pendientes</option>
            <option value="confirmed">Confirmados</option>
            <option value="completed">Completados</option>
            <option value="no_show">No-shows</option>
            <option value="cancelled_by_customer">Cancelados por cliente</option>
            <option value="cancelled_by_business">Cancelados por negocio</option>
          </select>
        </label>
      </div>
      {appointments.length === 0 ? (
        <EmptyState compact title="Todavia no hay turnos" description="Cuando un cliente reserve, vas a poder operarlo desde esta tabla." />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState compact title="Sin agenda operativa" description="No hay turnos activos que coincidan con el filtro actual." />
      ) : (
        <div className="table-shell">
          <table className="data-table appointments-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Profesional</th>
                <th>Horario</th>
                <th>Estado</th>
                <th>Valor</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appointment) => {
                const actionable = isActionableAppointment(appointment);

                return (
                  <tr key={appointment.id}>
                    <td>
                      <div className="table-primary">
                        <strong>{capitalizeFirst(appointment.customer.name)}</strong>
                        <span>{appointment.customer.email}</span>
                        {appointment.customer.phone ? <span>{appointment.customer.phone}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        <strong>{appointment.service.name}</strong>
                        <span>{appointment.service.durationMinutes} min</span>
                      </div>
                    </td>
                    <td>{capitalizeFirst(appointment.staffMember.name)}</td>
                    <td>
                      <div className="table-primary">
                        <strong>{formatDateTime(appointment.startsAt)}</strong>
                        <span>Fin: {formatDateTime(appointment.endsAt)}</span>
                      </div>
                    </td>
                    <td><span className={statusClass(appointment.status)}>{appointmentStatusLabel(appointment.status)}</span></td>
                    <td>{formatMoney(appointment.service.priceCents)}</td>
                    <td>
                      <div className="appointment-actions">
                        <button
                          className="button-secondary"
                          disabled={!actionable}
                          onClick={() => onStatus(appointment.id, "completed")}
                          type="button"
                        >
                          Completar
                        </button>
                        <button
                          className="button-danger"
                          disabled={!actionable}
                          onClick={() => onStatus(appointment.id, "no_show")}
                          type="button"
                        >
                          No-show
                        </button>
                        <button
                          className="button-muted"
                          disabled={!actionable}
                          onClick={() => onStatus(appointment.id, "cancelled_by_business")}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AppointmentHistoryPanel({ appointments }: { appointments: Appointment[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"closed" | Appointment["status"] | "all">("closed");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const historyAppointments = appointments
    .filter((appointment) => {
      if (statusFilter === "all") {
        return true;
      }

      if (statusFilter === "closed") {
        return !isActionableAppointment(appointment);
      }

      return appointment.status === statusFilter;
    })
    .filter((appointment) => matchesDateRange(appointment, fromDate, toDate))
    .filter((appointment) => {
      const normalizedQuery = query.trim().toLowerCase();

      if (!normalizedQuery) {
        return true;
      }

      return [
        appointment.customer.name,
        appointment.customer.email,
        appointment.customer.phone ?? "",
        appointment.service.name,
        appointment.staffMember.name,
        appointment.status
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => {
      const leftTime = new Date(left.startsAt).getTime();
      const rightTime = new Date(right.startsAt).getTime();

      return sortOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
    });

  const completedCount = appointments.filter((appointment) => appointment.status === "completed").length;
  const noShowCount = appointments.filter((appointment) => appointment.status === "no_show").length;
  const cancelledCount = appointments.filter((appointment) => appointment.status.startsWith("cancelled")).length;

  function handleExportCsv() {
    if (historyAppointments.length === 0) {
      toast.error("No hay turnos para exportar con los filtros actuales");
      return;
    }

    const rows = historyAppointments.map((appointment) => ({
      cliente: capitalizeFirst(appointment.customer.name),
      email: appointment.customer.email,
      telefono: appointment.customer.phone ?? "",
      servicio: appointment.service.name,
      profesional: capitalizeFirst(appointment.staffMember.name),
      inicio: formatDateTime(appointment.startsAt),
      fin: formatDateTime(appointment.endsAt),
      estado: appointmentStatusLabel(appointment.status),
      valor: formatMoney(appointment.service.priceCents)
    }));

    const header: Array<keyof (typeof rows)[number]> = ["cliente", "email", "telefono", "servicio", "profesional", "inicio", "fin", "estado", "valor"];
    const csv = [header.join(","), ...rows.map((row) => header.map((key) => escapeCsvValue(row[key])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `turnoflow-historial-turnos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  return (
    <section className="panel stack appointments-history-panel">
      <header className="panel-header">
        <div>
          <h2 className="inline">
            <ClipboardList size={20} />
            Historial de turnos
          </h2>
          <p>Consulta el historial completo con filtros por estado, busqueda textual y orden cronologico.</p>
        </div>
        <div className="header-actions">
          <span className="badge badge-soft">{historyAppointments.length} resultados</span>
          <button className="button-secondary" onClick={handleExportCsv} type="button">
            <Download size={16} />
            Exportar CSV
          </button>
        </div>
      </header>

      <section className="grid-3">
        <Metric label="Completados" value={completedCount} />
        <Metric label="No-shows" tone="danger" value={noShowCount} />
        <Metric label="Cancelados" tone="warning" value={cancelledCount} />
      </section>

      <div className="appointments-toolbar">
        <label>
          Buscar
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cliente, email, telefono, servicio o profesional"
            value={query}
          />
        </label>
        <label>
          Estado
          <select
            onChange={(event) => setStatusFilter(event.target.value as "closed" | Appointment["status"] | "all")}
            value={statusFilter}
          >
            <option value="closed">Cerrados</option>
            <option value="all">Todos</option>
            <option value="completed">Completados</option>
            <option value="no_show">No-shows</option>
            <option value="cancelled_by_customer">Cancelados por cliente</option>
            <option value="cancelled_by_business">Cancelados por negocio</option>
            <option value="confirmed">Confirmados</option>
            <option value="pending">Pendientes</option>
          </select>
        </label>
        <label>
          Desde
          <input onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} />
        </label>
        <label>
          Hasta
          <input onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} />
        </label>
        <label>
          Orden
          <select onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")} value={sortOrder}>
            <option value="newest">Mas recientes primero</option>
            <option value="oldest">Mas antiguos primero</option>
          </select>
        </label>
      </div>

      {appointments.length === 0 ? (
        <EmptyState compact title="Sin historial" description="Todavia no se registraron turnos para este negocio." />
      ) : historyAppointments.length === 0 ? (
        <EmptyState compact title="Sin coincidencias" description="No hay turnos en el historial que coincidan con los filtros actuales." />
      ) : (
        <div className="table-shell">
          <table className="data-table appointments-table appointments-history-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Profesional</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Estado</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {historyAppointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>
                    <div className="table-primary">
                      <strong>{capitalizeFirst(appointment.customer.name)}</strong>
                      <span>{appointment.customer.email}</span>
                      {appointment.customer.phone ? <span>{appointment.customer.phone}</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="table-primary">
                      <strong>{appointment.service.name}</strong>
                      <span>{appointment.service.durationMinutes} min</span>
                    </div>
                  </td>
                  <td>{capitalizeFirst(appointment.staffMember.name)}</td>
                  <td>{formatDateTime(appointment.startsAt)}</td>
                  <td>{formatDateTime(appointment.endsAt)}</td>
                  <td><span className={statusClass(appointment.status)}>{appointmentStatusLabel(appointment.status)}</span></td>
                  <td>{formatMoney(appointment.service.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function matchesDateRange(appointment: Appointment, fromDate: string, toDate: string): boolean {
  const appointmentDate = appointment.startsAt.slice(0, 10);

  if (fromDate && appointmentDate < fromDate) {
    return false;
  }

  if (toDate && appointmentDate > toDate) {
    return false;
  }

  return true;
}

function escapeCsvValue(value: string): string {
  const normalizedValue = value.replaceAll("\"", "\"\"");
  return `"${normalizedValue}"`;
}
