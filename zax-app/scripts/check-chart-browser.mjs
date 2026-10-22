import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
const result = await build({
  stdin: {
    contents: `
import { createLightweightController } from "./lib/trading/lightweight-controller";
import { buildSessionBoxes, DEFAULT_SESSION_OVERLAY } from "./lib/trading/chart-sessions";
const events=[]; const root=document.getElementById("chart");
const controller=createLightweightController(root,e=>events.push(e));
const candles=Array.from({length:80},(_,i)=>{const close=100+i/10+Math.sin(i/3);return {time:Date.UTC(2026,9,15,7)/1000+i*900,open:close-.2,close,low:close-.8,high:close+.8,volume:1};});
const points=candles.map((c,i)=>({time:c.time,value:40+20*Math.sin(i/10)}));
const rsi={id:"rsi",label:"RSI UNIT",pane:"rsi",color:"#d8f36a",segments:[points]};
const macd={id:"macd",label:"MACD UNIT",pane:"macd",color:"#8ec5ff",segments:[points.map((p,i)=>({...p,value:Math.sin(i/4)}))]};
const payload={key:"UNIT:5m:SYNTHETIC",precision:2,candles,lines:[rsi,macd],zones:[{id:"ob",from:candles[60].time,to:candles[70].time,low:104,high:107,ce:105.5,label:"OB CE UNIT",color:"#72e6be"}],priceLines:[{id:"setup",price:300,label:"Confirmed prior-swing sweep (synthetic)",origin:"level",color:"#f4c878"},{id:"sl",price:75,label:"SAVED SL UNIT",color:"#ff8a9a",origin:"paper",paperTone:"stop"},{id:"entry",price:106,label:"PAPER ENTRY UNIT",color:"#8ec5ff",origin:"paper",paperTone:"entry"},{id:"tp",price:135,label:"SAVED TP UNIT",color:"#72e6be",origin:"paper",paperTone:"target"}],ghost:[],ghostLine:[],scenarioStyle:"both",sourceLabel:"SYNTHETIC UI TEST ONLY",messages:[]};
const last=candles.at(-1); payload.forecastGhost=Array.from({length:12},(_,i)=>({time:last.time+(i+1)*900,open:108+i*.5,close:108.5+i*.5,high:109+i*.5,low:107+i*.5,volume:0}));payload.forecastLine=[{time:last.time,value:last.close},...payload.forecastGhost.map(c=>({time:c.time,value:c.close}))];payload.forecastStyle="both";payload.forecastLabel="HYPOTHETICAL FORECAST UNIT FIXTURE";
payload.sessionBoxes=buildSessionBoxes(candles,"15m",DEFAULT_SESSION_OVERLAY,last.time+900);payload.sessionInterval=900;
controller.update(payload);
window.chartTest={controller,payload,rsi,macd,events};
`,
    resolveDir: process.cwd(),
    sourcefile: "chart-test-entry.ts",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  minify: false,
  write: false,
});
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0d110f;color:#e8f0ea;font:12px monospace}h1{font:12px monospace;padding:12px;margin:0}#chart{width:100%;height:550px}</style></head><body><h1>ISOLATED CANVAS TEST · SYNTHETIC FIXTURES · NO ACCOUNT / ORDERS / MARKET CLAIMS</h1><div id="chart"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
await mkdir("artifacts/lightweight-chart-check", { recursive: true });
await writeFile("artifacts/lightweight-chart-check/index.html", html);
console.log(
  "Isolated canvas harness written: artifacts/lightweight-chart-check/index.html",
);
