import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
// Synthetic UI/renderer fixture only. No authentication, user records, source calls or orders.
const result = await build({
 stdin:{contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {View,Text,Pressable} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {CandleChart} from './components/trading/candle-chart';
const now=Date.now(), t=Math.floor(now/1000/300)*300;
const candle=(time,price)=>({time,open:price-.1,close:price,low:price-.8,high:price+.8,volume:0});
const candles=Array.from({length:80},(_,i)=>candle(t-(79-i)*300,100+i/30));
const ai={id:'ai-test',kind:'ai',label:'Synthetic AI test',market:'UNIT',sourceTimeframe:'1h',displayTimeframes:['5m','15m'],enabled:true,style:'both',anchorMode:'follow',color:'#8EC5FF',createdAt:now,forecast:{id:'f-test',kind:'ai-hypothetical',market:'UNIT',timeframe:'1h',model:'synthetic-unit-only',generatedAt:now,expiresAt:now+900000,anchorAt:t,anchorPrice:100,sourceLastClosedAt:t-3600,source:'SYNTHETIC UNIT ONLY',atr:2,direction:'up',thesis:'Unit hypothesis',assumptions:['Unit only'],invalidation:'Unit only',candles:Array.from({length:12},(_,i)=>candle(t+3600*(i+1),100+(i+1)/3)),probability:null,volumeMeaning:'display-placeholder-not-forecast'}};
const history={id:'h-test',kind:'historical',label:'Synthetic historical test',market:'UNIT',sourceTimeframe:'15m',displayTimeframes:['5m'],enabled:true,style:'both',anchorMode:'follow',color:'#F4C878',createdAt:now,scenario:{id:'h',anchorAt:t,anchorPrice:100,sourceAt:t-100000,source:'SYNTHETIC UNIT ONLY',strategyIds:[],strategyVersions:[],combination:'any',distance:0,explanation:'Synthetic past-source fixture',basis:'context-replay',candles:Array.from({length:12},(_,i)=>candle(t-100000+900*(i+1),100-(i+1)/4))}};
function Fixture(){const [frame,setFrame]=useState('5m'),[layers,setLayers]=useState([ai,history]);return <SafeAreaProvider><View style={{backgroundColor:'#0B1017',padding:12,gap:10}}><Text style={{color:'#97A5B7',fontSize:10}}>SYNTHETIC SCENARIO LAYER UI TEST ONLY · NO ACCOUNT OR ORDERS</Text><Text nativeID="layer-state" style={{color:'#97A5B7',fontSize:11}}>Chart {frame} · Enabled {layers.filter(l=>l.enabled&&l.displayTimeframes.includes(frame)).length}</Text><View style={{flexDirection:'row',gap:12}}>{['5m','15m'].map(f=><Pressable accessibilityRole="button" key={f} onPress={()=>setFrame(f)}><Text style={{color:'#D8F36A'}}>Chart {f}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={()=>setLayers(ls=>ls.map(l=>l.id==='h-test'?{...l,enabled:!l.enabled}:l))}><Text style={{color:'#F4C878'}}>Toggle history</Text></Pressable></View><CandleChart candles={candles} market="UNIT" timeframe={frame} precision={2} showFvg={false} showRanges={false} showLevels={false} future={false} sessionOverlay={{enabled:false,sessions:[]}} scenarioLayers={layers}/></View></SafeAreaProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`,resolveDir:process.cwd(),sourcefile:"scenario-chart-ui-fixture.tsx",loader:"tsx"},
 resolveExtensions:[".web.tsx",".web.ts",".web.js",".tsx",".ts",".js",".json"],
 loader:{".js":"jsx",".ttf":"dataurl",".png":"dataurl",".webp":"dataurl"},
 alias:{"@":path.resolve(process.cwd()),"react-native":"react-native-web"},
 define:{__DEV__:"true","process.env.NODE_ENV":'"development"',"process.env.EXPO_OS":'"web"'},jsx:"automatic",
 plugins:[{name:"expo-font-client-fixture",setup(api){api.onResolve({filter:/serverContext/},args=>args.importer.includes("/expo-font/build/")?{path:path.resolve("node_modules/expo-font/build/serverContext.js")}:undefined)}}],
 bundle:true,platform:"browser",format:"iife",target:"es2020",write:false,
});
await mkdir("artifacts/lightweight-chart-check",{recursive:true});
await writeFile("artifacts/lightweight-chart-check/scenario-ui.html",`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;min-height:100%;background:#0B1017}body{font-family:system-ui}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
console.log("Synthetic actual multi-layer chart UI fixture written.");
