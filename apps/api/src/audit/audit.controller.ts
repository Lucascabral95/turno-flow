import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AuditService } from "./audit.service";

@UseGuards(AuthGuard)
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.audit.listForCurrentUser(user);
  }
}
