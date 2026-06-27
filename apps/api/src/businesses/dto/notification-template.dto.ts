import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateNotificationTemplateDto {
  @IsString()
  @MaxLength(80)
  @MinLength(2)
  key!: string;

  @IsString()
  @MaxLength(120)
  @MinLength(2)
  name!: string;

  @IsString()
  @MaxLength(160)
  @MinLength(2)
  subject!: string;

  @IsString()
  @MaxLength(4_000)
  @MinLength(10)
  body!: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateNotificationTemplateDto {
  @IsString()
  @MaxLength(120)
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(160)
  @MinLength(2)
  @IsOptional()
  subject?: string;

  @IsString()
  @MaxLength(4_000)
  @MinLength(10)
  @IsOptional()
  body?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
