import { IsEmail, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches } from "class-validator";

import type { PublicAppointmentStatus } from "../status";

export class CreatePublicAppointmentDto {
  @IsUUID()
  serviceId!: string;

  @IsUUID()
  @IsOptional()
  staffMemberId?: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;
}

export class CancelAppointmentDto {
  @IsString()
  token!: string;
}

export class RescheduleAppointmentDto {
  @IsISO8601()
  startsAt!: string;

  @IsUUID()
  @IsOptional()
  staffMemberId?: string;

  @IsString()
  @IsOptional()
  token?: string;
}

export class CreateWaitlistEntryDto {
  @IsUUID()
  serviceId!: string;

  @IsString()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredDateStart!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredDateEnd!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  @IsOptional()
  earliestTime?: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  @IsOptional()
  latestTime?: string;
}

export class UpdateAppointmentStatusDto {
  @IsIn(["confirmed", "completed", "no_show", "cancelled_by_business"])
  status!: Extract<PublicAppointmentStatus, "confirmed" | "completed" | "no_show" | "cancelled_by_business">;
}
