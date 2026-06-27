import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Redirect, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { CalendarService } from "./calendar.service";

@Controller("calendar-connections")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @UseGuards(AuthGuard)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.listConnections(user);
  }

  @UseGuards(AuthGuard)
  @Post("google/start")
  start(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.startConnection(user, "google");
  }

  @Get("google/callback")
  @Redirect()
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined) {
    const redirectUrl = await this.calendar.handleCallback("google", code, state);
    return { url: redirectUrl };
  }

  @UseGuards(AuthGuard)
  @Delete(":id")
  disconnect(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.calendar.disconnect(user, id);
  }

  @UseGuards(AuthGuard)
  @Post(":id/sync-future")
  syncFuture(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.calendar.syncFuture(user, id);
  }
}
