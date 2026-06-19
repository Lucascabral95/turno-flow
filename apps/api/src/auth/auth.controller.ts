import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post("login")
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post("refresh")
  refresh(@Body() input: RefreshTokenDto) {
    return this.auth.refresh(input);
  }

  @Post("logout")
  logout(@Body() input: RefreshTokenDto) {
    return this.auth.logout(input);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
