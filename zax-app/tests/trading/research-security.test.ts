import {describe,it,expect} from 'vitest';
import {appRouter} from '../../server/routers';
import {validateVector} from '../../server/trading/vectors';
import {researchStartSchema} from '../../server/trading/research-jobs';
import {initialWorkspace} from '../../lib/trading/model';
import {DEFAULT_BACKTEST} from '../../lib/trading/research';
const caller=appRouter.createCaller({user:null,req:{headers:{}},res:{}} as never);
describe('research/private vector boundaries',()=>{
 it('rejects guest metadata lookup',async()=>expect(caller.learning.definition({id:'fixture'})).rejects.toMatchObject({code:'UNAUTHORIZED'}));
 it('rejects guest job lookup',async()=>expect(caller.research.job({})).rejects.toMatchObject({code:'UNAUTHORIZED'}));
 it('rejects guest reindex',async()=>expect(caller.learning.reindex({id:'fixture'})).rejects.toMatchObject({code:'UNAUTHORIZED'}));
 it('rejects guest live visual search',async()=>expect(caller.learning.visual({market:'BTC-USD',timeframe:'5m',strategyId:'wr1',strategyVersion:1})).rejects.toMatchObject({code:'UNAUTHORIZED'}));
 it('rejects malformed descriptor',()=>expect(()=>validateVector('AA==')).toThrow());
 it('rejects nonnormalized descriptor',()=>expect(()=>validateVector(Buffer.alloc(3780*4).toString('base64'))).toThrow());
 it('accepts bounded genuine schema and rejects broad sweeps',()=>{const w=initialWorkspace(),input={kind:'backtest',market:w.market,timeframe:w.timeframe,strategy:w.strategies[0],confirmations:{},weeklyBias:w.settings.weeklyBias,trades:[],startingBalance:w.paperStartingBalance,spec:DEFAULT_BACKTEST};expect(researchStartSchema.safeParse(input).success).toBe(true);expect(researchStartSchema.safeParse({...input,spec:{...DEFAULT_BACKTEST,fast:[2,3,4,5,6,7],slow:[20,30,40,50,60,70]}}).success).toBe(false);});
});
