import { afterEach, describe, expect, it, vi } from "vitest";

type Detail = { name: string; type: string; tickSize?: unknown };

async function mockedAdapter(details: Record<string, Detail>) {
  vi.resetModules();
  vi.stubEnv("OWNER_OPEN_ID", "test-owner");
  vi.stubEnv("TRADELOCKER_ENVIRONMENT", "demo");
  vi.stubEnv("TRADELOCKER_EMAIL", "test@example.test");
  vi.stubEnv("TRADELOCKER_PASSWORD", "test-password");
  vi.stubEnv("TRADELOCKER_SERVER", "test-server");
  vi.stubEnv("TRADELOCKER_ACCOUNT_ID", "1");
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/backend-api/auth/jwt/token")
        return new Response(
          JSON.stringify({ accessToken: "test.token.value" }),
          { status: 200 },
        );
      if (url.pathname === "/backend-api/auth/jwt/all-accounts")
        return new Response(
          JSON.stringify([
            { id: 1, accNum: 7, currency: "USD", status: "ACTIVE" },
          ]),
          { status: 200 },
        );
      if (url.pathname === "/backend-api/trade/accounts/1/instruments")
        return new Response(
          JSON.stringify({
            d: {
              instruments: Object.entries(details).map(
                ([tradableInstrumentId, detail]) => ({
                  tradableInstrumentId: Number(tradableInstrumentId),
                  name: detail.name,
                  type: detail.type,
                  routes: [
                    { id: 55, type: "INFO" },
                    { id: 66, type: "TRADE" },
                  ],
                }),
              ),
            },
          }),
          { status: 200 },
        );
      const match = url.pathname.match(
        /^\/backend-api\/trade\/instruments\/(\d+)$/,
      );
      if (match) {
        expect(url.searchParams.get("routeId")).toBe("66");
        expect(url.searchParams.get("locale")).toBe("en");
        expect(new Headers(init?.headers).get("accNum")).toBe("7");
        return new Response(JSON.stringify({ s: "ok", d: details[match[1]] }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected mocked HTTP path: ${url.pathname}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { ...(await import("../../server/trading/tradelocker")), fetchMock };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("TradeLocker broker instrument facts", () => {
  it("allows only the numeric metadata endpoint, never broker order or position paths", async () => {
    const adapter = await mockedAdapter({
      42: {
        name: "NQ CFD",
        type: "FUTURES_CFD",
        tickSize: [{ leftRangeLimit: 0, tickSize: 0.25 }],
      },
    });
    expect(adapter.brokerReadAllowed("/trade/instruments/42")).toBe(true);
    for (const path of [
      "/trade/instruments/42/",
      "/trade/instruments/42/orders",
      "/trade/orders/42",
      "/trade/positions/42",
      "/trade/accounts/1/positions",
    ])
      expect(adapter.brokerReadAllowed(path)).toBe(false);
    await expect(
      adapter.brokerInstrumentFacts("TL:42", null),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(adapter.fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an actual single positive reported tick with optional lower bound null or omitted", async () => {
    const adapter = await mockedAdapter({
      "12": {
        name: "XAUUSD",
        type: "FOREX",
        tickSize: [{ leftRangeLimit: null, tickSize: 0.01 }],
      },
      "13": {
        name: "EURUSD",
        type: "FOREX",
        tickSize: [{ tickSize: 0.00001 }],
      },
    });
    expect(
      (await adapter.brokerInstrumentFacts("TL:12", { openId: "test-owner" }))
        .tick?.value,
    ).toBe(0.01);
    expect(
      (await adapter.brokerInstrumentFacts("TL:13", { openId: "test-owner" }))
        .tick?.value,
    ).toBe(0.00001);
  });
  it("returns only selected-account uniform tickSize metadata after the owner boundary", async () => {
    const adapter = await mockedAdapter({
      42: {
        name: "NQ CFD",
        type: "FUTURES_CFD",
        tickSize: [
          { leftRangeLimit: 0, tickSize: 0.25 },
          { leftRangeLimit: 10000, tickSize: 0.25 },
        ],
      },
    });
    const facts = await adapter.brokerInstrumentFacts("TL:42", {
      openId: "test-owner",
    });
    expect(facts).toMatchObject({
      market: "TL:42",
      providerSymbol: "NQ CFD",
      source: "TradeLocker · selected personal account · instrument details",
      tick: { value: 0.25, source: "TradeLocker instrument details tickSize" },
      dailyBasis: "utc-provider-trading-days",
      volumeBasis: "broker-reported",
    });
    expect(Number.isFinite(facts.retrievedAt)).toBe(true);
    expect(facts.messages.join(" ")).not.toMatch(/CME|precision fallback/i);
    expect(adapter.fetchMock).toHaveBeenCalledTimes(4);
  });

  it("leaves tick unset for missing broker tickSize without decimal or futures fallbacks", async () => {
    const adapter = await mockedAdapter({
      43: { name: "Index CFD", type: "INDICES", tickSize: undefined },
    });
    const facts = await adapter.brokerInstrumentFacts("TL:43", {
      openId: "test-owner",
    });
    expect(facts.tick).toBeUndefined();
    expect(facts.messages.join(" ")).toContain(
      "No precision, lotStep, tickCost, decimal, or futures-market fallback was used.",
    );
    expect(facts.messages.join(" ")).not.toMatch(/CME|0\.01/);
  });

  it("does not make a positive-only single tick band universal for an unknown price", async () => {
    const adapter = await mockedAdapter({
      45: {
        name: "Bounded CFD",
        type: "INDICES",
        tickSize: [{ leftRangeLimit: 10000, tickSize: 0.25 }],
      },
    });
    const facts = await adapter.brokerInstrumentFacts("TL:45", {
      openId: "test-owner",
    });
    expect(facts.tick).toBeUndefined();
    expect(facts.messages.join(" ")).toContain("no safe uniform tickSize");
  });

  it("rejects a variable tickSize schedule rather than choosing a scalar fallback", async () => {
    const adapter = await mockedAdapter({
      44: {
        name: "Variable CFD",
        type: "INDICES",
        tickSize: [
          { leftRangeLimit: 0, tickSize: 0.01 },
          { leftRangeLimit: 100, tickSize: 0.05 },
        ],
      },
    });
    const facts = await adapter.brokerInstrumentFacts("TL:44", {
      openId: "test-owner",
    });
    expect(facts.tick).toBeUndefined();
    expect(facts.messages.join(" ")).toContain("no safe uniform tickSize");
    expect(facts.messages.join(" ")).not.toMatch(/CME|0\.01|0\.05/);
  });
});
