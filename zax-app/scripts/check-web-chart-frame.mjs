import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";

// Deliberately isolated synthetic UI fixture. No owner session, API or order.
const result = await build({
  stdin: {
    contents: `
import React from "react";
import {createRoot} from "react-dom/client";
import {ScrollView,View,Text} from "react-native-web";
import LightweightSurface from "./components/trading/lightweight-surface.web";
const events=[];
const candles=Array.from({length:80},(_,i)=>{const close=81000+i*4+Math.sin(i/3)*50;return {time:1640000000+i*300,open:close-20,close,low:close-50,high:close+50,volume:1};});
const payload={key:"UNIT:5m:SYNTHETIC",precision:2,candles,lines:[],zones:[],priceLines:[{id:"entry",price:81200,label:"PAPER ENTRY UNIT",color:"#8ec5ff",origin:"paper",paperTone:"entry"},{id:"working-stop",price:81400,label:"WORKING SL UNIT",color:"#ff8a9a",origin:"paper",paperTone:"stop"},{id:"working-target",price:80800,label:"WORKING TP UNIT",color:"#72e6be",origin:"paper",paperTone:"target"}],ghost:[],ghostLine:[],scenarioStyle:"both",sourceLabel:"SYNTHETIC UI TEST ONLY",messages:[]};
const ref=React.createRef();
window.frameFixture={events,ref};
function App(){return React.createElement(ScrollView,{style:{height:'100vh',backgroundColor:'#0B1017'}},
React.createElement(View,{nativeID:'outside-touch',style:{height:80,padding:12}},React.createElement(Text,{style:{color:'#E5EDF5'}},'SYNTHETIC RN WEB + ISOLATED CHART TOUCH TEST — NO ACCOUNT / ORDERS')),
React.createElement(LightweightSurface,{payload,height:360,ref,onEvent:e=>events.push(e)}),
React.createElement(View,{nativeID:'below-chart',style:{height:700,padding:15}},React.createElement(Text,{style:{color:'#E5EDF5'}},'PAGE SCROLL REGION')));}
createRoot(document.getElementById('root')).render(React.createElement(App));
`,
    resolveDir: process.cwd(),
    sourcefile: "isolated-web-frame-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  minify: false,
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": process.cwd() },
  write: false,
});
await mkdir("artifacts/lightweight-chart-check", { recursive: true });
await writeFile(
  "artifacts/lightweight-chart-check/iframe.html",
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%;background:#0B1017}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
);
console.log(
  "Synthetic iframe + RN Web fixture: artifacts/lightweight-chart-check/iframe.html",
);
