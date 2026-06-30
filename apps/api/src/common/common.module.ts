import { Global, Module } from "@nestjs/common";

import { BusinessContextGuard } from "./business-context.guard";
import { RolesGuard } from "./roles.guard";

@Global()
@Module({
  exports: [BusinessContextGuard, RolesGuard],
  providers: [BusinessContextGuard, RolesGuard]
})
export class CommonModule {}
