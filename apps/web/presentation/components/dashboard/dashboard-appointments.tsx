"use client";

import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Clock, Download, Repeat2, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Appointment, AvailabilitySlot, BusinessMemberRole, CurrentBusiness, DashboardMetrics, RecurringAppointmentSeries } from "../../../lib/api";
import { formatDateTime, formatMoney, formatSlotTime } from "../../../lib/api";
import {
  appointmentDisplayStatus,
  appointmentTimingHint,
  capitalizeFirst,
  isActionableAppointment,
  isOperationalAppointment,
  isUpcomingAppointment
} from "./dashboard-helpers";
import { EmptyState, InventoryPanel, Metric } from "./dashboard-shared";
import styles from "./dashboard-appointments.module.scss";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function AppointmentsView({
  appointments,
  business,
  currentUserRole,
  metrics,
  onFetchRescheduleSlots,
  onPaymentStatus,
  onReschedule,
  onStatus,
  recurringSeries
}: {
  appointments: Appointment[];
  business: CurrentBusiness | null;
  currentUserRole: BusinessMemberRole | null;
  metrics: DashboardMetrics | null;
  onFetchRescheduleSlots: (appointmentId: string, date: string) => Promise<AvailabilitySlot[]>;
  onPaymentStatus: (paymentId: string, action: "confirm" | "reject" | "void") => void;
  onReschedule: (appointmentId: string, startsAt: string, staffMemberId?: string) => void;
  onStatus: (appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") => void;
  recurringSeries: RecurringAppointmentSeries[];
}) {
  const now = useLiveNow();
  const activeAppointments = appointments.filter((appointment) => isOperationalAppointment(appointment, now)).length;
  const noShowAppointments = appointments.filter((appointment) => appointment.status === "no_show").length;
  const cancelledAppointments = appointments.filter((appointment) => appointment.status.startsWith("cancelled")).length;
  const estimatedPipelineCents = appointments
    .filter((appointment) => isOperationalAppointment(appointment, now))
    .reduce((total, appointment) => total + appointment.service.priceCents, 0);

  return (
    <section className={`stack ${styles.appointmentsView}`}>
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
      <AppointmentsOperationsPanel
        appointments={appointments}
        business={business}
        onFetchRescheduleSlots={onFetchRescheduleSlots}
        onPaymentStatus={onPaymentStatus}
        onReschedule={onReschedule}
        onStatus={onStatus}
      />
      <AppointmentHistoryPanel appointments={appointments} />
      {currentUserRole !== "PROFESSIONAL" ? (
        <RecurringCTABanner activeSeries={recurringSeries.filter((s) => s.status === "ACTIVE" || s.status === "PAUSED").length} />
      ) : null}
    </section>
  );
}

function AppointmentsOperationsPanel({
  appointments,
  business,
  onFetchRescheduleSlots,
  onPaymentStatus,
  onReschedule,
  onStatus
}: {
  appointments: Appointment[];
  business: CurrentBusiness | null;
  onFetchRescheduleSlots: (appointmentId: string, date: string) => Promise<AvailabilitySlot[]>;
  onPaymentStatus: (paymentId: string, action: "confirm" | "reject" | "void") => void;
  onReschedule: (appointmentId: string, startsAt: string, staffMemberId?: string) => void;
  onStatus: (appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") => void;
}) {
  const now = useLiveNow();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleSlotKey, setRescheduleSlotKey] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<"active" | Appointment["status"]>("active");
  const [query, setQuery] = useState("");
  const reschedulingAppointment = appointments.find((appointment) => appointment.id === reschedulingId);

  useEffect(() => {
    if (!reschedulingAppointment || !rescheduleDate) {
      setRescheduleSlots([]);
      return;
    }

    let ignore = false;
    setRescheduleLoading(true);
    setRescheduleError(null);
    setRescheduleSlotKey("");

    onFetchRescheduleSlots(reschedulingAppointment.id, rescheduleDate)
      .then((slots) => {
        if (!ignore) {
          setRescheduleSlots(normalizeAvailabilitySlots(slots).filter((slot) => new Date(slot.startsAt).getTime() > Date.now()));
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar horarios disponibles";
          setRescheduleError(message);
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
  }, [rescheduleDate, reschedulingAppointment?.id]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, query, statusFilter]);

  const filteredAppointments = appointments
    .filter((appointment) => {
      if (statusFilter === "active") {
        return isOperationalAppointment(appointment, now);
      }

      if (appointment.status !== statusFilter) {
        return false;
      }

      return !isActionableAppointment(appointment) || isOperationalAppointment(appointment, now);
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
  const totalPages = pageCount(filteredAppointments.length, pageSize);
  const visibleAppointments = paginate(filteredAppointments, page, pageSize);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  return (
    <section className={`panel stack appointments-panel ${styles.operationsPanel}`}>
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
        <label>
          Por pagina
          <select onChange={(event) => setPageSize(Number(event.target.value))} value={pageSize}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} turnos
              </option>
            ))}
          </select>
        </label>
      </div>
      {appointments.length === 0 ? (
        <EmptyState compact title="Todavia no hay turnos" description="Cuando un cliente reserve, vas a poder operarlo desde esta tabla." />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState compact title="Sin agenda operativa" description="No hay turnos vigentes que coincidan con el filtro actual." />
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
                <th>Seña</th>
                <th>Valor</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.map((appointment) => {
                const actionable = isActionableAppointment(appointment);
                const displayStatus = appointmentDisplayStatus(appointment, now);
                const timingHint = appointmentTimingHint(appointment, now);
                const upcoming = isUpcomingAppointment(appointment, now);

                return (
                  <tr className={displayStatus.overdue ? styles.overdueRow : undefined} key={appointment.id}>
                    <td>
                      <div className="table-primary">
                        <strong>
                          {capitalizeFirst(appointment.customer.name)}
                          {appointment.recurringSeriesId ? <span className="badge badge-soft" style={{ marginLeft: "4px", fontSize: "0.7em" }}>↺</span> : null}
                        </strong>
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
                        {timingHint ? <span className={upcoming ? styles.upcomingHint : styles.liveHint}>{timingHint}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className={styles.statusCell}>
                        <span className={displayStatus.className}>{displayStatus.label}</span>
                        {upcoming ? <span className={styles.upcomingMeta}>Proximo</span> : null}
                        {!upcoming && actionable ? <span className={styles.liveMeta}>En curso</span> : null}
                      </div>
                    </td>
                    <td>
                      <PaymentStatusCell appointment={appointment} onPaymentStatus={onPaymentStatus} />
                    </td>
                    <td>{formatMoney(appointment.service.priceCents)}</td>
                    <td>
                      <div className="appointment-actions">
                        <button
                          className="button-secondary"
                          disabled={!actionable}
                          onClick={() => {
                            if (reschedulingId === appointment.id) {
                              setReschedulingId(null);
                              return;
                            }

                            setReschedulingId(appointment.id);
                            setRescheduleDate(toDateInputValue(appointment.startsAt));
                          }}
                          type="button"
                        >
                          Reprogramar
                        </button>
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
                      {reschedulingId === appointment.id ? (
                        <>
                          <button
                            aria-label="Cerrar reprogramacion"
                            className={styles.rescheduleBackdrop}
                            onClick={() => setReschedulingId(null)}
                            type="button"
                          />
                          <form
                          className={styles.rescheduleForm}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const selectedSlot = rescheduleSlots.find((slot) => buildSlotKey(slot) === rescheduleSlotKey);

                            if (!selectedSlot) {
                              setRescheduleError("Elegi un horario disponible antes de guardar.");
                              return;
                            }
                            onReschedule(appointment.id, selectedSlot.startsAt, selectedSlot.staffMemberId);
                            setReschedulingId(null);
                          }}
                        >
                          <div className={styles.rescheduleSummary}>
                            <span>Turno actual</span>
                            <strong>{appointment.service.name}</strong>
                            <p>{formatDateTime(appointment.startsAt)} · {capitalizeFirst(appointment.staffMember.name)}</p>
                          </div>
                          <label>
                            Dia
                            <input
                              min={toDateInputValue(new Date().toISOString())}
                              onChange={(event) => setRescheduleDate(event.target.value)}
                              required
                              type="date"
                              value={rescheduleDate}
                            />
                          </label>
                          <div className={styles.rescheduleSlots} role="group" aria-label="Horarios disponibles para reprogramar">
                            {rescheduleLoading ? <span className={styles.rescheduleState}>Buscando horarios...</span> : null}
                            {rescheduleError ? <span className={styles.rescheduleError}>{rescheduleError}</span> : null}
                            {!rescheduleLoading && !rescheduleError && rescheduleSlots.length === 0 ? (
                              <span className={styles.rescheduleState}>No hay horarios disponibles para ese dia.</span>
                            ) : null}
                            {rescheduleSlots.map((slot) => {
                              const slotKey = buildSlotKey(slot);

                              return (
                                <button
                                  aria-pressed={rescheduleSlotKey === slotKey}
                                  className={rescheduleSlotKey === slotKey ? styles.selectedSlot : undefined}
                                  key={slotKey}
                                  onClick={() => setRescheduleSlotKey(slotKey)}
                                  type="button"
                                >
                                  {formatSlotTime(slot.startsAt, business?.timezone)}
                                </button>
                              );
                            })}
                          </div>
                          <div className={styles.rescheduleActions}>
                            <button className="button-primary" disabled={!rescheduleSlotKey} type="submit">Guardar</button>
                            <button className="button-muted" onClick={() => setReschedulingId(null)} type="button">Cerrar</button>
                          </div>
                          </form>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls
            label="turnos operativos"
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            page={page}
            pageSize={pageSize}
            totalItems={filteredAppointments.length}
          />
        </div>
      )}
    </section>
  );
}

function PaymentStatusCell({
  appointment,
  onPaymentStatus
}: {
  appointment: Appointment;
  onPaymentStatus: (paymentId: string, action: "confirm" | "reject" | "void") => void;
}) {
  const latestPayment = appointment.payments?.[0] ?? null;
  const summary = appointment.paymentSummary;

  if (!latestPayment || !summary || summary.status === "not_submitted") {
    return <span className="badge badge-soft">Sin seña</span>;
  }

  return (
    <div className="table-primary">
      <span className={paymentBadgeClass(latestPayment.status)}>{paymentStatusLabel(latestPayment.status)}</span>
      <strong>{formatMoney(latestPayment.amountCents)}</strong>
      <span>Saldo: {formatMoney(summary.remainingBalanceCents)}</span>
      {latestPayment.reference ? <span>Ref: {latestPayment.reference}</span> : null}
      {latestPayment.status === "submitted" ? (
        <div className="appointment-actions">
          <button className="button-secondary" onClick={() => onPaymentStatus(latestPayment.id, "confirm")} type="button">
            Confirmar
          </button>
          <button className="button-danger" onClick={() => onPaymentStatus(latestPayment.id, "reject")} type="button">
            Rechazar
          </button>
        </div>
      ) : latestPayment.status === "confirmed" ? (
        <button className="button-muted" onClick={() => onPaymentStatus(latestPayment.id, "void")} type="button">
          Anular
        </button>
      ) : null}
    </div>
  );
}

function AppointmentHistoryPanel({ appointments }: { appointments: Appointment[] }) {
  const now = useLiveNow();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"closed" | Appointment["status"] | "all">("closed");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const historyAppointments = appointments
    .filter((appointment) => {
      if (statusFilter === "all") {
        return true;
      }

      if (statusFilter === "closed") {
        return !isOperationalAppointment(appointment, now);
      }

      if (appointment.status !== statusFilter) {
        return false;
      }

      if (isActionableAppointment(appointment)) {
        return !isOperationalAppointment(appointment, now);
      }

      return true;
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
  const totalPages = pageCount(historyAppointments.length, pageSize);
  const visibleHistoryAppointments = paginate(historyAppointments, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [fromDate, pageSize, query, sortOrder, statusFilter, toDate]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

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
      estado: appointmentDisplayStatus(appointment, now).label,
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
    <section className={`panel stack appointments-history-panel ${styles.historyPanel}`}>
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
        <label>
          Por pagina
          <select onChange={(event) => setPageSize(Number(event.target.value))} value={pageSize}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} turnos
              </option>
            ))}
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
              {visibleHistoryAppointments.map((appointment) => {
                const displayStatus = appointmentDisplayStatus(appointment, now);
                const timingHint = appointmentTimingHint(appointment, now);

                return (
                  <tr className={displayStatus.overdue ? styles.overdueRow : undefined} key={appointment.id}>
                    <td>
                      <div className="table-primary">
                        <strong>
                          {capitalizeFirst(appointment.customer.name)}
                          {appointment.recurringSeriesId ? <span className="badge badge-soft" style={{ marginLeft: "4px", fontSize: "0.7em" }}>↺</span> : null}
                        </strong>
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
                    <td>
                      <div className="table-primary">
                        <strong>{formatDateTime(appointment.endsAt)}</strong>
                        {displayStatus.overdue && timingHint ? <span className={styles.overdueHint}>{timingHint}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className={styles.statusCell}>
                        <span className={displayStatus.className}>{displayStatus.label}</span>
                        {displayStatus.overdue ? <span className={styles.overdueMeta}>No hubo asistencia confirmada</span> : null}
                      </div>
                    </td>
                    <td>{formatMoney(appointment.service.priceCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls
            label="turnos historicos"
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            page={page}
            pageSize={pageSize}
            totalItems={historyAppointments.length}
          />
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

function PaginationControls({
  label,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  totalItems
}: {
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const totalPages = pageCount(totalItems, pageSize);
  const safePage = Math.min(page, totalPages);
  const firstItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, totalItems);

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={styles.paginationBar}>
      <div>
        <strong>
          {firstItem}-{lastItem}
        </strong>{" "}
        de {totalItems} {label}
      </div>
      <label>
        Ver
        <select onChange={(event) => onPageSizeChange(Number(event.target.value))} value={pageSize}>
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.paginationActions}>
        <button
          className="button-muted"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          type="button"
        >
          Anterior
        </button>
        <span>
          Pagina {safePage} de {totalPages}
        </span>
        <button
          className="button-muted"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          type="button"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function pageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = Math.min(page, pageCount(items.length, pageSize));
  const start = (safePage - 1) * pageSize;

  return items.slice(start, start + pageSize);
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

  return [...uniqueSlots.values()].sort((left, right) => {
    const startsAtComparison = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();

    if (startsAtComparison !== 0) {
      return startsAtComparison;
    }

    return left.staffMemberId.localeCompare(right.staffMemberId);
  });
}

function escapeCsvValue(value: string): string {
  const normalizedValue = value.replaceAll("\"", "\"\"");
  return `"${normalizedValue}"`;
}

function paymentStatusLabel(status: NonNullable<Appointment["payments"]>[number]["status"]): string {
  return {
    confirmed: "Seña confirmada",
    rejected: "Seña rechazada",
    submitted: "Seña informada",
    voided: "Seña anulada"
  }[status];
}

function paymentBadgeClass(status: NonNullable<Appointment["payments"]>[number]["status"]): string {
  if (status === "confirmed") {
    return "badge";
  }

  if (status === "submitted") {
    return "badge badge-warning";
  }

  return "badge badge-danger";
}

function useLiveNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return now;
}

function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toDateInputValue(value: string): string {
  return toDatetimeLocalValue(value).slice(0, 10);
}


function RecurringCTABanner({ activeSeries }: { activeSeries: number }) {
  return (
    <section
      className="panel"
      style={{
        alignItems: "center",
        display: "flex",
        gap: "16px",
        justifyContent: "space-between"
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "12px" }}>
        <Repeat2 color="#635bff" size={22} style={{ flexShrink: 0 }} />
        <div>
          <strong style={{ fontSize: "0.95rem" }}>Turnos recurrentes</strong>
          <p style={{ color: "#6f7382", fontSize: "0.83rem", margin: "2px 0 0" }}>
            {activeSeries > 0
              ? `${activeSeries} serie${activeSeries !== 1 ? "s" : ""} activa${activeSeries !== 1 ? "s" : ""} · los turnos quedan bloqueados en la agenda automáticamente`
              : "Automatizá turnos para clientes regulares · bloqueo de agenda y Google Calendar incluido"}
          </p>
        </div>
      </div>
      <Link
        className="button-link button-ghost"
        href="/dashboard/recurrente"
        style={{ flexShrink: 0 }}
      >
        Gestionar series
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}
