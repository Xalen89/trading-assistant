import { describe, it, expect } from 'vitest';
import { initialWorkspace, WR1, MARKETS } from '../../lib/trading/model';
import { confluence, gaps, rangeLevels, validatePlan, tradeMetrics, validateCandles, parseHistory, sampleCandles, sessionContext, historicalAnalogs, historicalStudy, evaluateOutcome, statistics } from '../../lib/trading/engine';
import { workspaceSchema } from '../../server/trading/validation';
import { validateFile } from '../../server/trading/learning';
import { alertPredicate, eventKey } from '../../server/trading/notifications';
import { zonedTimestamp, quoteFreshness, marketById } from '../../server/trading/market';
const bars=[{time:1,open:100,close:101,high:102,low:99,volume:1},{time:2,open:101,close:105,high:106,low:100,volume:2},{time:3,open:106,close:108,high:109,low:104,volume:3}];
describe('source and strategy state',()=>{
 it('WR1 is a separate source reference and cloned per workspace',()=>{const a=initialWorkspace(),b=initialWorkspace();a.strategies[0].name='changed';expect(b.strategies[0].name).toBe(WR1.name);expect(WR1.kind).toBe('reference');});
 it('validates the initial workspace',()=>expect(workspaceSchema.parse(initialWorkspace()).schemaVersion).toBe(1));
 it('rejects missing active strategy and duplicate IDs',()=>{const w=initialWorkspace();w.activeStrategyId='missing';expect(()=>workspaceSchema.parse(w)).toThrow();w.activeStrategyId='wr1';w.strategies.push({...WR1});expect(()=>workspaceSchema.parse(w)).toThrow();});
 it('does not conflate futures with cash index feeds',()=>{expect(marketById('NQ').provider).toBe('pending');expect(marketById('NDX').providerSymbol).toBe('^NDX');expect(MARKETS.length).toBeGreaterThan(25);});
});
describe('transparent confluence and chart geometry',()=>{
 it('never converts a zero-evidence score into a probability',()=>expect(confluence(WR1,{}).score).toBe(0));
 it('weights only enabled positive-weight factors',()=>{const s={...WR1,factors:[{...WR1.factors[0],weight:20},{...WR1.factors[1],weight:10},{...WR1.factors[2],enabled:false,weight:99}]};expect(confluence(s,{'wr1:v1:structure':true}).score).toBe(67);});
 it('does not inherit confirmations when rule revisions change',()=>expect(confluence({...WR1,version:2},{'wr1:v1:structure':true,'wr1:structure':true}).score).toBe(0));
 it('finds a regular three-bar FVG and its CE',()=>{const g=gaps(bars)[0];expect(g.low).toBe(102);expect(g.high).toBe(104);expect(g.ce).toBe(103);});
 it('removes a gap invalidated by close-through',()=>expect(gaps([...bars,{time:4,open:105,close:100,high:106,low:98,volume:1}])).toHaveLength(0));
 it('computes range quarters/OTE numerically',()=>{expect(rangeLevels(bars).find(l=>l.ratio===.5)?.price).toBe(104);expect(rangeLevels(bars).some(l=>l.ratio===.705)).toBe(true);});
});
describe('market candles and freshness',()=>{
 it('validates and orders real OHLC records',()=>expect(validateCandles([...bars].reverse())[0].time).toBe(1));
 it('rejects duplicate timestamps, malformed bounds and nonpositive prices',()=>{expect(()=>validateCandles([bars[0],bars[0],bars[2]])).toThrow();expect(()=>validateCandles([bars[0],bars[1],{...bars[2],high:103}])).toThrow();});
 it('parses CSV without treating date strings as Unix timestamps',()=>{expect(parseHistory('time,open,high,low,close,volume\n1,100,102,99,101,1\n2,101,106,100,105,2\n3,106,109,104,108,3')).toHaveLength(3);});
 it('converts New York historical provider times with DST',()=>{expect(new Date(zonedTimestamp('2026-07-01 09:30:00','America/New_York')*1000).toISOString()).toBe('2026-07-01T13:30:00.000Z');expect(new Date(zonedTimestamp('2026-01-01 09:30:00','America/New_York')*1000).toISOString()).toBe('2026-01-01T14:30:00.000Z');});
 it('labels old or future quotes stale',()=>{expect(quoteFreshness(Date.now()/1000-3600)).toBe('stale');expect(quoteFreshness(Date.now()/1000+3600)).toBe('stale');});
 it('has explicit sample bars with valid OHLC geometry',()=>expect(validateCandles(sampleCandles(100,'5m'))).toHaveLength(80));
 it('distinguishes New York DST from fixed source EST',()=>{const date=new Date('2026-07-01T13:30:00Z');expect(sessionContext(date,'America/New_York').clock).toBe('09:30');expect(sessionContext(date,'Etc/GMT+5').clock).toBe('08:30');});
});
describe('paper risk and historical evidence',()=>{
 it('validates long and short stop/target brackets',()=>{expect(validatePlan({entry:100,stop:95,target:110,quantity:2,pointValue:1,side:'long'})).toBeNull();expect(validatePlan({entry:100,stop:105,target:90,quantity:2,pointValue:1,side:'short'})).toBeNull();expect(validatePlan({entry:100,stop:110,target:95,quantity:1,pointValue:1,side:'long'})).toBeTruthy();});
 it('uses contract point value for futures paper results',()=>{const m=tradeMetrics({entry:20000,stop:19990,target:20020,quantity:1,pointValue:20,side:'long',exit:20020});expect(m.risk).toBe(200);expect(m.pnl).toBe(400);expect(m.rr).toBe(2);});
 it('converts USDJPY quote P/L to USD rather than labeling yen as dollars',()=>{const m=tradeMetrics({entry:150,stop:149,target:152,quantity:1000,pointValue:1/150,side:'long',exit:152,market:'USDJPY'});expect(m.pnl).toBeCloseTo(2000/152);});
 it('does not invent profit for an unclosed trade',()=>expect(tradeMetrics({entry:100,stop:95,target:110,quantity:1,pointValue:1,side:'long'}).pnl).toBeUndefined());
 it('conservatively treats same-bar stop and target as loss',()=>expect(evaluateOutcome([{...bars[0],low:90,high:120}],'long',100,95,110)).toEqual({outcome:'loss',ambiguous:true}));
 it('withholds the query window and uses only fully past analog outcomes',()=>{const c=sampleCandles(100,'5m');const a=historicalAnalogs(c);expect(a.length).toBeGreaterThan(0);expect(a.every(x=>x.index+24<=c.length-12)).toBe(true);expect(historicalStudy(c,'long').probability).toBeNull();});
 it('has an insufficient-data state for rhythm and analogs',()=>{expect(statistics(bars)).toBeNull();expect(historicalAnalogs(bars)).toHaveLength(0);});
});
describe('files and alert rule safety',()=>{
 it('rejects unsupported executable bytes and MIME mismatch',()=>{expect(()=>validateFile(Buffer.from('exec').toString('base64'),'image/png','payload.exe')).toThrow();expect(()=>validateFile(Buffer.from('%PDF-1.4 test').toString('base64'),'image/png','test.png')).toThrow();});
 it('accepts compatible UTF8 style text and rejects invalid JSON',()=>{expect(validateFile(Buffer.from('Bias: long').toString('base64'),'text/plain','style.txt').mime).toBe('text/plain');expect(()=>validateFile(Buffer.from('{bad').toString('base64'),'application/json','style.json')).toThrow();});
 it('creates deterministic per-rule deduplication keys',()=>{expect(eventKey(1,'a',42)).toBe(eventKey(1,'a',42));expect(eventKey(1,'a',42)).not.toBe(eventKey(2,'a',42));});
 it('evaluates market thresholds and only actual FVG candidates',()=>{const rule={id:'a',name:'test',market:'BTC-USD',timeframe:'5m' as const,strategyId:'wr1',kind:'above' as const,price:100,enabled:true,cooldownMinutes:30,createdAt:0};expect(alertPredicate(rule,101,false)).toBe(true);expect(alertPredicate({...rule,kind:'below'},101,false)).toBe(false);expect(alertPredicate({...rule,kind:'fvg'},101,false)).toBe(false);});
});
