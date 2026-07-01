import { IsEmail, IsISO8601, IsString, IsUUID, IsOptional } from "class-validator";

export class RequestLoginLinkDto {
  @IsString()
  businessSlug!: string;

  @IsEmail()
  email!: string;
}

export class ExchangeLoginTokenDto {
  @IsString()
  token!: string;
}

export class RebookAppointmentDto {
  @IsISO8601()
  startsAt!: string;

  @IsUUID()
  @IsOptional()
  staffMemberId?: string;
}
