import type { RateLimitRequestHandler } from "express-rate-limit";

import { buildAppointmentRateLimitKey } from "./rate-limit.middleware";

type RequestLike = Parameters<RateLimitRequestHandler>[0];

describe("buildAppointmentRateLimitKey", () => {
  it("uses appointment id and token from query when available", () => {
    const request = {
      ip: "::1",
      params: { id: "appointment-123" },
      query: { token: "token-from-query" }
    } as unknown as RequestLike;

    expect(buildAppointmentRateLimitKey(request)).toBe("appointment:appointment-123:token-from-query");
  });

  it("uses appointment id and token from body for write requests", () => {
    const request = {
      ip: "::1",
      body: { token: "token-from-body" },
      params: { id: "appointment-456" },
      query: {}
    } as unknown as RequestLike;

    expect(buildAppointmentRateLimitKey(request)).toBe("appointment:appointment-456:token-from-body");
  });

  it("falls back to appointment id and ip when there is no token", () => {
    const request = {
      ip: "::1",
      body: {},
      params: { id: "appointment-789" },
      query: {}
    } as unknown as RequestLike;

    expect(buildAppointmentRateLimitKey(request)).toBe("appointment:appointment-789:::1");
  });
});
