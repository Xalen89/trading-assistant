import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebView } from "react-native-webview";
import { View } from "react-native";
import { NATIVE_CHART_SCRIPT } from "@/lib/trading/generated/lightweight-runtime";
import {
  CHART_DOCUMENT_ORIGIN,
  chartNavigation,
  parseChartSurfaceEvent,
} from "@/lib/trading/chart-bridge";
import type {
  ChartSurfaceHandle,
  ChartSurfaceProps,
} from "./lightweight-surface-types";

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none';"><style>html,body,#chart{margin:0;width:100%;height:100%;overflow:hidden;background:#0B1017}</style></head><body><div id="chart"></div><script>${NATIVE_CHART_SCRIPT.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
const LightweightSurface = forwardRef<ChartSurfaceHandle, ChartSurfaceProps>(
  function LightweightSurface({ payload, height, onEvent }, ref) {
    const view = useRef<WebView>(null);
    const [ready, setReady] = useState(false);
    const document = useMemo(
      () => ({ html, baseUrl: CHART_DOCUMENT_ORIGIN }),
      [],
    );
    const send = (kind: string, value: unknown) => {
      view.current?.injectJavaScript(
        `window.StratDeskChartBridge?.receive(${JSON.stringify({ kind, value })});true;`,
      );
    };
    useImperativeHandle(
      ref,
      () => ({ command: (command) => send("command", command) }),
      [],
    );
    useEffect(() => {
      if (!ready) return;
      const serialized = JSON.stringify(payload);
      if (serialized.length > 15 * 1024 * 1024) {
        onEvent({
          type: "error",
          message:
            "The chart display payload is too large. Hide the source image and retry.",
        });
        return;
      }
      view.current?.injectJavaScript(
        `window.StratDeskChartBridge?.receive({kind:"update",value:${serialized}});true;`,
      );
    }, [payload, ready, onEvent]);
    useEffect(() => {
      if (ready) return;
      const timeout = setTimeout(
        () =>
          onEvent({
            type: "error",
            message: "The local chart did not become ready. Retry the chart.",
          }),
        15000,
      );
      return () => clearTimeout(timeout);
    }, [ready, onEvent]);
    return (
      <View style={{ height, width: "100%", backgroundColor: "#0B1017" }}>
        <WebView
          ref={view}
          source={document}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          scrollEnabled={false}
          bounces={false}
          onShouldStartLoadWithRequest={(request) => {
            const allowed = chartNavigation(request.url);
            if (allowed === "attribution") onEvent({ type: "attribution" });
            return allowed === "local";
          }}
          onMessage={(event) => {
            const message = parseChartSurfaceEvent(event.nativeEvent.data);
            if (!message) return;
            if (message.type === "ready") setReady(true);
            onEvent(message);
          }}
          onError={() =>
            onEvent({
              type: "error",
              message: "The isolated native chart failed to load.",
            })
          }
          onContentProcessDidTerminate={() => {
            setReady(false);
            view.current?.reload();
          }}
          style={{ backgroundColor: "#0B1017", height }}
        />
      </View>
    );
  },
);
export default LightweightSurface;
