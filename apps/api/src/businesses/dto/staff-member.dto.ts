import { IsBoolean, IsEmail, IsOptional, IsString } from "class-validator";

export class CreateStaffMemberDto {
  @IsString()
  name!: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}

export class UpdateStaffMemberDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
