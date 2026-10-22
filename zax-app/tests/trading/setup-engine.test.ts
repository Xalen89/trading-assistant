import {describe, expect, it} from 'vitest';
import type {Candle, Market, Strategy} from '../../lib/trading/model';
import type {SetupInput} from '../../lib/trading/setup-model';
import {analyzeSetups, proposePaper} from '../../lib/trading/setup-engine';
import {SETUP_PRESETS, resolveSetupFamily} from '../../lib/trading/setup-presets';

const UNIT_BASE=1_800_000_000; // Synthetic unit-fixture epoch only; never app/demo data.
const candle=(time:number,open:number,high:number,low:number,close:number):Candle => ({time,open,high,low,close,volume:100});
const core=SETUP_PRESETS.find(strategy=>strategy.id==='core-sequence')!;
const market:Market={id:'USDJPY',name:'UNIT USD / Japanese Yen',category:'Forex',provider:'fmp',providerSymbol:'USDJPY',precision:3,pointValue:1,paperSupported:true};

function sequenceCandles():Candle[] {
  const bars:Candle[]=[];
  for(let index=0;index<20;index++) bars.push(candle(UNIT_BASE+index*300,100,101,99,100));
  bars[5]=candle(UNIT_BASE+5*300,100,101,95,100); // confirmed low only after indices 6–7 close
  bars[10]=candle(UNIT_BASE+10*300,99.5,100.5,94,100.5); // sell-side sweep and rejection
  bars[11]=candle(UNIT_BASE+11*300,100,101,98.5,99); // last opposite OB body
  bars[12]=candle(UNIT_BASE+12*300,102,106,102,105); // valid > prior ATR body, MSS, and FVG vs index 10
  bars[13]=candle(UNIT_BASE+13*300,105,107,104,106);
  bars[14]=candle(UNIT_BASE+14*300,106,106,101,102); // later FVG CE retest
  for(let index=15;index<20;index++) bars[index]=candle(UNIT_BASE+index*300,103,105,102,104);
  return bars;
}
function bullishHourly():Candle[] { return Array.from({length:6},(_,index)=>candle(UNIT_BASE-(8-index)*3600,100+index,102+index,99+index,101+index)); }
function daily():Candle[] { return [
  candle(UNIT_BASE-3*86400,98,102,97,100),
  candle(UNIT_BASE-2*86400,100,107,99,105),
]; }
function input(overrides:Partial<SetupInput>={}):SetupInput {
  const candles=sequenceCandles().slice(0,15);
  const base:SetupInput={market,timeframe:'5m',candles,daily:daily(),hourly:bullishHourly(),strategies:[core],patterns:[],combination:'any',timezone:'Etc/UTC',now:UNIT_BASE+20*300+600,source:'UNIT closed candles',dailySource:'UNIT provider daily',hourlySource:'UNIT hourly'};
  return {...base,...overrides,patterns:overrides.patterns??base.patterns};
}

describe('setup engine — deterministic synthetic UNIT fixtures',()=>{
  it('uses only closed past bars and a pivot only after its confirmation bars',()=>{
    const base=input(), future=candle(base.now as number,200,250,1,240);
    const result=analyzeSetups({...base,candles:[...base.candles,future]});
    expect(result.candles.some(bar=>bar.time===future.time)).toBe(false);
    const candidate=result.candidates.find(item=>item.strategyId==='core-sequence'&&item.side==='long')!;
    expect(candidate.steps.find(item=>item.id==='liquidity-sweep')?.status).toBe('met');
    expect(candidate.steps.find(item=>item.id==='retest')?.status).toBe('met');
    expect(candidate.ready).toBe(true);
  });

  it('excludes an unclosed future hourly candle instead of using it as HTF direction',()=>{
    const bearish=Array.from({length:6},(_,index)=>candle(UNIT_BASE-(8-index)*3600,110-index,111-index,108-index,109-index));
    const futureBull=candle(UNIT_BASE+20*300,90,140,89,139);
    const result=analyzeSetups(input({hourly:[...bearish,futureBull]}));
    const long=result.candidates.find(item=>item.side==='long')!;
    expect(long.steps.find(item=>item.id==='htf-context')?.status).toBe('failed');
    expect(long.steps.find(item=>item.id==='htf-context')?.evidence).toContain('Bearish');
  });

  it('conditions retrieval on selected supported source models and leaves WR1/custom rules unknown',()=>{
    const custom:Strategy={...core,id:'wr1',name:'WR1 discretionary catalog',source:'UNIT arbitrary source'};
    const result=analyzeSetups(input({strategies:[custom]}));
    expect(resolveSetupFamily(custom)).toBe('custom');
    expect(result.selectedStrategyIds).toEqual(['wr1']);
    expect(result.candidates).toEqual([]);
    expect(result.messages.join(' ')).toContain('not automatically marked met');
    expect(result.scenario).toBeUndefined();
  });

  it('requires actual weekly context, while a short daily history still supplies labeled PDH/PDL',()=>{
    const result=analyzeSetups(input());expect(result.profile.bias).toBe('Unknown');expect(result.previousDay).toMatchObject({high:107,low:99,at:UNIT_BASE-2*86400});expect(result.profile.basis).toContain('ISO UTC');
  });
  it('uses current and prior reporting weeks, excluding future daily bars',()=>{
    const d=new Date(UNIT_BASE*1000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const week=d.getTime()/1000;
    const prior=Array.from({length:5},(_,i)=>candle(week-604800+i*86400,90+i,95+i,89+i,94+i));const current=Array.from({length:3},(_,i)=>candle(week+i*86400,100+i,110+i,99+i,106+i));
    const result=analyzeSetups(input({now:week+3*86400,daily:[...prior,...current,candle(week+3*86400,10,20,1,2)]}));expect(result.profile.bias).toBe('Bullish');expect(result.profile.weeklyOpen).toBe(100);expect(result.previousDay?.at).toBe(week+2*86400);
  });
  it('does not silently drop unsupported sources from an ALL condition',()=>{const unknown={...core,id:'wr1',name:'Unsupported WR1',setupFamily:'custom' as const};const result=analyzeSetups(input({strategies:[core,unknown],combination:'all'}));expect(result.candidates.some(c=>c.ready)).toBe(false);expect(result.scenario).toBeUndefined();});
  it('does not keep an old or invalidated retest ready indefinitely',()=>{const result=analyzeSetups(input({candles:sequenceCandles()}));expect(result.candidates.some(c=>c.ready)).toBe(false);});

  it('uses tradeMetrics inverse USDJPY conversion for valid paper risk geometry',()=>{
    const analysis=analyzeSetups(input());
    const candidate=analysis.candidates.find(item=>item.side==='long'&&item.ready)!;
    const proposal=proposePaper(analysis,market,'long',candidate.entry!,100_000,0.5);
    expect(proposal.stop).toBeLessThan(proposal.entry);
    expect(proposal.target).toBeGreaterThan(proposal.entry);
    expect(proposal.rr).toBeGreaterThanOrEqual(2);
    expect(proposal.initialRisk).toBeLessThanOrEqual(500);
    expect(proposal.initialRisk).toBeCloseTo(500,2);
    expect(proposal.partialAt).toBeCloseTo(proposal.target);
    expect(proposal.checklist.purpose).toContain('not a record');
  });
});
