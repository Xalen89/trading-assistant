import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brokerCandles,
  brokerQuote,
  retryBrokerCandles,
  retryBrokerQuote,
} from "../../server/trading/tradelocker";

const fakeAccessToken = "fake-unit-test-token.not-a-real-jwt.signature";
const fakeAccountId = "7001";
const fakeAccountNumber = "8001";
const symbol = "TL:4242";
const failedSymbol = "TL:4243";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 600 && !check(); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
}

describe("TradeLocker broker read refresh", () => {
  it("refuses a raw 30m broker transport before any credentials or network access", async () => {
    await expect(brokerCandles(symbol, "30m")).rejects.toThrow(
      /Derived 30m.*lower-resolution reads/i,
    );
  });

  it("waits for exact pending reads, refreshes only that key, and uses mocked information routes", async () => {
    vi.stubEnv("TRADELOCKER_ENVIRONMENT", "demo");
    vi.stubEnv("TRADELOCKER_EMAIL", "fake-unit-test@example.invalid");
    vi.stubEnv("TRADELOCKER_PASSWORD", "fake-unit-test-password");
    vi.stubEnv("TRADELOCKER_SERVER", "fake-unit-test-server");
    vi.stubEnv("TRADELOCKER_ACCOUNT_ID", fakeAccountId);

    let releaseFirstQuote: () => void;
    const firstQuote = new Promise<void>((resolve) => {
      releaseFirstQuote = resolve;
    });
    let releaseFailedQuote: () => void;
    const failedQuote = new Promise<void>((resolve) => {
      releaseFailedQuote = resolve;
    });
    let quoteRequests = 0;
    let historyRequests = 0;
    const routes: string[] = [];
    const readHeaders: {
      authorization: string | null;
      account: string | null;
    }[] = [];
    let mockError: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        try {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
          );
          routes.push(url.pathname);
          if (url.pathname === "/backend-api/auth/jwt/token")
            return json({ accessToken: fakeAccessToken });
          if (url.pathname === "/backend-api/auth/jwt/all-accounts")
            return json([
              {
                id: fakeAccountId,
                accNum: fakeAccountNumber,
                currency: "USD",
                status: "fake-test",
              },
            ]);
          if (
            url.pathname ===
            `/backend-api/trade/accounts/${fakeAccountId}/instruments`
          )
            return json({
              d: {
                instruments: [4242, 4243].map((tradableInstrumentId) => ({
                  tradableInstrumentId,
                  name: "FAKE-TEST-INSTRUMENT",
                  type: "FOREX",
                  routes: [{ id: 12, type: "INFO" }],
                })),
              },
            });
          const headers = new Headers(init?.headers);
          readHeaders.push({
            authorization: headers.get("Authorization"),
            account: headers.get("accNum"),
          });
          if (url.pathname === "/backend-api/trade/quotes") {
            quoteRequests += 1;
            if (quoteRequests === 1) await firstQuote;
            if (quoteRequests === 3) {
              await failedQuote;
              return json({ d: { bp: "0", ap: "0" } });
            }
            return json({
              d: {
                bp: String(99 + quoteRequests),
                ap: String(100 + quoteRequests),
              },
            });
          }
          if (url.pathname === "/backend-api/trade/history") {
            historyRequests += 1;
            return json({
              s: "ok",
              d: {
                bars: [0, 1, 2].map((index) => ({
                  t: (1_700_000_000 + index * 60) * 1_000,
                  o: 100 + historyRequests,
                  h: 102 + historyRequests,
                  l: 99 + historyRequests,
                  c: 101 + historyRequests,
                  v: 10,
                })),
              },
            });
          }
          throw new Error(`Unexpected mocked broker route: ${url.pathname}`);
        } catch (error) {
          mockError = error;
          throw error;
        }
      }),
    );

    const deadline = Date.now() + 60_000;
    const pendingQuote = brokerQuote(symbol, deadline);
    await waitFor(() => {
      if (mockError) throw mockError;
      return quoteRequests === 1;
    });
    const refreshes = [
      retryBrokerQuote(symbol, deadline),
      retryBrokerQuote(symbol, deadline),
    ];
    expect(quoteRequests).toBe(1);
    releaseFirstQuote!();
    const [initial, refreshedA, refreshedB] = await Promise.all([
      pendingQuote,
      ...refreshes,
    ]);

    expect(initial.price).toBe(100.5);
    expect(refreshedA.price).toBe(101.5);
    expect(refreshedB.price).toBe(101.5);
    expect(quoteRequests).toBe(2);

    const failedRead = brokerQuote(failedSymbol, deadline);
    await waitFor(() => {
      if (mockError) throw mockError;
      return quoteRequests === 3;
    });
    const recoveredRead = retryBrokerQuote(failedSymbol, deadline);
    releaseFailedQuote!();
    await expect(failedRead).rejects.toThrow(/valid bid\/ask quote/i);
    expect((await recoveredRead).price).toBe(103.5);
    expect(quoteRequests).toBe(4);

    await brokerCandles(symbol, "1m", deadline);
    await brokerCandles(symbol, "5m", deadline);
    await retryBrokerCandles(symbol, "1m", deadline);
    await brokerCandles(symbol, "1m", deadline);
    await brokerCandles(symbol, "5m", deadline);

    expect(historyRequests).toBe(3);
    expect(readHeaders).toEqual(
      expect.arrayContaining([
        {
          authorization: `Bearer ${fakeAccessToken}`,
          account: fakeAccountNumber,
        },
      ]),
    );
    expect(routes.some((route) => /\/orders|\/positions/.test(route))).toBe(
      false,
    );
    expect(routes).toEqual(
      expect.arrayContaining([
        "/backend-api/auth/jwt/token",
        "/backend-api/auth/jwt/all-accounts",
        `/backend-api/trade/accounts/${fakeAccountId}/instruments`,
        "/backend-api/trade/quotes",
        "/backend-api/trade/history",
      ]),
    );
  }, 15_000);

  it("resolves the selected account before quote cache lookup and never exposes its raw identifier", async () => {
    vi.stubEnv("TRADELOCKER_ENVIRONMENT", "demo");
    vi.stubEnv("TRADELOCKER_EMAIL", "fake-unit-test@example.invalid");
    vi.stubEnv("TRADELOCKER_PASSWORD", "fake-unit-test-password");
    vi.stubEnv("TRADELOCKER_SERVER", "fake-unit-test-server");
    vi.stubEnv("TRADELOCKER_ACCOUNT_ID", "7101");

    const accountRequests: string[] = [];
    const instrumentRequests: string[] = [];
    const quoteAccounts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.pathname === "/backend-api/auth/jwt/token")
          return json({ accessToken: fakeAccessToken });
        if (url.pathname === "/backend-api/auth/jwt/all-accounts") {
          accountRequests.push(url.pathname);
          return json([
            { id: "7101", accNum: "8101", currency: "USD", status: "fake" },
            { id: "7102", accNum: "8102", currency: "USD", status: "fake" },
          ]);
        }
        if (
          /\/backend-api\/trade\/accounts\/\d+\/instruments$/.test(url.pathname)
        ) {
          instrumentRequests.push(url.pathname);
          return json({
            d: {
              instruments: [
                {
                  tradableInstrumentId: 4242,
                  name: "FAKE-TEST-INSTRUMENT",
                  type: "FOREX",
                  routes: [{ id: 12, type: "INFO" }],
                },
              ],
            },
          });
        }
        if (url.pathname === "/backend-api/trade/quotes") {
          const account = new Headers(init?.headers).get("accNum")!;
          quoteAccounts.push(account);
          return json({
            d: {
              bp: account === "8101" ? "101" : "201",
              ap: account === "8101" ? "102" : "202",
            },
          });
        }
        throw new Error(`Unexpected mocked broker route: ${url.pathname}`);
      }),
    );

    const first = await brokerQuote(symbol);
    vi.stubEnv("TRADELOCKER_ACCOUNT_ID", "7102");
    const second = await brokerQuote(symbol);

    expect(quoteAccounts).toEqual(["8101", "8102"]);
    expect(accountRequests).toHaveLength(2);
    expect(instrumentRequests).toEqual([
      "/backend-api/trade/accounts/7101/instruments",
      "/backend-api/trade/accounts/7102/instruments",
    ]);
    expect(first.sourceIdentity).not.toBe(second.sourceIdentity);
    expect(first.sourceIdentity).not.toContain("7101");
    expect(second.sourceIdentity).not.toContain("7102");
  }, 15_000);
});
