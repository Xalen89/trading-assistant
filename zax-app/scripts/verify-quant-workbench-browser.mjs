import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Read-only CDP validation for the isolated temporary fixture only.
// It never opens production, Expo, API, account, broker, or order pages.
const CDP = "http://localhost:9222/json/list";
const RESULT_TIMEOUT_MS = 55_000; // Production service has a documented 45s data budget; fixture browser fetch caps at 52s.
const project = process.cwd();
const reportPath = resolve(project, "artifacts/quant-workbench-fixture/browser-check.json");

function isFixtureTabUrl(value) {
  try {
    const url = new URL(value);
    if (url.pathname !== "/quant-workbench.html") return false;
    const local = (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "8767";
    const sandbox = url.protocol === "https:" &&
      /^8767-[a-z0-9-]+\.us1\.manus\.computer$/i.test(url.hostname);
    return local || sandbox;
  } catch {
    return false;
  }
}

const tabs = await (await fetch(CDP)).json();
const candidates = tabs.filter((tab) => tab.type === "page" && isFixtureTabUrl(tab.url));
if (candidates.length !== 1) {
  throw new Error("Open exactly one /quant-workbench.html page served by the temporary port-8767 fixture, then rerun this checker.");
}
const tab = candidates[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  ws.addEventListener("open", resolveOpen, { once: true });
  ws.addEventListener("error", rejectOpen, { once: true });
});

let sequence = 0;
const pending = new Map();
const browserErrors = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    browserErrors.push(message.params.args.map((item) => item.value ?? item.description ?? "").join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text);
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id);
    clearTimeout(request.timer);
    pending.delete(message.id);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
  }
});

const rpc = (method, params = {}, timeout = 12_000) => new Promise((resolveRpc, rejectRpc) => {
  const id = ++sequence;
  const timer = setTimeout(() => {
    pending.delete(id);
    rejectRpc(new Error(`${method} timed out`));
  }, timeout);
  pending.set(id, { resolve: resolveRpc, reject: rejectRpc, timer });
  ws.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression, { awaitPromise = false, timeout = 12_000 } = {}) {
  const result = await rpc("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  }, timeout);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

const normalise = (value) => String(value || "").replace(/\s+/g, " ").trim();
const encoded = (value) => JSON.stringify(value);

function elementRectExpression(kind, label) {
  return `(() => {
    const wanted = ${encoded(label)};
    const normalise = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const buttonByLabel = () => [...document.querySelectorAll('[role="button"]')].find((node) =>
      normalise(node.getAttribute("aria-label")) === wanted ||
      normalise(node.innerText || node.textContent) === wanted ||
      [...node.querySelectorAll("*")].some((child) => normalise(child.textContent) === wanted),
    );
    let element;
    if (${encoded(kind)} === "button") {
      element = buttonByLabel();
    } else {
      const labels = [...document.querySelectorAll("*")].filter((node) =>
        node.children.length === 0 && normalise(node.textContent) === wanted,
      );
      for (const labelNode of labels) {
        const candidate = labelNode.parentElement?.querySelector("input,textarea");
        if (candidate) { element = candidate; break; }
      }
    }
    if (!element) throw new Error("Actual RN Web " + ${encoded(kind)} + " not found: " + wanted);
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) throw new Error("Actual RN Web " + ${encoded(kind)} + " is not visible: " + wanted);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  })()`;
}

async function mouseClick(kind, label) {
  const rect = await evaluate(elementRectExpression(kind, label));
  const touch = { x: rect.x, y: rect.y, id: 1, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 };
  // The required 375px emulation uses RN Web's touch interaction path; mouse events
  // render the target but do not activate this fixture's Pressable controls.
  await rpc("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
  await rpc("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function nextRender() {
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))", { awaitPromise: true });
}

async function waitForInteractiveDocument() {
  // Ready is emitted from the shell effect; wait for the following rendered frames before
  // sending a phone touch to the actual RN Web Pressable tree.
  await evaluate(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300))))",
    { awaitPromise: true },
  );
}

async function waitForFixtureTransition(name, expectedSequence, timeout = RESULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const transition = await evaluate(`(() => {
      const state = window.quantWorkbenchFixture;
      if (!state) throw new Error("Fixture state is missing.");
      if (${encoded(name)} === "quant-workbench-fixture-complete" && state.sequence > ${expectedSequence}) return state.lastCompletion;
      if (${encoded(name)} === "quant-workbench-fixture-ready" && state.ready) return { ready: true };
      if (${encoded(name)} === "quant-workbench-fixture-closed" && state.visible === false && state.closedAt) return { closed: true };
      if (${encoded(name)} === "quant-workbench-fixture-navigation" && state.navigation) return state.navigation;
      return null;
    })()`);
    if (transition) return transition;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 125));
  }
  throw new Error(`Timed out waiting for documented fixture transition: ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function renderedForm() {
  return evaluate(`(() => {
    const normalise = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const button = (label) => [...document.querySelectorAll('[role="button"]')].find((node) =>
      normalise(node.getAttribute("aria-label")) === label ||
      normalise(node.innerText || node.textContent) === label ||
      [...node.querySelectorAll("*")].some((child) => normalise(child.textContent) === label),
    );
    const frames = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
    const selectedFrame = frames.find((frame) => {
      const node = button(frame);
      return node && getComputedStyle(node).backgroundColor === "rgb(216, 243, 106)";
    }) || null;
    return {
      text: normalise(document.body.innerText),
      values: [...document.querySelectorAll("input,textarea")].map((node) => node.value),
      selectedFrame,
      visible: window.quantWorkbenchFixture?.visible,
    };
  })()`);
}

const starters = {
  pairs: { button: "Pairs / relative value", title: "Pairs / relative value", summary: "BTC-USD / ETH-USD · 1h · 900 requested bars", symbols: ["BTC-USD ×", "ETH-USD ×"], timeframe: "1h", bars: "900", values: ["60", "2", "0.5", "5", "0", "100000"] },
  momentum: { button: "Cross / time-series momentum", title: "Cross / time-series momentum", summary: "BTC-USD / ETH-USD · 1d · 900 requested bars", symbols: ["BTC-USD ×", "ETH-USD ×"], timeframe: "1d", bars: "900", values: ["60", "5", "0", "100000"] },
  making: { button: "Market making", title: "Market making", summary: "BTC-USD · actual venue book", symbols: ["BTC-USD ×"], timeframe: "1m", bars: "60", values: ["0", "0.01", "0.1"] },
  macro: { button: "Multi-asset trend research", title: "Multi-asset trend research", summary: "BTC-USD / ETH-USD · 1d · 900 requested bars", symbols: ["BTC-USD ×", "ETH-USD ×"], timeframe: "1d", bars: "900", values: ["60", "5", "0", "100000"] },
  ml: { button: "Forward-return classifier", title: "Forward-return classifier", summary: "BTC-USD · 1d · 900 requested bars", symbols: ["BTC-USD ×"], timeframe: "1d", bars: "900", values: ["60", "5", "0", "100000"] },
};

async function assertCollapsedStarter(name) {
  const expected = starters[name];
  const current = await renderedForm();
  const text = normalise(current.text).toLowerCase();
  assert(current.visible === true, `${name}: QuantWorkbench is not visibly open.`);
  assert(text.includes(expected.title.toLowerCase()), `${name}: family education title is not rendered.`);
  assert(text.includes("current inputs"), `${name}: collapsed Current inputs receipt is not rendered.`);
  assert(text.includes(expected.summary.toLowerCase()), `${name}: collapsed starter summary is not displayed.`);
  assert(text.includes("edit model / markets / settings"), `${name}: default form is not collapsed.`);
  assert(!text.includes("hide input controls"), `${name}: input controls unexpectedly start expanded.`);
}

async function assertExpandedStarter(name) {
  const expected = starters[name];
  const current = await renderedForm();
  const text = normalise(current.text).toLowerCase();
  assert(current.visible === true, `${name}: QuantWorkbench is not visibly open after expanding inputs.`);
  assert(text.includes("hide input controls"), `${name}: current inputs did not expand through the actual edit control.`);
  assert(text.includes("model family"), `${name}: expanded family controls are not rendered.`);
  expected.symbols.forEach((symbol) => assert(text.includes(symbol.toLowerCase()), `${name}: expanded starter symbol ${symbol} is not displayed.`));
  if (name === "making") {
    assert(!text.includes("bars (60–1,800)"), "making: historical Bars input is shown even though this current-book model does not use it.");
    assert(text.includes("timeframe, historical bars and ohlc imports are not used."), "making: current-book input scope is not displayed.");
  } else {
    assert(current.selectedFrame === expected.timeframe, `${name}: selected frame is ${current.selectedFrame || "none"}, expected ${expected.timeframe}.`);
    assert(current.values.includes(expected.bars), `${name}: starter Bars ${expected.bars} is not displayed.`);
  }
  expected.values.forEach((value) => assert(current.values.includes(value), `${name}: starter setting ${value} is not displayed.`));
}

async function runModel(name) {
  const prior = await evaluate("window.quantWorkbenchFixture.sequence");
  await mouseClick("button", "Run model");
  const result = await waitForFixtureTransition("quant-workbench-fixture-complete", prior);
  await nextRender();
  assert(result?.ok === true, `${name}: real fixture mutation failed: ${result?.error || "unknown error"}`);
  assert(result?.family === name || name === "ml-insufficient-data" && result?.family === "ml", `${name}: fixture completion returned ${result?.family || "no family"}, not the selected production model family.`);
  const rendered = await evaluate(`({ text: document.body.innerText, pending: document.body.innerText.includes("Running model…") })`);
  const renderedText = normalise(rendered.text).toLowerCase();
  assert(!rendered.pending, `${name}: model remained pending after finite completion event.`);
  assert(renderedText.includes("result received ·"), `${name}: actual result receipt did not render.`);
  assert(renderedText.includes("what the result means"), `${name}: result interpretation panel did not render.`);
  assert(renderedText.includes("model output available") || renderedText.includes("insufficient data") || renderedText.includes("unavailable"), `${name}: response status badge did not render.`);
  await mouseClick("button", "Show details");
  await nextRender();
  const details = normalise(await evaluate("document.body.innerText")).toLowerCase();
  assert(details.includes("run details") && details.includes("coinbase exchange"), `${name}: expanded result receipt does not show public Coinbase provenance.`);
  return result;
}

async function replaceBarsWithSixty() {
  const rect = await evaluate(elementRectExpression("input", "Bars (60–1,800)"));
  const touch = { x: rect.x, y: rect.y, id: 1, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 };
  await rpc("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
  await rpc("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
  await rpc("Input.insertText", { text: "60" });
  await nextRender();
  const values = await evaluate("[...document.querySelectorAll('input,textarea')].map((node) => node.value)");
  assert(values.includes("60"), "ML insufficient-data probe did not update the actual Bars input to 60.");
}

const report = {
  fixtureUrl: tab.url,
  viewport: { width: 375, height: 812 },
  families: [],
  insufficientProbe: null,
  askAiCoach: null,
  browserErrors: [],
};

try {
  await rpc("Runtime.enable");
  await rpc("Page.enable");
  await rpc("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const loaded = new Promise((resolveLoad, rejectLoad) => {
    const timer = setTimeout(() => { ws.removeEventListener("message", listener); rejectLoad(new Error("Fixture page did not finish loading within 12 seconds.")); }, 12000);
    const listener = event => { const message = JSON.parse(event.data); if (message.method === "Page.loadEventFired") { clearTimeout(timer); ws.removeEventListener("message", listener); resolveLoad(); } };
    ws.addEventListener("message", listener);
  });
  await rpc("Page.reload", { ignoreCache: true });
  await loaded;
  await waitForFixtureTransition("quant-workbench-fixture-ready", 0, 8_000);
  await waitForInteractiveDocument();

  const identity = await evaluate("window.quantWorkbenchFixture.label");
  assert(identity === "UI fixture only — not a real owner, account, or broker session", "Fixture workspace identity is not explicitly labelled as a non-owner UI fixture.");

  // The default pairs starter must be runnable without expanding any inputs.
  await assertCollapsedStarter("pairs");
  const defaultPairs = await runModel("pairs");
  report.families.push({ family: "pairs", status: defaultPairs.status, symbols: ["BTC-USD", "ETH-USD"], timeframe: "1h", defaultRunWhileCollapsed: true });

  // Family switching intentionally lives behind the current UI's one explicit edit control.
  await mouseClick("button", "Edit model / markets / settings");
  await nextRender();
  await assertExpandedStarter("pairs");

  for (const name of ["momentum", "making", "macro", "ml"]) {
    const expected = starters[name];
    await mouseClick("button", expected.button);
    await nextRender();
    await assertExpandedStarter(name);
    const result = await runModel(name);
    report.families.push({ family: name, status: result.status, symbols: expected.symbols.map((value) => value.replace(" ×", "")), timeframe: expected.timeframe });
  }

  // This is a real parsed request for only 60 public BTC daily bars. The production ML
  // model's documented minimum eligible-outcome gate must produce an actionable insufficient-data result.
  await replaceBarsWithSixty();
  const insufficient = await runModel("ml-insufficient-data");
  assert(insufficient.status === "insufficient-data", `ML 60-bar probe returned ${insufficient.status}; expected a real insufficient-data result.`);
  const insufficientText = await evaluate("document.body.innerText");
  assert(insufficientText.includes("This run needs attention"), "Insufficient result lacks the actionable attention heading.");
  assert(insufficientText.includes("No current candidate"), "Insufficient result lacks the no-candidate state.");
  assert(insufficientText.includes("Data requirements"), "Insufficient result does not expose data requirements after opening actual details control.");
  report.insufficientProbe = { family: "ml", bars: 60, status: insufficient.status, actionableDetails: true };

  await mouseClick("button", "Ask AI Coach");
  const [closeEvent, navigation] = await Promise.all([
    waitForFixtureTransition("quant-workbench-fixture-closed", 0, 8_000),
    waitForFixtureTransition("quant-workbench-fixture-navigation", 0, 8_000),
  ]);
  await nextRender();
  assert(closeEvent, "Ask AI Coach did not close the actual workbench modal.");
  assert(navigation?.pathname === "/coach", "Ask AI Coach did not call the mocked ExpoRouter navigation callback for /coach.");
  assert(typeof navigation?.params?.question === "string" && navigation.params.question.includes("Explain my most recent"), "Ask AI Coach navigation callback did not receive its explanatory question.");
  const visible = await evaluate("window.quantWorkbenchFixture.visible");
  assert(visible === false, "Ask AI Coach navigation did not leave the actual modal closed.");
  report.askAiCoach = { modalClosed: true, pathname: navigation.pathname, receivedQuestion: true };

  const safety = await evaluate(`(() => {
    const allowed = new Set(["BTC-USD", "ETH-USD"]);
    const rows = window.quantWorkbenchFixture.mutations || [];
    return {
      allAllowed: rows.every((row) => row.endpoint === "/fixture-api/quant/run" && !row.request.imports && row.request.symbols.every((symbol) => allowed.has(symbol))),
      count: rows.length,
    };
  })()`);
  assert(safety.allAllowed, "Fixture recorded a non-local endpoint, import, or symbol outside BTC-USD/ETH-USD.");
  report.mutationCount = safety.count;
  report.browserErrors = browserErrors;
  assert(browserErrors.length === 0, `Browser reported runtime errors: ${browserErrors.join(" | ")}`);

  await mkdir(resolve(project, "artifacts/quant-workbench-fixture"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rpc("Emulation.clearDeviceMetricsOverride").catch(() => {});
  ws.close();
}
