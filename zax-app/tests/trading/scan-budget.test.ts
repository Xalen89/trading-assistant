import {afterEach,describe,expect,it,vi} from 'vitest';
import type {AlertRule} from '../../lib/trading/model';
import {beforeDeadline,planBrokerScan,requestTimeout} from '../../server/trading/scan-budget';
const rule=(i:number,overrides:Partial<AlertRule>={}):AlertRule=>({id:`r${i}`,name:'test',market:`TL:${i+1}`,timeframe:'5m',strategyId:'wr1',kind:'above',price:1,enabled:true,cooldownMinutes:1,createdAt:0,...overrides});
afterEach(()=>vi.useRealTimers());
describe('bounded broker scans',()=>{
 it('bounds a 100-market configuration and exposes deferred markets',()=>{const p=planBrokerScan(Array.from({length:100},(_,i)=>rule(i)));expect(p.requestBudget).toBe(12);expect(p.deferredMarkets).toBe(88);expect(p.rules.length).toBe(12);});
 it('coalesces quotes and unique FVG timeframes per market',()=>{const rules=Array.from({length:100},(_,i)=>rule(i,{market:'TL:1',kind:i%2?'above':'fvg'}));const p=planBrokerScan(rules);expect(p.requestBudget).toBe(2);expect(p.rules.length).toBe(100);expect(p.deferredMarkets).toBe(0);});
 it('accounts for derived frames as their coalesced hourly and daily source calls',()=>{const p=planBrokerScan([rule(1,{market:'TL:1',kind:'fvg',timeframe:'4h'}),rule(2,{market:'TL:1',kind:'fvg',timeframe:'1h'}),rule(3,{market:'TL:1',kind:'fvg',timeframe:'1w'})]);expect(p.requestBudget).toBe(3);expect(p.rules.length).toBe(3);});
 it('rotates in actual processing order through a wraparound',()=>{const rules=Array.from({length:20},(_,i)=>rule(i));const p=planBrokerScan(rules,18,4);expect(p.rules.map(r=>r.market)).toEqual(['TL:19','TL:20','TL:1','TL:2']);expect(p.nextCursor).toBe(2);});
 it('rejects expired queued work and bounds a waiting dependency',async()=>{vi.useFakeTimers();const now=Date.now();expect(()=>requestTimeout(now-1)).toThrow();const waiting=beforeDeadline(new Promise(()=>{}),now+20);const check=expect(waiting).rejects.toThrow('Scan budget');await vi.advanceTimersByTimeAsync(20);await check;});
});
