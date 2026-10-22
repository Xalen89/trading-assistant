import { NATIVE_CHART_SCRIPT } from "./generated/lightweight-runtime";
import { parseChartSurfaceEvent } from "./chart-bridge";
import type { createLightweightController } from "./lightweight-controller";
import type { ChartSurfaceEvent } from "./chart-types";

export type WebChartController = ReturnType<typeof createLightweightController>;
const CHANNEL = "stratdesk-local-chart";
const MAX_PAYLOAD = 15 * 1024 * 1024;

// Local, trusted bootstrap only. No user content is interpolated into this HTML.
const bootstrap = `
let lastStatus;
window.ReactNativeWebView={postMessage:function(message){
  try{const event=JSON.parse(message);if(event.type==='ready'||event.type==='error')lastStatus=message;}catch{}
  parent.postMessage({channel:'${CHANNEL}',message:message},'*');
}};
window.addEventListener('message',function(event){
  if(event.source!==parent)return;
  if(event.data&&event.data.kind==='hello'){
    if(lastStatus)window.ReactNativeWebView.postMessage(lastStatus);
    return;
  }
  window.StratDeskChartBridge?.receive(event.data);
});
document.addEventListener('click',function(event){
  const link=event.target?.closest?.('a');if(!link)return;
  try{const url=new URL(link.href);if(url.protocol!=='https:'||url.hostname!=='www.tradingview.com'||url.username||url.password)return;}catch{return;}
  event.preventDefault();
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'attribution'}));
});`;

/** Opaque sandbox + CSP: packaged chart code only, no network/session/storage access. */
export const WEB_CHART_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none';"><style>html,body,#chart{width:100%;height:100%;margin:0;padding:0;background:#0B1017;overflow:hidden;touch-action:pan-y}#chart{position:relative}</style></head><body><div id="chart" role="img" aria-label="Price chart"></div><script>${(bootstrap + "\n" + NATIVE_CHART_SCRIPT).replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

/**
 * Chart and page gestures have genuinely separate documents, not a partial
 * event barrier. Only bounded display updates/commands and parsed events cross.
 */
export function bindWebChartDocument(
  frame: HTMLIFrameElement,
  onController: (controller: WebChartController | null) => void,
  onEvent: (event: ChartSurfaceEvent) => void,
): () => void {
  const host = frame.ownerDocument.defaultView;
  if (!host) return () => {};
  let disposed = false;
  let ready = false;
  let latest: Parameters<WebChartController["update"]>[0] | undefined;
  const post = (kind: string, value?: unknown) => {
    if (disposed) return;
    try {
      frame.contentWindow?.postMessage({ kind, value }, "*");
    } catch {
      onEvent({
        type: "error",
        message: "The local chart display message could not be delivered.",
      });
    }
  };
  const update: WebChartController["update"] = (payload) => {
    if (disposed) return;
    try {
      if (JSON.stringify(payload).length > MAX_PAYLOAD) {
        onEvent({
          type: "error",
          message:
            "The chart display payload is too large. Hide the source image and retry.",
        });
        return;
      }
    } catch {
      onEvent({
        type: "error",
        message: "The chart display payload could not be encoded.",
      });
      return;
    }
    latest = payload;
    if (ready) post("update", payload);
  };
  const controller: WebChartController = {
    update,
    command: (command) => {
      if (ready) post("command", command);
    },
    destroy: () => {
      latest = undefined;
    },
    diagnostics: () => ({ isolatedDocument: true, ready }),
  };
  const receive = (event: MessageEvent) => {
    if (
      disposed ||
      event.source !== frame.contentWindow ||
      event.data?.channel !== CHANNEL ||
      typeof event.data.message !== "string"
    )
      return;
    const parsed = parseChartSurfaceEvent(event.data.message);
    if (!parsed) return;
    if (parsed.type === "ready") {
      ready = true;
      clearTimeout(timeout);
      if (latest) post("update", latest);
    } else if (parsed.type === "error") {
      // Initialization has already failed explicitly; do not add a misleading
      // second "not ready" timeout while the user is reviewing/retrying it.
      clearTimeout(timeout);
    }
    onEvent(parsed);
  };
  const hello = () => post("hello");
  const timeout = setTimeout(() => {
    if (!disposed && !ready)
      onEvent({
        type: "error",
        message: "The isolated chart did not become ready. Retry the chart.",
      });
  }, 15000);
  host.addEventListener("message", receive);
  frame.addEventListener("load", hello);
  onController(controller);
  hello();
  return () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    host.removeEventListener("message", receive);
    frame.removeEventListener("load", hello);
    controller.destroy();
    onController(null);
  };
}
