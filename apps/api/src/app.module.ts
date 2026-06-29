import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AppointmentsModule } from "./appointments/appointments.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { CalendarModule } from "./calendar/calendar.module";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import {
  PublicAppointmentReadRateLimitMiddleware,
  PublicAppointmentWriteRateLimitMiddleware,
  PublicReadRateLimitMiddleware,
  PublicWriteRateLimitMiddleware,
} from "./common/rate-limit.middleware";
import { CustomersModule } from "./customers/customers.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicModule } from "./public/public.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    PrismaModule,
    EventsModule,
    AuditModule,
    AuthModule,
    BusinessesModule,
    CalendarModule,
    CustomersModule,
    AppointmentsModule,
    DashboardModule,
    PublicModule,
    HealthModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes("*");

    consumer
      .apply(PublicWriteRateLimitMiddleware)
      .forRoutes(
        { path: "public/businesses/:slug/appointments", method: RequestMethod.POST },
        { path: "public/businesses/:slug/waitlist", method: RequestMethod.POST },
        { path: "public/waitlist-offers/:token/accept", method: RequestMethod.POST },
        { path: "public/waitlist-offers/:token/reject", method: RequestMethod.POST }
      );

    consumer
      .apply(PublicAppointmentWriteRateLimitMiddleware)
      .forRoutes(
        { path: "public/appointments/:id/cancel", method: RequestMethod.POST },
        { path: "public/appointments/:id/reschedule", method: RequestMethod.POST }
      );

    consumer
      .apply(PublicReadRateLimitMiddleware)
      .forRoutes(
        { path: "public/businesses/:slug", method: RequestMethod.GET },
        { path: "public/businesses/:slug/services", method: RequestMethod.GET },
        { path: "public/businesses/:slug/availability", method: RequestMethod.GET },
        { path: "public/businesses/:slug/slots", method: RequestMethod.GET }
      );

    consumer
      .apply(PublicAppointmentReadRateLimitMiddleware)
      .forRoutes(
        { path: "public/appointments/:id", method: RequestMethod.GET },
        { path: "public/appointments/:id/reschedule-slots", method: RequestMethod.GET }
      );
  }
}
