import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateReminderSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Max(10_080)
  @Min(5)
  @IsOptional()
  offsetMinutes?: number;

  @IsIn(["mock"])
  @IsOptional()
  channel?: "mock";

  @IsString()
  @IsOptional()
  template?: string;
}
