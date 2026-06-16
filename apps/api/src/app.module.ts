import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AppointmentsModule } from "./appointments/appointments.module";
import { AuthModule } from "./auth/auth.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EventsModule } from "./events/events.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicModule } from "./public/public.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    PrismaModule,
    EventsModule,
    AuthModule,
    BusinessesModule,
    AppointmentsModule,
    DashboardModule,
    PublicModule
  ]
})
export class AppModule {}
