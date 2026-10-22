import { Candle, Strategy, Trade, Timeframe } from './model';
import { utcMondayStart } from './timeframes';
export const SECONDS:Record<Timeframe,number> = {'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800};
export type Gap = {start:number;end:number;low:number;high:number;ce:number;side:'bullish'|'bearish'};
export function gaps(candles:Candle[]):Gap[] {
  const found:Gap[]=[];
  for(let i=2;i<candles.length;i++) { const a=candles[i-2],b=candles[i];
    if(b.low>a.high) found.push({start:i-2,end:i,low:a.high,high:b.low,ce:(a.high+b.low)/2,side:'bullish'});
    if(b.high<a.low) found.push({start:i-2,end:i,low:b.high,high:a.low,ce:(a.low+b.high)/2,side:'bearish'});
  }
  return found.filter(g=>!candles.slice(g.end+1).some(c=>g.side==='bullish'?c.close<g.low:c.close>g.high)).slice(-6);
}
export function rangeLevels(candles:Candle[]) { if(!candles.length) return []; const low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high)); return [0.25,0.375,0.5,0.618,0.625,0.705,0.75,0.79].map(r=>({ratio:r,price:low+(high-low)*r})); }
export function confirmationKey(strategy:Strategy,factorId:string){return `${strategy.id}:v${strategy.version}:${factorId}`;}
export function confluence(strategy:Strategy,confirmed:Record<string,boolean>) { const f=strategy.factors.filter(x=>x.enabled&&x.weight>0); const total=f.reduce((s,x)=>s+x.weight,0),met=f.filter(x=>confirmed[confirmationKey(strategy,x.id)]); const earned=met.reduce((s,x)=>s+x.weight,0); return {score:total?Math.round(100*earned/total):0,count:met.length,total:f.length,earned,possible:total}; }
export function validatePlan(t:Pick<Trade,'entry'|'stop'|'target'|'quantity'|'side'|'pointValue'>):string|null {
  if(![t.entry,t.stop,t.target,t.quantity,t.pointValue].every(v=>Number.isFinite(v)&&v>0)) return 'All prices, size and point value must be positive finite numbers.';
  if(t.side==='long'&&!(t.stop<t.entry&&t.target>t.entry)) return 'For a long: stop < entry < target.';
  if(t.side==='short'&&!(t.target<t.entry&&t.stop>t.entry)) return 'For a short: target < entry < stop.';
  return null;
}
export function tradeMetrics(t:Pick<Trade,'entry'|'stop'|'target'|'quantity'|'side'|'pointValue'|'exit'|'initialRisk'|'realizedPnl'|'initialQuantity'> & {market?:string;valuationSymbol?:string}) {
  const valuation=t.valuationSymbol||t.market;
  const usdBase=valuation==='USDJPY'||valuation==='USDCAD';
  const valueAt=(price:number)=>usdBase?1/price:t.pointValue;
  const distance=t.initialRisk?Math.max(t.side==='long'?t.entry-t.stop:t.stop-t.entry,0):Math.abs(t.entry-t.stop),risk=distance*t.quantity*valueAt(t.stop),reward=Math.abs(t.target-t.entry)*t.quantity*valueAt(t.target);
  const initialRisk=typeof t.initialRisk==='number'&&Number.isFinite(t.initialRisk)&&t.initialRisk>0?t.initialRisk:undefined;
  const realized=typeof t.realizedPnl==='number'&&Number.isFinite(t.realizedPnl)?t.realizedPnl:0;
  const originalRisk=initialRisk??risk;
  const pnl=t.exit===undefined?undefined:realized+(t.exit-t.entry)*(t.side==='long'?1:-1)*t.quantity*valueAt(t.exit);
  return {risk,reward,rr:originalRisk?reward/originalRisk:0,pnl,r:pnl===undefined?undefined:originalRisk?pnl/originalRisk:0};
}
export function statistics(c:Candle[]) {
  const returns=c.slice(1).map((x,i)=>Math.log(x.close/c[i].close));
  if(returns.length<30) return null;
  const mean=returns.reduce((s,v)=>s+v,0)/returns.length;
  const variance=returns.reduce((s,v)=>s+(v-mean)**2,0)/returns.length;
  const autocorr=variance?returns.slice(1).reduce((s,v,i)=>s+(v-mean)*(returns[i]-mean),0)/((returns.length-1)*variance):0;
  return {bars:c.length,volatility:Math.sqrt(variance)*100,autocorrelation:autocorr,momentum:(c.at(-1)!.close/c[0].close-1)*100,scope:'Descriptive lookback statistics. Not a forecast.'};
}
export function evaluateOutcome(c:Candle[],side:'long'|'short',entry:number,stop:number,target:number) {
  for(const bar of c) {const stopped=side==='long'?bar.low<=stop:bar.high>=stop;const won=side==='long'?bar.high>=target:bar.low<=target;
    if(stopped) return {outcome:'loss' as const,ambiguous:won}; // conservative when both touched
    if(won) return {outcome:'win' as const,ambiguous:false};
  } return {outcome:'unresolved' as const,ambiguous:false};
}
export function validateCandles(raw:unknown):Candle[] { if(!Array.isArray(raw)) throw new Error('Expected an array of OHLC candles.'); const c=raw.map((v:any)=>({time:Number(v.time),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.volume||0)}));
  if(c.length<3||c.length>10000||c.some(v=>![v.time,v.open,v.high,v.low,v.close,v.volume].every(Number.isFinite)||v.time<1||v.low<=0||v.high<v.low||v.high<Math.max(v.open,v.close)||v.low>Math.min(v.open,v.close)||v.volume<0)) throw new Error('Invalid OHLC data: need 3–10,000 positive bars with valid highs/lows and Unix-second timestamps.');
  c.sort((a,b)=>a.time-b.time); if(c.some((v,i)=>i>0&&v.time===c[i-1].time)) throw new Error('Duplicate candle timestamps.'); return c; }
export function parseHistory(text:string):Candle[] {if(text.trim().startsWith('[')) return validateCandles(JSON.parse(text));const lines=text.trim().split(/\r?\n/);const headers=lines.shift()!.split(',').map(v=>v.trim().toLowerCase());return validateCandles(lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[headers[i],v.trim()]))));}
export function sampleCandles(base:number,timeframe:Timeframe):Candle[] { const out:Candle[]=[];let price=base;const seconds=SECONDS[timeframe],now=Math.floor(Date.now()/1000),last=timeframe==='1w'?utcMondayStart(now)-seconds:Math.floor(now/seconds)*seconds-seconds,start=last-seconds*79;for(let i=0;i<80;i++){const open=price;const change=(Math.sin(i*1.31)*0.0014+Math.cos(i*0.35)*0.0017)*base;price=open+change;out.push({time:start+i*seconds,open,close:price,high:Math.max(open,price)+base*(0.0003+Math.abs(Math.sin(i))*0.0008),low:Math.min(open,price)-base*(0.0003+Math.abs(Math.cos(i))*0.0008),volume:100+Math.abs(Math.sin(i))*900});}return out;}
export function sessionContext(date:Date,timezone:string) { const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const h=Number(parts.find(x=>x.type==='hour')?.value),m=Number(parts.find(x=>x.type==='minute')?.value);const minute=h*60+m;const session=minute>=120&&minute<=195?'London I':minute>=240&&minute<=285?'London II':minute>=570&&minute<=675?'New York AM':'Outside WR1 window';return {session,active:session!=='Outside WR1 window',digitConfluence:[0,1,5,6,8].includes(m%10),clock:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}; }

export function historicalAnalogs(c:Candle[],window=12,horizon=12){
  if(c.length<window*3+horizon)return [];
  const shape=(bars:Candle[])=>{const start=bars[0].close;const values=bars.map(v=>Math.log(v.close/start));const norm=Math.sqrt(values.reduce((s,v)=>s+v*v,0))||1;return values.map(v=>v/norm);};
  const current=shape(c.slice(-window));const candidates:{index:number;distance:number;future:Candle[];at:number}[]=[];
  // All analog outcomes must end before the current query window begins.
  for(let i=0;i+window+horizon<=c.length-window;i+=3){const past=shape(c.slice(i,i+window));const distance=Math.sqrt(past.reduce((s,v,j)=>s+(v-current[j])**2,0)/window);candidates.push({index:i,distance,future:c.slice(i+window,i+window+horizon),at:c[i+window-1].time});}
  return candidates.sort((a,b)=>a.distance-b.distance).filter((a,i,list)=>list.slice(0,i).every(b=>Math.abs(a.index-b.index)>=window+horizon)).slice(0,5);
}
export function historicalStudy(c:Candle[],side:'long'|'short',stopFraction=0.005,targetFraction=0.01,window=12,horizon=12){
  if(stopFraction<=0||targetFraction<=0)throw new Error('Historical stop and target fractions must be positive.');
  const analogs=historicalAnalogs(c,window,horizon);const evaluated=analogs.map(a=>{const entry=c[a.index+window-1].close;const stop=entry*(1+(side==='long'?-1:1)*stopFraction),target=entry*(1+(side==='long'?1:-1)*targetFraction);return {...a,...evaluateOutcome(a.future,side,entry,stop,target)};});
  const resolved=evaluated.filter(a=>a.outcome!=='unresolved');return {samples:evaluated.length,resolved:resolved.length,wins:resolved.filter(a=>a.outcome==='win').length,hitRate:resolved.length?resolved.filter(a=>a.outcome==='win').length/resolved.length:null,analogs:evaluated,probability:null,warning:'Exploratory nearest-analog outcomes, no costs/slippage. Conservative loss when stop and target touch in one bar. Not a calibrated success probability or out-of-sample strategy validation.'};
}

export function previousCryptoDay(c:Candle[],timeframe:Timeframe,now=Date.now()){
  const end=Math.floor(now/86400000)*86400,start=end-86400;
  const bars=c.filter(b=>b.time>=start&&b.time<end);
  if(!bars.length||!c.length||c[0].time>start||c.at(-1)!.time+SECONDS[timeframe]<end)return null;
  return {high:Math.max(...bars.map(b=>b.high)),low:Math.min(...bars.map(b=>b.low)),start,end,source:'Previous UTC day · 24/7 crypto venue · actual supplied bars'};
}
