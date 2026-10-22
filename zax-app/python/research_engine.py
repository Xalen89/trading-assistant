#!/usr/bin/env python3
"""Independent NumPy baseline research, not full WR1/strategy or probability calibration."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import itertools
import importlib
from typing import Any
import json
import sys
import time
import numpy as np
VERSION='causal-baselines-v1'

def validate(series,spec):
    if not isinstance(series,list) or not 1 <= len(series) <= 2: raise ValueError('One or two assets required.')
    for k,lo,hi in [('trainingBars',60,4000),('testBars',20,1000),('holdBars',1,100)]:
        if not isinstance(spec[k],int) or not lo <= spec[k] <= hi: raise ValueError('Invalid '+k)
    if spec['model'] not in ['ma-cross','fvg'] or spec['side'] not in ['long','short']:raise ValueError('Unsupported baseline.')
    for k in ['feesBps','slippageBps']:
        if not np.isfinite(spec[k]) or not 0 <= spec[k] <= 100:raise ValueError('Invalid costs.')
    if not np.isfinite(spec['initialEquity']) or not 0 < spec['initialEquity'] <= 1e9:raise ValueError('Invalid equity.')
    grid=list(itertools.product(spec['fast'],spec['slow']))
    if not 1 <= len(grid) <= 24:raise ValueError('At most 24 parameter pairs.')
    for f,s in grid:
        if not isinstance(f,int) or not isinstance(s,int) or not 2<=f<=100 or not 3<=s<=250:raise ValueError('Invalid MA periods.')
    grid=[(f,s) for f,s in grid if f<s and s<=spec['trainingBars']]
    if not grid:raise ValueError('Need fast < slow <= training bars.')
    for asset in series:
        bars=asset['candles']
        if not spec['trainingBars']+spec['testBars'] <= len(bars) <= 5000:raise ValueError('Need at least trainingBars + testBars, maximum 5000 bars.')
        previous=0
        for c in bars:
            t,o,h,l,close,v=[float(c[k]) for k in ['time','open','high','low','close','volume']]
            if not all(np.isfinite([t,o,h,l,close,v])) or t<=previous or min(o,h,l,close)<=0 or v<0 or h<max(o,close) or l>min(o,close) or h<l:raise ValueError('Invalid chronological OHLC.')
            previous=t
    return grid

def signals(bars,fast,slow,model,side):
    close=np.array([c['close'] for c in bars],dtype=float)
    if model=='fvg':
        enter=np.zeros(len(bars),bool)
        for i in range(2,len(bars)):
            enter[i]=bars[i]['low']>bars[i-2]['high'] if side=='long' else bars[i]['high']<bars[i-2]['low']
        return enter,np.zeros(len(bars),bool)
    def ma(n):
        prefix=np.r_[0.,np.cumsum(close)]
        out=np.full(len(close),np.nan)
        out[n-1:]=(prefix[n:]-prefix[:-n])/n
        return out
    diff=ma(fast)-ma(slow)
    valid=np.isfinite(diff)&np.isfinite(np.r_[np.nan,diff[:-1]])
    previous=np.r_[np.nan,diff[:-1]]
    up=valid&(diff>0)&(previous<=0);down=valid&(diff<0)&(previous>=0)
    return (up,down) if side=='long' else (down,up)

def metrics(equity,trades,initial) -> dict[str, Any]:
    values=np.asarray([initial]+list(equity),float)
    peaks=np.maximum.accumulate(values)
    draw=np.divide(peaks-values,peaks,out=np.zeros_like(values),where=peaks>0)
    returns=[t['returnPct'] for t in trades]
    gains=sum(max(0,r) for r in returns);losses=-sum(min(0,r) for r in returns)
    return dict(returnPct=(values[-1]/initial-1)*100,maxDrawdownPct=float(draw.max()*100),trades=len(trades),wins=sum(r>0 for r in returns),winRatePct=100*sum(r>0 for r in returns)/len(returns) if returns else None,profitFactor=gains/losses if losses>0 else None)

def simulate(bars,start,end,fast,slow,spec,initial):
    enter,leave=signals(bars,fast,slow,spec['model'],spec['side'])
    direction=1 if spec['side']=='long' else -1
    fee=spec['feesBps']/10000;slip=spec['slippageBps']/10000
    cash=initial;position: dict[str, Any] | None=None;curve=[];trades=[]
    def close_position(price,index,forced):
        nonlocal cash,position
        p=position
        assert p is not None
        exit_price=price*(1-direction*slip)
        cash=max(0,p['net']*(1+direction*(exit_price-p['entry'])/p['entry'])*(1-fee))
        trades.append(dict(entryTime=bars[p['index']]['time'],exitTime=bars[index]['time'],entryPrice=p['entry'],exitPrice=exit_price,returnPct=(cash/p['before']-1)*100,forcedExit=forced))
        position=None
    for i in range(start,end):
        if cash<=0 and position is None:curve.append(0);continue
        closed=False
        if position is not None and (leave[i-1] or spec['model']=='fvg' and i-position['index']>=spec['holdBars']):
            close_position(bars[i]['open'],i,False);closed=True
        if position is None and not closed and i>0 and enter[i-1] and cash>0:
            position=dict(entry=bars[i]['open']*(1+direction*slip),before=cash,net=cash*(1-fee),index=i)
        marked=cash if position is None else max(0,position['net']*(1+direction*(bars[i]['close']-position['entry'])/position['entry']))
        if position is not None and (i==end-1 or marked<=0):
            close_position(bars[i]['close'],i,True);marked=cash
        curve.append(marked)
    return curve,trades,metrics(curve,trades,initial)

def run(series,spec):
    grid=validate(series,spec);assets=[];qs_available=True
    for asset in series:
        bars=asset['candles'];folds=[];curve=[];all_trades=[];capital=spec['initialEquity'];dates=[]
        for start in range(spec['trainingBars'],len(bars)-spec['testBars']+1,spec['testBars']):
            train=start-spec['trainingBars'];end=start+spec['testBars']
            # Selection sees only rows before the test; no future-target labels are used.
            best: tuple[float,int,int] | None=None
            for f,s in grid:
                _,_,m=simulate(bars[:start],train,start,f,s,spec,spec['initialEquity'])
                if best is None or m['returnPct']>best[0]:best=(m['returnPct'],f,s)
            assert best is not None
            training_return,f,s=best
            values,trades,m=simulate(bars, start,end,f,s,spec,capital)
            capital=values[-1];curve.extend(values);dates.extend([b['time'] for b in bars[start:end]]);all_trades.extend(trades)
            folds.append(dict(trainStart=bars[train]['time'],trainEnd=bars[start-1]['time'],testStart=bars[start]['time'],testEnd=bars[end-1]['time'],selected=dict(fast=f,slow=s),trainingReturnPct=training_return,metrics=m,trades=trades))
        labels=[];horizon=spec['holdBars']
        for i in range(len(bars)-horizon):
            r=(bars[i+horizon]['close']/bars[i]['close']-1)*100
            labels.append(dict(time=bars[i]['time'],labelEnd=bars[i+horizon]['time'],forwardReturnPct=r,label='positive' if r>0 else 'negative' if r<0 else 'flat'))
        out: dict[str, Any]=dict(symbol=asset['symbol'],timeframe=asset['timeframe'],source=asset['source'],bars=len(bars),metrics=metrics(curve,all_trades,spec['initialEquity']),folds=folds,labels=labels)
        try:
            import pandas as pd
            qs=importlib.import_module('quantstats')
            vals=np.r_[spec['initialEquity'],curve]
            rets=np.divide(np.diff(vals),vals[:-1],out=np.zeros(len(curve)),where=vals[:-1]>0)
            periods=pd.Series(rets,index=pd.to_datetime(dates,unit='s',utc=True))
            out['quantstats']=dict(cumulativeReturnPct=float(qs.stats.comp(periods)*100),maxDrawdownPct=float(-qs.stats.max_drawdown(periods)*100),unit='Per-bar chronological OOS equity returns; no annualized frequency assumed')
        except (ImportError,ValueError,AttributeError):qs_available=False
        assets.append(out)
    return dict(engine='Independent NumPy research',engineVersion=VERSION,generatedAt=int(time.time()*1000),spec=spec,assets=assets,probability=None,assumptions=['Signals from closed bar t execute at next bar t+1 OPEN.','Fees and adverse slippage applied on both sides; positions normalized to one capital allocation, not broker lots/USD contract P/L.','Past-only MA warmup; fresh flat start each fold; forced final fold CLOSE, including costs.','Training objective is cumulative return; selected grid parameters are frozen for the next test segment.','Drawdown includes marked open equity at observed closes; no intrabar liquidation/margin/borrow/funding model.'],limitations=['Only MA-cross and basic three-bar FVG baselines; no complete WR1 or uploaded-rule backtesting.','Two assets are independent experiments, not a combined portfolio allocation/covariance model.','Unleveraged normalized short accounting and equity floor at zero; not broker margin behavior.','Irregular bars/session calendars, spread changes and market impact are not inferred.','Forward labels are offline targets, never live predictions; ML users must exclude labelEnd beyond their training cutoff.','Historical hit rate is not a calibrated future probability.']+([] if qs_available else ['Optional QuantStats reporting is not installed/compatible; core metrics remain independent NumPy calculations.']))

def main():
    if '--json' not in sys.argv:raise ValueError('Use --json with {series,spec} on stdin.')
    raw=sys.stdin.buffer.read(2*1024*1024+1)
    if len(raw)>2*1024*1024:raise ValueError('Research input exceeds 2 MiB.')
    data=json.loads(raw)
    print(json.dumps(run(data['series'],data['spec']),allow_nan=False))
if __name__=='__main__':
    try:main()
    except Exception as e:
        print('Research failed: '+str(e)[:400],file=sys.stderr);sys.exit(1)
