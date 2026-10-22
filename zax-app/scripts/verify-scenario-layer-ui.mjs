import { mkdir, writeFile } from 'node:fs/promises';
// Restrict to an isolated synthetic fixture. No owner sessions, records, sources or orders.
const tab=(await(await fetch('http://localhost:9222/json/list')).json()).find(t=>t.type==='page'&&(t.url.includes('8766-')||t.url.startsWith('http://127.0.0.1:8766/'))&&t.url.endsWith('/scenario-ui.html'));
if(!tab)throw new Error('Open the synthetic scenario-ui.html fixture first.');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((res,rej)=>{socket.onopen=res;socket.onerror=rej});
let next=1;const pending=new Map();socket.onmessage=e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(new Error(JSON.stringify(v.error))):p.resolve(v.result)}};
function call(method,params={}){return new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'))},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))})}
async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const pause=()=>new Promise(r=>setTimeout(r,500));
const click=label=>ev(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`);
try{
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Page.reload',{ignoreCache:true});await new Promise(r=>setTimeout(r,1600));
 const clip=await ev(`(()=>{const e=document.querySelector('iframe');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);if(!clip||clip.width<50)throw new Error('Local chart iframe did not load.');
 const snap=async()=> (await call('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true})).data;
 const initial=await ev(`({state:document.getElementById('layer-state')?.textContent,body:document.body.textContent,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2})`);
 if(!initial.state.includes('Enabled 2')||!initial.body.includes('AI 1h')||!initial.body.includes('History 15m'))throw new Error('Both independent layer legends not visible.');
 const both=await snap();await click('Toggle history');await pause();const one=await snap();if(one===both)throw new Error('Hide history did not repaint the local chart.');
 await click('Toggle history');await pause();await click('Chart 15m');await pause();const frame=await ev(`({state:document.getElementById('layer-state').textContent,body:document.body.textContent})`);if(!frame.state.includes('Enabled 1')||frame.body.includes('History 15m · both'))throw new Error('Target-frame filtering did not work.');
 await click('Chart 5m');await pause();const restored=await ev(`document.getElementById('layer-state').textContent`);if(!restored.includes('Enabled 2'))throw new Error('Switching chart discarded a saved layer.');
 await click('Details');await pause();const details=await ev(`({sources:document.body.textContent.includes('TIMEFRAME SCENARIO LAYERS'),reanchor:document.body.textContent.includes('not refreshed analysis'),history:document.body.textContent.includes('Rebased/scaled')})`);if(!Object.values(details).every(Boolean))throw new Error('Layer source/connection details not reachable.');
 const report={at:new Date().toISOString(),scope:'Synthetic actual-component UI only; not owner or iPhone proof',initial:{state:initial.state,overflow:initial.overflow},differentBackground:true,targetFrame:frame.state,restored,details};if(initial.overflow)throw new Error('Chart layout overflowed phone width.');await mkdir('artifacts/lightweight-chart-check',{recursive:true});await writeFile('artifacts/lightweight-chart-check/scenario-ui-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{socket.close()}
