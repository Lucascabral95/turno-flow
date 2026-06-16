import { IsBoolean, IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";

export class CreateAvailabilityRuleDto {
  @IsUUID()
  staffMemberId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime!: string;
}

export class UpdateAvailabilityRuleDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
