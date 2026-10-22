import {describe,it,expect} from 'vitest';
import {paperPerformance} from '../../lib/trading/paper-performance';
import type {Trade,Quote} from '../../lib/trading/model';
const now=1700000000000;
const trade:Trade={id:'fixture',market:'BTC-USD',side:'long',status:'open',entry:100,stop:90,target:120,quantity:1,pointValue:1,strategyId:'fixture',strategyName:'Synthetic fixture',strategyVersion:1,factors:[],journal:{},createdAt:now};
const quote:Quote={symbol:'BTC-USD',price:110,change:0,timestamp:now/1000,source:'Synthetic unit quote',status:'live'};
describe('paper performance',()=>{
 it('marks actual supplied quote, not an invented open price',()=>expect(paperPerformance([trade],1000,[quote],now).openPnl).toBe(10));
 it('does not show partial aggregate P/L when quotes missing',()=>expect(paperPerformance([trade],1000,[],now).openPnl).toBeNull());
 it('rejects stale quote',()=>expect(paperPerformance([trade],1000,[{...quote,timestamp:(now-200000)/1000}],now).openPnl).toBeNull());
 it('rejects a live quote more than 30 seconds in the future',()=>expect(paperPerformance([trade],1000,[{...quote,timestamp:(now+30001)/1000}],now).openPnl).toBeNull());
 it('preserves USD base conversion',()=>{const t={...trade,market:'TL:9',valuationSymbol:'USDJPY',entry:150,stop:149,target:152,quantity:100};const p=paperPerformance([t],1000,[{...quote,symbol:t.market,price:151}],now);expect(p.openPnl).toBeCloseTo(100/151);});
 it('computes closed-trade day peak drawdown',()=>{const day=Math.floor(now/86400000)*86400000;const list=[{...trade,status:'closed' as const,exit:120,closedAt:day+1},{...trade,id:'b',status:'closed' as const,exit:90,closedAt:day+2}];expect(paperPerformance(list,1000,[],now).todayClosedDrawdownPct).toBeCloseTo(10/1020*100);});
 it('leaves undated closed drawdown unknown',()=>expect(paperPerformance([{...trade,status:'closed',exit:90}],1000,[],now).todayClosedDrawdownPct).toBeNull());
	 it('keeps partial cash separate from remaining floating P/L',()=>{const partial={...trade,initialRisk:100,initialQuantity:10,quantity:5,realizedPnl:50,events:[{id:'partial-unit',kind:'partial' as const,at:now-1000,price:110,quantity:5,pnl:50,note:'Synthetic unit partial'}]};const p=paperPerformance([partial],1000,[{...quote,price:115}],now);expect(p.balance).toBe(1050);expect(p.openPnl).toBe(75);expect(p.equity).toBe(1125);});
	 it('counts a closed partial-plus-final result once',()=>{const p=paperPerformance([{...trade,status:'closed',initialRisk:100,initialQuantity:10,quantity:5,realizedPnl:50,exit:115,closedAt:now,events:[{id:'partial-unit',kind:'partial',at:now-1000,quantity:5,pnl:50,note:'Synthetic'}]}],1000,[],now);expect(p.balance).toBe(1125);expect(p.openPnl).toBe(0);});
	 it('excludes a cancelled pre-fill plan from closed P/L, drawdown, and open risk',()=>{const cancelled={...trade,status:'cancelled',cancelledAt:now,exit:undefined,realizedPnl:0} as any as Trade;const p=paperPerformance([cancelled],1000,[],now);expect(p).toMatchObject({balance:1000,realized:0,openCount:0,openPnl:0,openRisk:0,todayClosedDrawdownPct:0});});
});
