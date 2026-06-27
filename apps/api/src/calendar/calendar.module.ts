import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { BusinessesModule } from "../businesses/businesses.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { CalendarTokenCryptoService } from "./token-crypto.service";

@Module({
  controllers: [CalendarController],
  imports: [BusinessesModule, ConfigModule],
  providers: [CalendarService, CalendarTokenCryptoService]
})
export class CalendarModule {}
