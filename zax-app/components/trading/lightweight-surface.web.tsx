import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  bindWebChartDocument,
  WEB_CHART_DOCUMENT,
  type WebChartController,
} from "@/lib/trading/web-chart-document";
import type {
  ChartSurfaceHandle,
  ChartSurfaceProps,
} from "./lightweight-surface-types";

const LightweightSurface = forwardRef<ChartSurfaceHandle, ChartSurfaceProps>(
  function LightweightSurface({ payload, height, onEvent }, ref) {
    const frame = useRef<HTMLIFrameElement>(null);
    const controller = useRef<WebChartController | null>(null);
    const latestPayload = useRef(payload);
    const handler = useRef(onEvent);
    useEffect(() => {
      handler.current = onEvent;
    }, [onEvent]);
    useEffect(() => {
      latestPayload.current = payload;
      controller.current?.update(payload);
    }, [payload]);
    useImperativeHandle(
      ref,
      () => ({ command: (command) => controller.current?.command(command) }),
      [],
    );
    useEffect(() => {
      if (!frame.current) return;
      return bindWebChartDocument(
        frame.current,
        (instance) => {
          controller.current = instance;
          instance?.update(latestPayload.current);
        },
        (event) => handler.current(event),
      );
    }, []);
    return (
      <iframe
        ref={frame}
        title="TradingView Lightweight Charts with strategy and paper trade overlays"
        srcDoc={WEB_CHART_DOCUMENT}
        sandbox="allow-scripts"
        style={{
          width: "100%",
          height,
          display: "block",
          border: 0,
          position: "relative",
          background: "#0B1017",
          touchAction: "pan-y",
        }}
      />
    );
  },
);
export default LightweightSurface;
