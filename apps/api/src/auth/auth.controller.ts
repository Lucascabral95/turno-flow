import { Body, Controller, Post } from "@nestjs/common";

import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() input: RegisterDto): Promise<{ accessToken: string }> {
    return this.auth.register(input);
  }

  @Post("login")
  login(@Body() input: LoginDto): Promise<{ accessToken: string }> {
    return this.auth.login(input);
  }
}
