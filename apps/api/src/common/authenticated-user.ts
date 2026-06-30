import type { BusinessMemberRole } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  businessId?: string;
  role?: BusinessMemberRole;
  staffMemberId?: string | null;
};
