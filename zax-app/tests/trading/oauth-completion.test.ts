import {describe,it,expect,vi} from 'vitest';
import {createOAuthCompletion} from '../../lib/_core/oauth-completion';
import {sdk} from '../../server/_core/sdk';
import {ENV} from '../../server/_core/env';
describe('OAuth completion lifecycle',()=>{
 it('shares one exchange across repeated effect subscriptions',async()=>{const run=createOAuthCompletion(),complete=vi.fn(async()=>{});const a=run('one-transaction',complete),b=run('one-transaction',complete);expect(a).toBe(b);await Promise.all([a,b]);expect(complete).toHaveBeenCalledTimes(1);});
 it('does not replay a failed one-use transaction on rerender',async()=>{const run=createOAuthCompletion(),complete=vi.fn(async()=>{throw new Error('callback rejected');});await expect(run('old',complete)).rejects.toThrow();await expect(run('old',complete)).rejects.toThrow();expect(complete).toHaveBeenCalledTimes(1);});
 it('allows a genuinely new transaction after a retry',async()=>{const run=createOAuthCompletion(),complete=vi.fn(async()=>{});await run('old',complete);await run('new',complete);expect(complete).toHaveBeenCalledTimes(2);});
 it('does not reject a valid project session for empty display metadata',async()=>{const token=await sdk.signSession({appId:ENV.appId,openId:'unit-test-only',name:''});expect(await sdk.verifySession(token)).toMatchObject({openId:'unit-test-only',appId:ENV.appId,name:''});});
});
