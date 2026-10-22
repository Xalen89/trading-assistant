import {describe,it,expect,vi} from 'vitest';
import {launchWebLogin,type WebLoginWindow} from '../../lib/_core/web-login';
describe('web login context',()=>{
 it('uses current tab for standalone login',()=>{const identity={};const browser={self:identity,top:identity,location:{assign:vi.fn()},open:vi.fn()} as WebLoginWindow;expect(launchWebLogin(browser,'https://app.test/start')).toBe('same-window');expect(browser.location.assign).toHaveBeenCalledWith('https://app.test/start');expect(browser.open).not.toHaveBeenCalled();});
 it('opens a detached standalone tab for iframe login',()=>{const popup={opener:{},location:{href:''},close:vi.fn()};const browser={self:{},top:{},location:{assign:vi.fn()},open:vi.fn(()=>popup)};expect(launchWebLogin(browser,'https://app.test/start')).toBe('standalone');expect(popup.opener).toBeNull();expect(popup.location.href).toBe('https://app.test/start');expect(browser.location.assign).not.toHaveBeenCalled();});
 it('reports blocked popups rather than navigating the iframe',()=>{const browser={self:{},top:{},location:{assign:vi.fn()},open:vi.fn(()=>null)};expect(()=>launchWebLogin(browser,'https://app.test/start')).toThrow('blocked');expect(browser.location.assign).not.toHaveBeenCalled();});
});
