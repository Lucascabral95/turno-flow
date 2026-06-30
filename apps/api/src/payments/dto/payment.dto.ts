import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateManualPaymentDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  customerNote?: string;

  @IsOptional()
  @IsString()
  internalNote?: string;
}

export class PaymentDecisionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
