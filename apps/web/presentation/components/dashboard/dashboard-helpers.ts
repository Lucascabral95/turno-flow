import type { Appointment, AvailabilityRule, DashboardMetrics, NotificationHistoryItem, StaffMember } from "../../../lib/api";
import { riskTone } from "../../../lib/dashboard-metrics";

export const weekdayOptions = [
  { label: "Domingo", value: 0 },
  { label: "Lunes", value: 1 },
  { label: "Martes", value: 2 },
  { label: "Miercoles", value: 3 },
  { label: "Jueves", value: 4 },
  { label: "Viernes", value: 5 },
  { label: "Sabado", value: 6 }
] as const;

export function countCoveredWeekdays(rules: AvailabilityRule[]): number {
  return new Set(rules.filter((rule) => rule.active).map((rule) => rule.weekday)).size;
}

export function summarizeAvailabilityCoverage(
  rules: AvailabilityRule[],
  staffMembers: Array<Pick<StaffMember, "id" | "name">>
): string[] {
  const groupedRules = weekdayOptions
    .map((day) => {
      const dayRules = rules.filter((rule) => rule.active && rule.weekday === day.value);

      if (dayRules.length === 0) {
        return null;
      }

      const uniqueRanges = Array.from(new Set(dayRules.map((rule) => `${rule.startTime}-${rule.endTime}`)));
      const uniqueStaffNames = Array.from(
        new Set(
          dayRules.map((rule) => {
            const staffName = staffMembers.find((staffMember) => staffMember.id === rule.staffMemberId)?.name ?? "Profesional";
            return capitalizeFirst(staffName);
          })
        )
      );

      const rangeSummary =
        uniqueRanges.length === 1
          ? uniqueRanges[0]
          : `${uniqueRanges[0]} +${uniqueRanges.length - 1} bloque${uniqueRanges.length - 1 === 1 ? "" : "s"}`;
      const staffSummary =
        uniqueStaffNames.length === 1
          ? uniqueStaffNames[0]
          : `${uniqueStaffNames.length} profesionales`;

      return `${day.label} ${rangeSummary} · ${staffSummary}`;
    })
    .filter((summary): summary is string => summary !== null);

  return groupedRules;
}

export function statusClass(status: Appointment["status"]): string {
  if (status === "no_show" || status.startsWith("cancelled")) {
    return "badge badge-danger";
  }
  if (status === "completed") {
    return "badge";
  }
  return "badge badge-warning";
}

export function isActionableAppointment(appointment: Appointment): boolean {
  return appointment.status === "pending" || appointment.status === "confirmed";
}

export function isOverdueAppointment(appointment: Appointment, now: number | Date = Date.now()): boolean {
  if (!isActionableAppointment(appointment)) {
    return false;
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  return new Date(appointment.endsAt).getTime() < nowMs;
}

export function isUpcomingAppointment(appointment: Appointment, now: number | Date = Date.now()): boolean {
  if (!isActionableAppointment(appointment)) {
    return false;
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  return new Date(appointment.startsAt).getTime() > nowMs;
}

export function isOperationalAppointment(appointment: Appointment, now: number | Date = Date.now()): boolean {
  return isActionableAppointment(appointment) && !isOverdueAppointment(appointment, now);
}

export function appointmentStatusLabel(status: Appointment["status"]): string {
  const labels: Record<Appointment["status"], string> = {
    cancelled_by_business: "Cancelado por negocio",
    cancelled_by_customer: "Cancelado por cliente",
    completed: "Completado",
    confirmed: "Confirmado",
    no_show: "No-show",
    pending: "Pendiente"
  };

  return labels[status];
}

export function appointmentDisplayStatus(appointment: Appointment, now: number | Date = Date.now()): {
  className: string;
  label: string;
  overdue: boolean;
} {
  if (isOverdueAppointment(appointment, now)) {
    return {
      className: "badge badge-warning",
      label: "Ausencia a revisar",
      overdue: true
    };
  }

  return {
    className: statusClass(appointment.status),
    label: appointmentStatusLabel(appointment.status),
    overdue: false
  };
}

export function appointmentTimingHint(appointment: Appointment, now: number | Date = Date.now()): string | null {
  if (!isActionableAppointment(appointment)) {
    return null;
  }

  if (isOverdueAppointment(appointment, now)) {
    return "El horario ya paso y no se registro asistencia.";
  }

  if (isUpcomingAppointment(appointment, now)) {
    return "Todavia no llego la hora de este turno.";
  }

  return "Turno en curso.";
}

export function notificationStatusClass(status: NotificationHistoryItem["status"]): string {
  if (status === "failed") {
    return "badge badge-danger";
  }
  if (status === "sent") {
    return "badge";
  }
  return "badge badge-warning";
}

export function notificationStatusLabel(status: NotificationHistoryItem["status"]): string {
  const labels: Record<NotificationHistoryItem["status"], string> = {
    failed: "Fallido",
    pending: "Pendiente",
    sent: "Enviado"
  };

  return labels[status];
}

export function formatReminderOffset(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} dia${days === 1 ? "" : "s"}`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} h`;
  }

  return `${minutes} min`;
}

export function appointmentStatusMessage(status: "completed" | "no_show" | "cancelled_by_business"): string {
  if (status === "completed") {
    return "Turno completado";
  }

  if (status === "no_show") {
    return "Turno marcado como no-show";
  }

  return "Turno cancelado";
}

export function riskBadgeClass(level: DashboardMetrics["riskyCustomers"][number]["riskLevel"]): string {
  const tone = riskTone(level);
  if (tone === "danger") {
    return "badge badge-danger";
  }
  if (tone === "warning") {
    return "badge badge-warning";
  }

  return "badge";
}

export function weekdayName(weekday: number): string {
  return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][weekday] ?? "Dia";
}

export function formatDateOnly(value: string): string {
  return value.slice(0, 10);
}

export function capitalizeFirst(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return value;
  }

  return `${trimmedValue.charAt(0).toLocaleUpperCase("es-AR")}${trimmedValue.slice(1)}`;
}
