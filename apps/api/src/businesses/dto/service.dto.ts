import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateServiceDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(5)
  durationMinutes!: number;

  @IsInt()
  @Min(0)
  priceCents = 0;

  @IsInt()
  @Min(0)
  bufferMinutes = 0;

  @IsBoolean()
  @IsOptional()
  depositEnabled?: boolean;

  @IsIn(["fixed", "percentage"])
  @IsOptional()
  depositMode?: "fixed" | "percentage";

  @IsInt()
  @IsOptional()
  @Min(0)
  depositAmountCents?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  depositPercentage?: number;

  @IsOptional()
  @IsString()
  depositDescription?: string;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsInt()
  @IsOptional()
  @Min(5)
  durationMinutes?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  priceCents?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  bufferMinutes?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsBoolean()
  @IsOptional()
  depositEnabled?: boolean;

  @IsIn(["fixed", "percentage"])
  @IsOptional()
  depositMode?: "fixed" | "percentage";

  @IsInt()
  @IsOptional()
  @Min(0)
  depositAmountCents?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  depositPercentage?: number;

  @IsOptional()
  @IsString()
  depositDescription?: string;
}
