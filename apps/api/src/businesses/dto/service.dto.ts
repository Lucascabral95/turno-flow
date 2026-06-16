import { IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";

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
}
