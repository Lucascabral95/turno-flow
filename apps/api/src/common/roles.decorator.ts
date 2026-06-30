import { SetMetadata } from "@nestjs/common";
import type { BusinessMemberRole } from "@prisma/client";

export const ROLES_KEY = "roles";
export const Roles = (...roles: BusinessMemberRole[]) => SetMetadata(ROLES_KEY, roles);
