import { describe, expect, it, vi } from "vitest";

import { EventRoutingKeys, EventTypes } from "./event-types";
import { OutboxService } from "./outbox.service";

describe("OutboxService", () => {
  it("stores the event routing key with the domain event", async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new OutboxService();

    await service.create(
      { eventOutbox: { create } } as never,
      {
        aggregateId: "00000000-0000-0000-0000-000000000002",
        businessId: "00000000-0000-0000-0000-000000000001",
        payload: { serviceId: "00000000-0000-0000-0000-000000000002" },
        routingKey: EventRoutingKeys.ServiceCreated,
        type: EventTypes.ServiceCreated,
        version: 1
      }
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        aggregateId: "00000000-0000-0000-0000-000000000002",
        businessId: "00000000-0000-0000-0000-000000000001",
        payload: { serviceId: "00000000-0000-0000-0000-000000000002" },
        routingKey: "service.created",
        type: "ServiceCreated",
        version: 1
      }
    });
  });
});
