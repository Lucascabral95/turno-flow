import { AppointmentStatus } from "@prisma/client";

export type PublicAppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled_by_customer"
  | "cancelled_by_business"
  | "completed"
  | "no_show";

const apiToPrisma: Record<PublicAppointmentStatus, AppointmentStatus> = {
  cancelled_by_business: AppointmentStatus.CANCELLED_BY_BUSINESS,
  cancelled_by_customer: AppointmentStatus.CANCELLED_BY_CUSTOMER,
  completed: AppointmentStatus.COMPLETED,
  confirmed: AppointmentStatus.CONFIRMED,
  no_show: AppointmentStatus.NO_SHOW,
  pending: AppointmentStatus.PENDING
};

const prismaToApi = new Map<AppointmentStatus, PublicAppointmentStatus>(
  Object.entries(apiToPrisma).map(([apiStatus, prismaStatus]) => [
    prismaStatus,
    apiStatus as PublicAppointmentStatus
  ])
);

export function toPrismaAppointmentStatus(status: PublicAppointmentStatus): AppointmentStatus {
  return apiToPrisma[status];
}

export function fromPrismaAppointmentStatus(status: AppointmentStatus): PublicAppointmentStatus {
  const mapped = prismaToApi.get(status);

  if (!mapped) {
    throw new Error(`Unsupported appointment status: ${status}`);
  }

  return mapped;
}

export const activeAppointmentStatuses: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
