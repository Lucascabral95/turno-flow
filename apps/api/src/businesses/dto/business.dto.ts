import { IsEmail, IsOptional, IsString, Matches } from "class-validator";

export class CreateBusinessDto {
  @IsString()
  name!: string;

  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}
