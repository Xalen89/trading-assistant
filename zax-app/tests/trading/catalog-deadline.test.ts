import {describe,it,expect,vi} from 'vitest';
import {PATTERN_CATALOG,candleShapeObservations} from '../../lib/trading/pattern-catalog';
import {boundedRequest} from '../../lib/trading/request-deadline';
const bar=(open:number,high:number,low:number,close:number,time=1_700_000_000)=>({time,open,high,low,close,volume:1});
describe('reference catalog and closed candle shapes',()=>{
 it('has unique, source-qualified entries and explicit support, not fake images',()=>{expect(PATTERN_CATALOG.length).toBeGreaterThan(40);expect(new Set(PATTERN_CATALOG.map(p=>p.id)).size).toBe(PATTERN_CATALOG.length);expect(PATTERN_CATALOG.every(p=>p.definition&&p.source&&p.support)).toBe(true);expect(PATTERN_CATALOG.find(p=>p.id==='rdrb')?.support).toContain('Manual');});
 it('does not declare doji direction or equate morphology with a complete setup',()=>{const x=candleShapeObservations([bar(100,105,95,100.5)]);expect(x).toContainEqual(expect.objectContaining({name:'Doji shape',side:'neutral'}));});
 it('checks strict engulfing and excludes endpoint equality',()=>{expect(candleShapeObservations([bar(102,103,98,99),bar(98,104,97,103,1_700_000_060)]).some(x=>x.name==='Bullish engulfing shape')).toBe(true);expect(candleShapeObservations([bar(102,103,98,99),bar(99,104,98,102,1_700_000_060)]).some(x=>x.name.includes('engulfing'))).toBe(false);});
});
describe('finite proposal waiting',()=>{
 it('returns immediate work and clears its timer',async()=>{await expect(boundedRequest(Promise.resolve('proposal'),5000,'timeout')).resolves.toBe('proposal');});
 it('stops endless waiting and ignores late completion',async()=>{vi.useFakeTimers();try{let resolve!:(v:string)=>void;const task=new Promise<string>(r=>{resolve=r;});const result=boundedRequest(task,35000,'Retry: no paper order created');const checked=expect(result).rejects.toThrow('Retry');await vi.advanceTimersByTimeAsync(35000);await checked;resolve('late proposal');await vi.runAllTimersAsync();}finally{vi.useRealTimers();}});
});
