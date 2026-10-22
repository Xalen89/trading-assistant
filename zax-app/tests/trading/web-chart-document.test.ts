import { describe, expect, it, vi } from "vitest";
import {
  bindWebChartDocument,
  WEB_CHART_DOCUMENT,
} from "../../lib/trading/web-chart-document";
import { buildLightweightPayload } from "../../lib/trading/lightweight-payload";

// Synthetic messaging fixtures; browser/phone behavior is tested separately.
const fixture = () => {
  const listeners = new Map<string, (event: MessageEvent) => void>();
  const host = {
    addEventListener: vi.fn((type, fn) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
  };
  const child = { postMessage: vi.fn() };
  const loads = new Map<string, () => void>();
  const frame = {
    ownerDocument: { defaultView: host },
    contentWindow: child,
    addEventListener: vi.fn((type, fn) => loads.set(type, fn)),
    removeEventListener: vi.fn((type) => loads.delete(type)),
  };
  const emit = (event: unknown, source = child) =>
    listeners.get("message")?.({
      source,
      data: {
        channel: "stratdesk-local-chart",
        message: JSON.stringify(event),
      },
    } as unknown as MessageEvent);
  return { host, child, frame, emit, loads };
};
const payload = () =>
  buildLightweightPayload({
    candles: [],
    precision: 2,
    showFvg: false,
    showLevels: false,
    showRanges: false,
    future: false,
  });

describe("opaque local web chart bridge", () => {
  it("uses packaged local scripts under no-network CSP, not a CDN or embedded session", () => {
    expect(WEB_CHART_DOCUMENT).toContain("connect-src 'none'");
    expect(WEB_CHART_DOCUMENT).toContain("default-src 'none'");
    expect(WEB_CHART_DOCUMENT).toContain("touch-action:pan-y");
    expect(WEB_CHART_DOCUMENT).not.toMatch(/<script\s+src=/i);
    expect(WEB_CHART_DOCUMENT).toContain("event.source!==parent");
  });
  it("queues the bounded payload, verifies sender, delivers on ready and detaches on unmount", () => {
    const f = fixture();
    const onController = vi.fn();
    const onEvent = vi.fn();
    const release = bindWebChartDocument(
      f.frame as unknown as HTMLIFrameElement,
      onController,
      onEvent,
    );
    const controller = onController.mock.calls[0][0];
    controller.update(payload());
    expect(f.child.postMessage.mock.calls).toHaveLength(1); // hello only before ready
    f.emit({ type: "ready" }, { postMessage: vi.fn() });
    expect(onEvent).not.toHaveBeenCalled();
    f.emit({ type: "ready" });
    expect(f.child.postMessage).toHaveBeenLastCalledWith(
      { kind: "update", value: payload() },
      "*",
    );
    controller.command("zoom-in");
    expect(f.child.postMessage).toHaveBeenLastCalledWith(
      { kind: "command", value: "zoom-in" },
      "*",
    );
    release();
    release();
    expect(f.host.removeEventListener).toHaveBeenCalledTimes(1);
    expect(f.loads.has("load")).toBe(false);
    expect(onController).toHaveBeenLastCalledWith(null);
  });
  it("does not add a misleading readiness timeout after an explicit initialization error", () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const onEvent = vi.fn();
      const release = bindWebChartDocument(
        f.frame as unknown as HTMLIFrameElement,
        vi.fn(),
        onEvent,
      );
      f.emit({ type: "error", message: "Synthetic initialization failure" });
      vi.advanceTimersByTime(15001);
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "error" }),
      );
      release();
    } finally {
      vi.useRealTimers();
    }
  });
  it("forwards only parsed bounded chart events and rejects oversized display data", () => {
    const f = fixture();
    const onController = vi.fn();
    const onEvent = vi.fn();
    const release = bindWebChartDocument(
      f.frame as unknown as HTMLIFrameElement,
      onController,
      onEvent,
    );
    f.emit({ type: "attribution" });
    expect(onEvent).toHaveBeenCalledWith({ type: "attribution" });
    f.emit({ type: "broker-order", value: "anything" });
    expect(onEvent).toHaveBeenCalledTimes(1);
    onController.mock.calls[0][0].update({
      ...payload(),
      sourceLabel: "X".repeat(15 * 1024 * 1024),
    });
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    release();
  });
});
