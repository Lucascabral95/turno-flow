import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  controllers: [CustomersController],
  imports: [BusinessesModule],
  providers: [CustomersService]
})
export class CustomersModule {}
