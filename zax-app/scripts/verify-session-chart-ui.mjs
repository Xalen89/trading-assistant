import { mkdir, writeFile } from 'node:fs/promises';
// Only the isolated synthetic fixture is inspected. No owner page, records or orders.
const tabs = await (await fetch('http://localhost:9222/json/list')).json();
const tab = tabs.find((item) => item.type === 'page' && item.url.includes(':') && item.url.includes('8766-') && item.url.endsWith('/session-ui.html'));
if (!tab) throw new Error('Open the synthetic session-ui.html fixture first.');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let next = 1;
const pending = new Map();
socket.onmessage = (event) => { const value = JSON.parse(event.data); const waiter = pending.get(value.id); if (waiter) { pending.delete(value.id); value.error ? waiter.reject(new Error(JSON.stringify(value.error))) : waiter.resolve(value.result); } };
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = next++; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000); pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression, contextId) { const result = await call('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description); return result.result.value; }
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));
try {
  await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await call('Page.reload', {ignoreCache:true});
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await pause();
  const clip = await evaluate(`(()=>{const e=document.querySelector('iframe');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
  if (!clip || clip.width <= 0 || clip.height <= 0) throw new Error('Actual isolated chart iframe not ready.');
  const canvasSnapshot = async () => (await call('Page.captureScreenshot', {format:'png',clip,captureBeyondViewport:true})).data;
  const before = await canvasSnapshot();
  const initial = await evaluate(`({state:document.getElementById('session-state')?.textContent,checked:document.querySelector('[aria-label="Session background boxes"]')?.getAttribute('aria-checked'),width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})`);
  await evaluate(`document.querySelector('[aria-label="Session background boxes"]').click()`);
  await pause();
  const disabled = await evaluate(`document.getElementById('session-state').textContent`);
  const after = await canvasSnapshot();
  if (disabled !== 'Sessions disabled') throw new Error('Actual Sessions control did not update parent preference.');
  if (before === after) throw new Error('Session switch did not repaint chart background pixels.');
  await evaluate(`document.querySelector('[aria-label="Session background boxes"]').click()`);
  await pause();
  const restored = await canvasSnapshot();
  if (restored !== before) throw new Error('Re-enabling Sessions did not restore the original background.');
  const final = await evaluate(`document.getElementById('session-state').textContent`);
  if (final !== 'Sessions enabled') throw new Error('Session toggle did not restore enabled state.');
  await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.trim()==='Details').click()`);
  await pause();
  const details = await evaluate(`({hasTitle:document.body.textContent.includes('SESSION BACKGROUNDS'),hasTokyo:document.body.textContent.includes('Asia/Tokyo'),hasNY:document.body.textContent.includes('America/New_York'),hasSydney:document.body.textContent.includes('Australia/Sydney')})`);
  if (!Object.values(details).every(Boolean)) throw new Error('Session details/individual schedules are not reachable.');
  const result = { type: 'Synthetic actual-component test only, not owner/iPhone verification', at: new Date().toISOString(), initial, disabled, final, backgroundPixelsChanged: true, backgroundRestored: true, details, chartRegion:clip };
  await mkdir('artifacts/lightweight-chart-check', {recursive:true});
  await writeFile('artifacts/lightweight-chart-check/session-ui-check.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally { socket.close(); }
