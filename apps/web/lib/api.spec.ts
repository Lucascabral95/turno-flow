import { describe, expect, it } from "vitest";

import { formatMoney, requestJson } from "./api";

describe("formatMoney", () => {
  it("formats cents as Argentine pesos", () => {
    expect(formatMoney(123400)).toContain("1.234");
  });
});

describe("requestJson", () => {
  it("uses the HTTP status when an error response has no JSON body", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response("", {
        status: 404
      }));

    try {
      await expect(requestJson("/missing")).rejects.toThrow("Request failed with status 404");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("returns null for successful empty responses", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response(null, {
        status: 204
      }));

    try {
      await expect(requestJson<null>("/empty")).resolves.toBeNull();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
