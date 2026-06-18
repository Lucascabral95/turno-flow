import { IsIn, IsOptional, IsString, IsUUID, Matches } from "class-validator";

export type AvailabilityExceptionTypeInput = "BLOCKED" | "EXTRA_OPENING";

export class CreateAvailabilityExceptionDto {
  @IsUUID()
  @IsOptional()
  staffMemberId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime!: string;

  @IsIn(["BLOCKED", "EXTRA_OPENING"])
  type!: AvailabilityExceptionTypeInput;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateAvailabilityExceptionDto {
  @IsUUID()
  @IsOptional()
  staffMemberId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  date?: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  @IsOptional()
  startTime?: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  @IsOptional()
  endTime?: string;

  @IsIn(["BLOCKED", "EXTRA_OPENING"])
  @IsOptional()
  type?: AvailabilityExceptionTypeInput;

  @IsString()
  @IsOptional()
  reason?: string;
}
