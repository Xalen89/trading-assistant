#!/usr/bin/env python3
"""Optional private-research adapter; review the exact vectorbt license before distribution."""
import argparse
import importlib
import json
from pathlib import Path
engine=importlib.import_module('research_engine')
validate,signals=engine.validate,engine.signals

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('input',help='JSON {series,spec}');p.add_argument('--private-research',action='store_true')
    args=p.parse_args()
    if not args.private_research:p.error('Explicit --private-research is required; vectorbt is not bundled in the app.')
    data=json.loads(Path(args.input).read_text());grid=validate(data['series'],data['spec'])
    try:vbt=importlib.import_module('vectorbt');pd=importlib.import_module('pandas')
    except ImportError:raise RuntimeError('Install a separately licensed/compatible vectorbt environment for private research.')
    reports=[]
    for asset in data['series']:
        bars=asset['candles'];spec=data['spec'];f,s=grid[0]
        if spec['model']!='ma-cross':raise ValueError('This adapter exports only the MA baseline, not vectorbt PRO or custom WR1.')
        entries,exits=signals(bars,f,s,'ma-cross',spec['side'])
        index=pd.to_datetime([b['time'] for b in bars],unit='s',utc=True)
        close=pd.Series([b['close'] for b in bars],index=index)
        opens=pd.Series([b['open'] for b in bars],index=index)
        portfolio=vbt.Portfolio.from_signals(close,entries=pd.Series(entries,index=index).shift(1,fill_value=False),exits=pd.Series(exits,index=index).shift(1,fill_value=False),price=opens,direction='longonly' if spec['side']=='long' else 'shortonly',fees=spec['feesBps']/10000,slippage=spec['slippageBps']/10000,init_cash=spec['initialEquity'])
        reports.append({'symbol':asset['symbol'],'totalReturnPct':float(portfolio.total_return()*100),'scope':'First grid pair baseline; no walk-forward selection or PRO features claimed'})
    print(json.dumps(reports,allow_nan=False))
if __name__=='__main__':main()
