import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
// Isolated synthetic component fixture only: no owner/auth/data/order APIs.
const result = await build({
  stdin: {
    contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {View,Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {CandleChart} from './components/trading/candle-chart';
import {DEFAULT_SESSION_OVERLAY} from './lib/trading/chart-sessions';
const candles=Array.from({length:80},(_,i)=>{const close=100+i/10+Math.sin(i/3);return {time:Date.UTC(2026,9,15,7)/1000+i*900,open:close-.2,close,low:close-.8,high:close+.8,volume:1};});
function Fixture(){const [sessions,setSessions]=useState(DEFAULT_SESSION_OVERLAY);return <SafeAreaProvider><View style={{backgroundColor:'#0B1017',padding:12}}><Text style={{color:'#97A5B7',fontSize:10,marginBottom:12}}>SYNTHETIC CHART UI TEST ONLY · NO ACCOUNT OR ORDERS</Text><Text nativeID="session-state" style={{color:'#97A5B7',fontSize:10}}>{sessions.enabled?'Sessions enabled':'Sessions disabled'}</Text><CandleChart candles={candles} market="UNIT" timeframe="15m" precision={2} showFvg={false} showRanges={false} showLevels={false} future={false} sessionOverlay={sessions} onSessionOverlayChange={setSessions}/></View></SafeAreaProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`,
    resolveDir: process.cwd(),
    sourcefile: "session-chart-ui-fixture.tsx",
    loader: "tsx",
  },
  resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".json"],
  loader: { ".js": "jsx", ".ttf": "dataurl", ".png": "dataurl", ".webp": "dataurl" },
  alias: { "@": path.resolve(process.cwd()), "react-native": "react-native-web" },
  define: { __DEV__: "true", "process.env.NODE_ENV": '"development"', "process.env.EXPO_OS": '"web"' },
  jsx: "automatic",
  plugins: [{
    name: "expo-font-client-fixture",
    setup(api) {
      api.onResolve({ filter: /serverContext/ }, (args) => args.importer.includes("/expo-font/build/") ? { path: path.resolve("node_modules/expo-font/build/serverContext.js") } : undefined);
    },
  }],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  write: false,
});
await mkdir('artifacts/lightweight-chart-check',{recursive:true});
await writeFile('artifacts/lightweight-chart-check/session-ui.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;min-height:100%;background:#0B1017}body{font-family:system-ui}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
console.log('Synthetic actual chart UI fixture written.');
