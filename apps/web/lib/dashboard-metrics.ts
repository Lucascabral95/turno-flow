import type { DashboardMetrics } from "./api";

export type WeeklyChartBar = {
  activeAppointments: number;
  completedAppointments: number;
  date: string;
  height: number;
  label: string;
  noShowAppointments: number;
  totalAppointments: number;
};

export type RankedMetricBar = {
  label: string;
  value: number;
  width: number;
};

export function buildWeeklyChartBars(metrics: DashboardMetrics | null): WeeklyChartBar[] {
  const days = metrics?.weeklyBreakdown ?? [];
  const maxTotal = Math.max(1, ...days.map((day) => day.totalAppointments));

  return days.map((day) => ({
    activeAppointments: day.activeAppointments,
    completedAppointments: day.completedAppointments,
    date: day.date,
    height: Math.max(day.totalAppointments === 0 ? 10 : 18, Math.round((day.totalAppointments / maxTotal) * 100)),
    label: weekdayLabel(day.date),
    noShowAppointments: day.noShowAppointments,
    totalAppointments: day.totalAppointments
  }));
}

export function buildTopServiceBars(metrics: DashboardMetrics | null): RankedMetricBar[] {
  const services = metrics?.topServices ?? [];
  const maxBookings = Math.max(1, ...services.map((service) => service.bookings));

  return services.map((service) => ({
    label: service.name,
    value: service.bookings,
    width: Math.max(12, Math.round((service.bookings / maxBookings) * 100))
  }));
}

export function buildRecurringCustomerBars(metrics: DashboardMetrics | null): RankedMetricBar[] {
  const customers = metrics?.recurringCustomers ?? [];
  const maxAppointments = Math.max(1, ...customers.map((customer) => customer.appointments));

  return customers.map((customer) => ({
    label: customer.name,
    value: customer.appointments,
    width: Math.max(12, Math.round((customer.appointments / maxAppointments) * 100))
  }));
}

export function riskTone(level: DashboardMetrics["riskyCustomers"][number]["riskLevel"]): "danger" | "warning" | undefined {
  if (level === "high") {
    return "danger";
  }
  if (level === "medium") {
    return "warning";
  }

  return undefined;
}

function weekdayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short"
  }).format(date);
}
