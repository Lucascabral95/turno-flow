"use client";

import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Clock, Copy, ExternalLink, ShieldAlert, TrendingDown, TrendingUp, Users, Wand2, Scissors } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import type { Appointment, CurrentBusiness, DashboardMetrics, StaffMetrics } from "../../../lib/api";
import { formatDateTime, formatMoney, formatPercent } from "../../../lib/api";
import { buildRecurringCustomerBars, buildTopServiceBars, buildWeeklyChartBars } from "../../../lib/dashboard-metrics";
import { capitalizeFirst, countCoveredWeekdays, statusClass } from "./dashboard-helpers";
import { Alert, EmptyState, InventoryPanel, Metric, RiskyCustomersTable } from "./dashboard-shared";
import styles from "./dashboard-overview.module.scss";

export function HomeView({
  appointments,
  business,
  metrics
}: {
  appointments: Appointment[];
  business: CurrentBusiness | null;
  metrics: DashboardMetrics | null;
}) {
  const upcomingAppointments = appointments
    .filter((appointment) => appointment.status === "pending" || appointment.status === "confirmed")
    .slice(0, 4);

  return (
    <section className={`stack ${styles.homeView}`}>
      {!business ? (
        <section className="feature-banner">
          <div>
            <span className="badge">Nuevo</span>
            <h2>Configura tu negocio para abrir la agenda publica</h2>
            <p>Crea servicios, staff y disponibilidad. Despues podras compartir tu pagina de reservas.</p>
          </div>
        </section>
      ) : null}
      <MetricsPanel metrics={metrics} />
      <section className="analytics-grid analytics-grid-bottom">
        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2>Proximos turnos</h2>
              <p>Acciones rapidas para el flujo operativo diario.</p>
            </div>
          </header>
          {upcomingAppointments.length === 0 ? (
            <EmptyState title="Sin turnos activos" description="Cuando entren reservas, van a aparecer aca para seguimiento rapido." />
          ) : (
            <div className="list">
              {upcomingAppointments.map((appointment) => (
                <article className="list-item list-item-compact" key={appointment.id}>
                  <header>
                    <strong>{appointment.customer.name}</strong>
                    <span className={statusClass(appointment.status)}>{appointment.status}</span>
                  </header>
                  <span>{appointment.service.name}</span>
                  <span>{formatDateTime(appointment.startsAt)}</span>
                </article>
              ))}
            </div>
          )}
        </section>
        <InventoryPanel business={business} />
      </section>
    </section>
  );
}

export function MetricsPanel({ metrics, staffMetrics = [] }: { metrics: DashboardMetrics | null; staffMetrics?: StaffMetrics[] }) {
  const weeklyBars = buildWeeklyChartBars(metrics);
  const serviceBars = buildTopServiceBars(metrics);
  const recurringBars = buildRecurringCustomerBars(metrics);

  return (
    <section className={`stack ${styles.metricsPanel}`}>
      <section className="metric-grid metric-grid-analytics">
        <Metric icon={<CalendarDays size={18} />} label="Turnos del mes" value={metrics?.totalAppointments ?? 0} />
        <Metric icon={<Clock size={18} />} label="Activos" value={metrics?.activeAppointments ?? 0} />
        <Metric icon={<CheckCircle2 size={18} />} label="Completados" value={metrics?.completedAppointments ?? 0} tone="success" />
        <Metric icon={<AlertTriangle size={18} />} label="Cancelados" value={metrics?.cancelledAppointments ?? 0} tone="warning" />
        <Metric icon={<ShieldAlert size={18} />} label="No-shows" value={metrics?.noShowAppointments ?? 0} tone="danger" />
        <Metric icon={<TrendingUp size={18} />} label="Ingreso estimado" value={formatMoney(metrics?.estimatedRevenueCents ?? 0)} tone="success" />
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
          {weeklyBars.length === 0 ? null : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th className="numeric-column">Turnos</th>
                    <th className="numeric-column">Completados</th>
                    <th className="numeric-column">Cancelados</th>
                    <th className="numeric-column">No-shows</th>
                    <th className="numeric-column">Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyBars.map((bar) => {
                    const day = metrics?.weeklyBreakdown.find((entry) => entry.date === bar.date);

                    return (
                      <tr key={bar.date}>
                        <td>{bar.label}</td>
                        <td className="numeric-column">{bar.totalAppointments}</td>
                        <td className="numeric-column">{bar.completedAppointments}</td>
                        <td className="numeric-column">{day?.cancelledAppointments ?? 0}</td>
                        <td className="numeric-column">{bar.noShowAppointments}</td>
                        <td className="numeric-column">{formatMoney(day?.estimatedRevenueCents ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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

      {staffMetrics.length > 0 ? (
        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2>Metricas por profesional</h2>
              <p>Resumen del mes actual por cada miembro del equipo.</p>
            </div>
            <span className="badge badge-soft">{staffMetrics.length} profesionales</span>
          </header>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profesional</th>
                  <th>Turnos</th>
                  <th>Completados</th>
                  <th>Cancelados</th>
                  <th>No-shows</th>
                  <th>Tasa no-show</th>
                  <th>Ingreso est.</th>
                  <th>Ocupacion</th>
                </tr>
              </thead>
              <tbody>
                {staffMetrics.map((staff) => (
                  <tr key={staff.staffMemberId}>
                    <td><strong>{staff.staffMemberName}</strong></td>
                    <td>{staff.totalAppointments}</td>
                    <td>{staff.completedAppointments}</td>
                    <td>{staff.cancelledAppointments}</td>
                    <td>{staff.noShowAppointments}</td>
                    <td>{formatPercent(staff.noShowRate)}%</td>
                    <td>{formatMoney(staff.estimatedRevenueCents)}</td>
                    <td>{Math.floor(staff.occupancyMinutes / 60)}h {staff.occupancyMinutes % 60}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function BookingAdminView({ business }: { business: CurrentBusiness | null }) {
  if (!business) {
    return (
      <EmptyState
        title="Primero configura el negocio"
        description="Cuando tengas nombre, servicios y disponibilidad, vas a poder compartir el link de reserva."
      />
    );
  }

  const publicUrl = `/${business.slug}`;
  const bookingUrl = `/${business.slug}/book`;
  const hasBookableSetup = business.services.length > 0 && business.staffMembers.length > 0 && business.availabilityRules.length > 0;

  async function handleCopyLink() {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link publico copiado");
  }

  return (
    <section className={`stack ${styles.bookingAdminView}`}>
      <section className="panel business-info-row">
        <div>
          <strong>{capitalizeFirst(business.name)}</strong>
          <span>{business.timezone} · {publicUrl}</span>
        </div>
        <div className="header-actions">
          <button className="button-ghost" onClick={() => void handleCopyLink()} type="button">
            <Copy size={16} />
            Copiar link
          </button>
          <Link className="button-link button-primary" href={publicUrl}>
            <ExternalLink size={16} />
            Compartir pagina
          </Link>
        </div>
      </section>

      <section className="feature-banner public-hero">
        <div>
          <span className="badge badge-soft">Reserva publica</span>
          <h2>Compartile al cliente un flujo claro para elegir servicio, dia y horario.</h2>
          <p>Estos accesos usan la pagina publica existente. No cambian la API ni el contrato de reserva.</p>
        </div>
        <div className="header-actions">
          <Link className="button-link button-ghost" href={publicUrl}>
            <ExternalLink size={17} />
            Ver pagina
          </Link>
          <Link className="button-link button-primary" href={bookingUrl}>
            <CalendarClock size={17} />
            Abrir reserva
          </Link>
        </div>
      </section>

      <section className="grid-3">
        <Metric icon={<Scissors size={18} />} label="Servicios activos" value={business.services.length} />
        <Metric icon={<Users size={18} />} label="Profesionales" value={business.staffMembers.length} />
        <Metric icon={<CalendarDays size={18} />} label="Dias con cobertura" value={countCoveredWeekdays(business.availabilityRules)} />
      </section>

      {!hasBookableSetup ? (
        <Alert tone="danger">
          Para que la reserva funcione bien necesitas al menos un servicio, un profesional y una regla semanal de disponibilidad.
        </Alert>
      ) : (
        <Alert>El flujo publico ya esta listo para recibir reservas y mostrar slots disponibles.</Alert>
      )}

      <section className="panel stack">
        <header className="panel-header">
          <div>
            <h2 className="inline">
              <Wand2 size={20} />
              Checklist de publicacion
            </h2>
            <p>Pasos minimos para que un cliente pueda reservar sin ayuda.</p>
          </div>
        </header>
        <div className="checklist">
          <ChecklistItem done={business.services.length > 0} label="Servicio cargado" />
          <ChecklistItem done={business.staffMembers.length > 0} label="Profesional activo" />
          <ChecklistItem done={business.availabilityRules.length > 0} label="Horario semanal definido" />
          <ChecklistItem done={business.email !== null && business.email.length > 0} label="Email del negocio visible" />
        </div>
      </section>
    </section>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="checklist-item">
      <span className={done ? "check-dot check-dot-done" : "check-dot"}>{done ? "OK" : "!"}</span>
      <strong>{label}</strong>
      <span>{done ? "Listo" : "Pendiente"}</span>
    </div>
  );
}
