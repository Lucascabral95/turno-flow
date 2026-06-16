import { Module } from "@nestjs/common";

import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

@Module({
  controllers: [BusinessesController],
  exports: [BusinessesService],
  providers: [BusinessesService]
})
export class BusinessesModule {}
