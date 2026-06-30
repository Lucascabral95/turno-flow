import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdatePaymentSettingsDto {
  @IsBoolean()
  @IsOptional()
  manualDepositsEnabled?: boolean;

  @IsOptional()
  @IsString()
  paymentAlias?: string;

  @IsOptional()
  @IsString()
  paymentAccountHolder?: string;

  @IsOptional()
  @IsString()
  paymentAccountLabel?: string;

  @IsOptional()
  @IsString()
  paymentInstructions?: string;
}
