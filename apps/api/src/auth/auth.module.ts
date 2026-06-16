import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  exports: [AuthGuard],
  providers: [AuthGuard, AuthService]
})
export class AuthModule {}
