import {describe,it,expect,vi} from 'vitest';
import {persistMatchFeedback} from '../../lib/trading/match-feedback';
import type {Match,Pattern} from '../../lib/trading/model';
const source={id:'fixture',version:1,status:'ready',feedback:[],filename:'synthetic.png'} as unknown as Pattern;
const match={id:'match-fixture',patternId:source.id,reference:{id:source.id,version:1},market:'BTC-USD',timeframe:'5m',status:'candidate'} as unknown as Match;
describe('durable match feedback',()=>{
 it('loads authoritative reference even if not in local workspace',async()=>{const save=vi.fn(async(p:Pattern)=>p);const r=await persistMatchFeedback(match,true,1,async()=>source,save);expect(save).toHaveBeenCalledOnce();expect(r.status).toBe('confirmed');expect(r.pattern.version).toBe(2);expect(r.pattern.feedback).toHaveLength(1);});
 it('refuses stale evaluated source before any write',async()=>{const save=vi.fn();await expect(persistMatchFeedback(match,true,1,async()=>({...source,version:2}),save)).rejects.toThrow('changed');expect(save).not.toHaveBeenCalled();});
 it('does not return confirmed status after failed server write',async()=>{await expect(persistMatchFeedback(match,true,1,async()=>source,async()=>{throw new Error('Conflict');})).rejects.toThrow('Conflict');});
});
