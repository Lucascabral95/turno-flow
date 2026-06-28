import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListCustomersQueryDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsIn(["low", "medium", "high"])
  @IsOptional()
  riskLevel?: "low" | "medium" | "high";

  @IsIn(["all", "recurring", "one_time"])
  @IsOptional()
  recurrence?: "all" | "recurring" | "one_time";

  @IsIn(["all", "required", "not_required"])
  @IsOptional()
  deposit?: "all" | "required" | "not_required";

  @IsIn(["risk_desc", "updated_desc", "spend_desc", "name_asc"])
  @IsOptional()
  sort?: "risk_desc" | "updated_desc" | "spend_desc" | "name_asc";

  @IsInt()
  @IsOptional()
  @Max(500)
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsInt()
  @IsOptional()
  @Max(100)
  @Min(5)
  @Type(() => Number)
  pageSize?: number;
}

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  phone?: string;

  @IsBoolean()
  @IsOptional()
  requiresDeposit?: boolean;
}

export class CreateCustomerNoteDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}
