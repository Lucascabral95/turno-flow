import { Global, Module } from "@nestjs/common";

import { EventPublisherService } from "./event-publisher.service";
import { OutboxService } from "./outbox.service";

@Global()
@Module({
  exports: [EventPublisherService, OutboxService],
  providers: [EventPublisherService, OutboxService]
})
export class EventsModule {}
