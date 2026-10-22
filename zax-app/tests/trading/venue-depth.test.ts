import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jsonFetch: vi.fn(),
}));

vi.mock("../../server/trading/market", () => ({
  cached: async (_key: string, _ttl: number, work: () => unknown) => work(),
  jsonFetch: mocks.jsonFetch,
  marketById: (id: string) => ({
    id,
    provider: "coinbase",
    providerSymbol: id,
  }),
}));

import { closeVenueStreams, venueDepth } from "../../server/trading/venue-depth";

class FailingWebSocket {
  constructor(_url: string) {}
  set onerror(handler: ((event: Event) => void) | null) {
    handler?.(new Event("error"));
  }
  get onerror(): ((event: Event) => void) | null {
    return null;
  }
  send(_message: string) {}
  close() {}
}

afterEach(() => {
  closeVenueStreams();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("venueDepth REST fallback cache timestamp", () => {
  it("retains the fetched-body receipt time on a no-network cached fallback read", async () => {
    const firstReceiptAt = 1_700_000_000_000;
    let now = firstReceiptAt;
    vi.stubGlobal("WebSocket", FailingWebSocket);
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.jsonFetch.mockImplementation((url: string) => {
      if (url.includes("/book?level=2"))
        return {
          bids: [["100", "2"]],
          asks: [["101", "3"]],
          sequence: 42,
        };
      return { quote_increment: "0.01", base_increment: "0.0001" };
    });

    const first = await venueDepth("BTC-USD");
    now += 1_250;
    const cached = await venueDepth("BTC-USD");
    const restRequests = mocks.jsonFetch.mock.calls.filter(([url]) =>
      String(url).includes("/book?level=2"),
    );

    expect(first).toMatchObject({
      status: "polled",
      receivedAt: firstReceiptAt,
      sequence: 42,
    });
    expect(cached).toMatchObject({
      status: "polled",
      receivedAt: firstReceiptAt,
      sequence: 42,
    });
    expect(now - cached.receivedAt).toBe(1_250);
    expect(restRequests).toHaveLength(1);
    expect(cached.source).toContain("polled fallback, not streamed");
  });
});
