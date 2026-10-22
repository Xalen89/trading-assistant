// Read-only browser fixture validation. Never opens account/production pages.
const tabs = await (await fetch("http://localhost:9222/json/list")).json();
const tab = tabs.find(
  (x) =>
    x.type === "page" &&
    /^https:\/\/8766-/.test(x.url) &&
    x.url.endsWith("/iframe.html"),
);
if (!tab) throw new Error("Open the isolated iframe fixture first");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
const errors = [];
const contexts = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  if (msg.method === "Runtime.exceptionThrown")
    errors.push(msg.params.exceptionDetails.text);
  if (msg.method === "Runtime.executionContextCreated")
    contexts.push(msg.params.context);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    msg.error ? reject(Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const rpc = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(method + " timed out"));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression, contextId) => {
  const result = await rpc("Runtime.evaluate", {
    expression,
    returnByValue: true,
    ...(contextId ? { contextId } : {}),
  });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const touch = (type, points) =>
  rpc("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map(([id, x, y]) => ({ id, x, y })),
  });
try {
  await rpc("Runtime.enable");
  await rpc("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await rpc("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  await rpc("Page.reload", { ignoreCache: true });
  await delay(1200);
  const parent = await evaluate(
    `(()=>{const f=document.querySelector('iframe');let opaque=false;try{opaque=f.contentDocument===null;}catch{opaque=true;}return {events:window.frameFixture?.events,sandbox:f?.getAttribute('sandbox'),opaque,frame:f?.getBoundingClientRect().toJSON()};})()`,
  );
  if (!parent.events?.some((e) => e.type === "ready"))
    throw Error("Chart bridge did not report ready");
  if (!parent.opaque || parent.sandbox !== "allow-scripts")
    throw Error("Chart does not have the expected opaque sandbox");
  const y = parent.frame.top + 90;
  // Vertical chart swipe should chain to the outer RN Web scroll container.
  const beforeScroll = await evaluate(
    "document.getElementById('root').firstElementChild.scrollTop",
  );
  await touch("touchStart", [[20, 180, y + 100]]);
  await touch("touchMove", [[20, 180, y + 60]]);
  await delay(40);
  await touch("touchMove", [[20, 180, y + 20]]);
  await delay(40);
  await touch("touchMove", [[20, 180, y - 20]]);
  await touch("touchEnd", []);
  await delay(180);
  const afterScroll = await evaluate(
    "document.getElementById('root').firstElementChild.scrollTop",
  );
  await evaluate(
    "document.getElementById('root').firstElementChild.scrollTop=0",
  );
  await delay(100);
  // Chart-first mixed lifecycle: A chart, B page, B end while A remains.
  await touch("touchStart", [[1, 80, y]]);
  await touch("touchStart", [
    [1, 80, y],
    [2, 150, 25],
  ]);
  await touch("touchEnd", [[1, 80, y]]);
  await touch("touchEnd", []);
  // Reverse mixed lifecycle: page finger first, chart finger joins then ends.
  await touch("touchStart", [[3, 120, 25]]);
  await touch("touchStart", [
    [3, 120, 25],
    [4, 150, y],
  ]);
  await touch("touchEnd", [[3, 120, 25]]);
  await touch("touchEnd", []);
  // Horizontal drag and two-finger pinch fully in chart.
  await touch("touchStart", [[5, 100, y]]);
  await touch("touchMove", [[5, 190, y + 2]]);
  await touch("touchEnd", []);
  await touch("touchStart", [
    [6, 100, y],
    [7, 220, y],
  ]);
  await touch("touchMove", [
    [6, 65, y],
    [7, 260, y],
  ]);
  await touch("touchEnd", []);
  await delay(100);
  // Tap actual data must produce the normal inspection event, not a paper order.
  await touch("touchStart", [[8, 180, y]]);
  await touch("touchEnd", []);
  await delay(100);
  const events = await evaluate("window.frameFixture.events");
  if (!events.some((e) => e.type === "inspect" && e.candle))
    throw Error("No actual source candle inspection received");
  if (events.some((e) => e.type === "error"))
    throw Error("Chart bridge rendering error");
  if (errors.some((e) => e.includes("Cannot find single active touch")))
    throw Error("Mixed-touch responder warning reproduced");
  console.log(
    JSON.stringify(
      {
        parent: { sandbox: parent.sandbox, opaque: parent.opaque, ready: true },
        verticalScrollPixels: afterScroll - beforeScroll,
        inspectEvents: events.filter((e) => e.type === "inspect").length,
        actualCandleInspections: events.filter(
          (e) => e.type === "inspect" && e.candle,
        ).length,
        chartErrors: events.filter((e) => e.type === "error"),
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await rpc("Emulation.setTouchEmulationEnabled", { enabled: false }).catch(
    () => {},
  );
  await rpc("Emulation.clearDeviceMetricsOverride").catch(() => {});
  ws.close();
}
