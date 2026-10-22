import { createLightweightController } from "./lightweight-controller";
import type { LightweightPayload } from "./lightweight-payload";
import type { ChartCommand, ChartSurfaceEvent } from "./chart-types";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    StratDeskChartBridge?: { receive: (message: unknown) => void };
  }
}
const send = (event: ChartSurfaceEvent) =>
  window.ReactNativeWebView?.postMessage(JSON.stringify(event));
try {
  const root = document.getElementById("chart");
  if (!root) throw new Error("Chart root missing");
  const controller = createLightweightController(root, send);
  window.StratDeskChartBridge = {
    receive: (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const { kind, value } = message as { kind?: unknown; value?: unknown };
      if (
        kind === "command" &&
        ["zoom-in", "zoom-out", "reset"].includes(value as string)
      )
        controller.command(value as ChartCommand);
      if (kind === "update" && value && typeof value === "object") {
        const p = value as LightweightPayload;
        if (
          Array.isArray(p.candles) &&
          p.candles.length <= 3000 &&
          Array.isArray(p.lines) &&
          p.lines.length <= 24 &&
          Array.isArray(p.zones) &&
          p.zones.length <= 64 &&
          Array.isArray(p.priceLines) &&
          p.priceLines.length <= 80
        )
          controller.update(p);
      }
    },
  };
  window.addEventListener("pagehide", () => controller.destroy(), {
    once: true,
  });
} catch {
  send({ type: "error", message: "Chart initialization failed" });
}
