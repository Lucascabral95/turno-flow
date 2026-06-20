"use client";

import { CalendarClock, LayoutDashboard, Scissors, Users } from "lucide-react";
import type { ReactNode } from "react";

import type { CurrentBusiness, DashboardMetrics } from "../../../lib/api";
import { capitalizeFirst, riskBadgeClass, summarizeAvailabilityCoverage } from "./dashboard-helpers";
import styles from "./dashboard-shared.module.scss";

export function Alert({ children, tone = "info" }: { children: ReactNode; tone?: "danger" | "info" }) {
  return <div className={tone === "danger" ? "error" : "message"}>{children}</div>;
}

export function EmptyState({
  compact = false,
  description,
  title
}: {
  compact?: boolean;
  description: string;
  title: string;
}) {
  return (
    <div className={compact ? "empty-state empty-state-compact" : "empty-state"}>
      <div className="empty-state-icon">
        <LayoutDashboard size={22} />
      </div>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function LoadingState() {
  return (
    <section className="loading-grid" aria-label="Cargando datos">
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </section>
  );
}

export function Metric({
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
  const className = tone === "danger" ? "metric metric-danger" : tone === "warning" ? "metric metric-warning" : "metric";
  return (
    <div className={className}>
      {icon ? <div className="metric-icon">{icon}</div> : null}
      <strong>{value}</strong>
      <span className="metric-label">{label}</span>
    </div>
  );
}

export function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function InventoryPanel({ business }: { business: CurrentBusiness | null }) {
  if (!business) {
    return <div className="message">Configura tu negocio para cargar servicios, staff y disponibilidad.</div>;
  }

  const availabilitySummary = summarizeAvailabilityCoverage(business.availabilityRules, business.staffMembers);

  return (
    <section className="grid-3">
      <InventoryList icon={<Scissors size={18} />} title="Servicios" values={business.services.map((service) => capitalizeFirst(service.name))} />
      <InventoryList icon={<Users size={18} />} title="Staff" values={business.staffMembers.map((staffMember) => capitalizeFirst(staffMember.name))} />
      <InventoryList
        icon={<CalendarClock size={18} />}
        title="Disponibilidad"
        values={availabilitySummary}
      />
    </section>
  );
}

export function InventoryList({ icon, title, values }: { icon: ReactNode; title: string; values: string[] }) {
  return (
    <section className={`panel stack inventory-panel ${styles.inventoryPanel}`}>
      <header className={`inventory-panel-header ${styles.inventoryHeader}`}>
        <h3 className="inline">
          {icon}
          {title}
        </h3>
        <span className="badge badge-soft">{values.length}</span>
      </header>
      {values.length === 0 ? (
        <EmptyState compact title="Sin datos" description={`Todavia no hay ${title.toLowerCase()} cargados.`} />
      ) : (
        <div className={`inventory-list ${styles.inventoryList}`}>
          {values.map((value) => (
            <div className={`inventory-item ${styles.inventoryItem}`} key={value}>
              <span>{capitalizeFirst(value)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function RiskyCustomersTable({ metrics }: { metrics: DashboardMetrics | null }) {
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
