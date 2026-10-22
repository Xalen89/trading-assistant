import copy
import math
import unittest
import importlib
from typing import Any
engine=importlib.import_module('research_engine')
run,simulate,validate=engine.run,engine.simulate,engine.validate

def fixture(n=240) -> list[dict[str, Any]]:
    bars=[]
    for i in range(n):
        close=100+math.sin(i*.24)*9+i*.015;open_=100+math.sin((i-1)*.24)*9+i*.015
        bars.append(dict(time=1700000000+i*300,open=open_,close=close,high=max(open_,close)+1,low=min(open_,close)-1,volume=100))
    return [dict(symbol='SYNTHETIC UNIT FIXTURE',timeframe='5m',source='Synthetic test data, never application market data',candles=bars)]
SPEC: dict[str, Any]=dict(model='ma-cross',side='long',fast=[3,5],slow=[10,15],holdBars=12,trainingBars=120,testBars=40,feesBps=5,slippageBps=5,initialEquity=10000)
class ResearchTests(unittest.TestCase):
    def test_folds_and_labels(self):
        r=run(fixture(),SPEC);a=r['assets'][0]
        self.assertEqual(len(a['folds']),3);self.assertIsNone(r['probability'])
        self.assertTrue(all(f['trainEnd']<f['testStart'] for f in a['folds']))
        self.assertTrue(all(l['labelEnd']>l['time'] for l in a['labels']))
    def test_next_open_and_costs(self):
        bars=fixture()[0]['candles'];_,trades,_=simulate(bars,120,160,3,10,SPEC,10000)
        self.assertTrue(trades)
        first=trades[0];i=next(i for i,b in enumerate(bars) if b['time']==first['entryTime'])
        self.assertAlmostEqual(first['entryPrice'],bars[i]['open']*(1+SPEC['slippageBps']/10000))
        free={**SPEC,'feesBps':0,'slippageBps':0};self.assertLess(run(fixture(),SPEC)['assets'][0]['metrics']['returnPct'],run(fixture(),free)['assets'][0]['metrics']['returnPct'])
    def test_future_cannot_change_prior_selection(self):
        series=fixture();original=run(series,SPEC)['assets'][0]['folds'][0]
        changed=copy.deepcopy(series)
        for b in changed[0]['candles'][180:]:
            for k in ['open','high','low','close']:b[k]*=2
        later=run(changed,SPEC)['assets'][0]['folds'][0]
        self.assertEqual(original['selected'],later['selected']);self.assertEqual(original['metrics'],later['metrics'])
    def test_flat_no_invented_win_rate(self):
        series=fixture()
        for b in series[0]['candles']:b.update(open=100,close=100,high=101,low=99)
        m=run(series,SPEC)['assets'][0]['metrics'];self.assertEqual(m['trades'],0);self.assertIsNone(m['profitFactor']);self.assertIsNone(m['winRatePct'])
    def test_short(self):self.assertTrue(run(fixture(),{**SPEC,'side':'short'})['assets'][0]['folds'])
    def test_duplicate_time(self):
        data=fixture();data[0]['candles'][1]['time']=data[0]['candles'][0]['time']
        with self.assertRaises(ValueError):validate(data,SPEC)
    def test_caps(self):
        with self.assertRaises(ValueError):validate(fixture(),{**SPEC,'fast':list(range(2,10)),'slow':list(range(20,30))})
    def test_two_assets(self):self.assertEqual(len(run(fixture()+fixture(),SPEC)['assets']),2)
if __name__=='__main__':unittest.main()
