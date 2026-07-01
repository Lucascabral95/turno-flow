import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  controllers: [ReviewsController],
  exports: [ReviewsService],
  imports: [BusinessesModule],
  providers: [ReviewsService]
})
export class ReviewsModule {}
