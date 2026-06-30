import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import type { AuthenticatedUser } from "./authenticated-user";
import { PrismaService } from "../prisma/prisma.service";

type RequestWithUser = { user?: AuthenticatedUser };

@Injectable()
export class BusinessContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return true;
    }

    const member = await this.prisma.businessMember.findFirst({
      select: { businessId: true, role: true, staffMemberId: true },
      where: { active: true, userId: user.id }
    });

    if (!member) {
      throw new ForbiddenException("No active business membership found");
    }

    request.user = {
      ...user,
      businessId: member.businessId,
      role: member.role,
      staffMemberId: member.staffMemberId
    };

    return true;
  }
}
