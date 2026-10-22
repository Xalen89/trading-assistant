import {describe,it,expect,vi} from 'vitest';
vi.mock('react-native',()=>({Platform:{OS:'web',select:(options:Record<string,unknown>)=>options.default}}));
import {formatAge} from '../../components/trading/theme';
describe('Unix-second quote age',()=>{
 const now=1_800_000_000_000;
 it('shows current Unix-second quotes as now',()=>expect(formatAge(now/1000,now)).toBe('now'));
 it('shows elapsed seconds and minutes instead of decades',()=>{expect(formatAge(now/1000-20,now)).toBe('20s');expect(formatAge(now/1000-300,now)).toBe('5m');});
 it('rejects missing and invalid timestamps',()=>{expect(formatAge(undefined,now)).toBe('unavailable');expect(formatAge(NaN,now)).toBe('unavailable');expect(formatAge(-1,now)).toBe('unavailable');});
});
