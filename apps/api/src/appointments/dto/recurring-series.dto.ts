import { IsEnum, IsISO8601, IsInt, IsOptional, IsUUID, Min } from "class-validator";

import { RecurringIntervalUnit, RecurringSeriesStatus } from "@prisma/client";

export class CreateRecurringSeriesDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  serviceId!: string;

  @IsUUID()
  staffMemberId!: string;

  @IsInt()
  @Min(1)
  intervalValue!: number;

  @IsEnum(RecurringIntervalUnit)
  intervalUnit!: RecurringIntervalUnit;

  @IsISO8601()
  firstOccurrenceAt!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  advanceNoticeDays?: number;

  @IsInt()
  @Min(1)
  maxOccurrences!: number;
}

export class UpdateRecurringSeriesDto {
  @IsEnum(RecurringSeriesStatus)
  @IsOptional()
  status?: RecurringSeriesStatus;

  @IsInt()
  @Min(1)
  @IsOptional()
  advanceNoticeDays?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxOccurrences?: number;
}
