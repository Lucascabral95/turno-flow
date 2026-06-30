import { IsEmail, IsEnum, IsOptional, IsUUID } from "class-validator";
import { BusinessMemberRole } from "@prisma/client";

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(BusinessMemberRole)
  role!: BusinessMemberRole;

  @IsUUID()
  @IsOptional()
  staffMemberId?: string;
}

export class ChangeMemberRoleDto {
  @IsEnum(BusinessMemberRole)
  role!: BusinessMemberRole;
}
