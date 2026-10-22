import {afterEach,describe,expect,it,vi} from 'vitest';
import {tradeLockerEnvironment,tradeLockerBase} from '../../server/trading/tradelocker-config';
import {brokerOwner,brokerReadAllowed,brokerMarket,isBrokerMarket} from '../../server/trading/tradelocker';
import {tradeMetrics} from '../../lib/trading/engine';
import {ENV} from '../../server/_core/env';
const originalOwner=ENV.ownerOpenId;
afterEach(()=>{vi.unstubAllEnvs();ENV.ownerOpenId=originalOwner;});
describe('TradeLocker data-only boundary',()=>{
 it('accepts explicit account types and official account URLs only',()=>{expect(tradeLockerEnvironment(' Demo ')).toBe('demo');expect(tradeLockerEnvironment('http://live.tradelocker.com/en/trade')).toBe('live');vi.stubEnv('TRADELOCKER_ENVIRONMENT','http://demo.tradelocker.com');expect(tradeLockerBase()).toBe('https://demo.tradelocker.com/backend-api');});
 it('rejects alternate hosts, phishing suffixes and credential URLs',()=>{for(const input of ['https://live.tradelocker.com.evil.test','https://live.tradelocker.com@evil.test','https://user:pass@live.tradelocker.com','production','live prices','https://127.0.0.1'])expect(()=>tradeLockerEnvironment(input)).toThrow();});
 it('requires a real signed-in identity matching the approved owner',()=>{ENV.ownerOpenId='';vi.stubEnv('TRADELOCKER_OWNER_EMAIL','owner@example.test');expect(brokerOwner(null)).toBe(false);expect(brokerOwner({email:'owner@example.test'})).toBe(false);expect(brokerOwner({openId:'user',email:'other@example.test'})).toBe(false);expect(brokerOwner({openId:'user',email:'OWNER@example.test'})).toBe(true);});
 it('does not let an email override an authoritative owner openId',()=>{ENV.ownerOpenId='real-owner';vi.stubEnv('TRADELOCKER_OWNER_EMAIL','owner@example.test');expect(brokerOwner({openId:'different',email:'owner@example.test'})).toBe(false);expect(brokerOwner({openId:'real-owner'})).toBe(true);});
 it('permits only specific information routes, never orders or positions',()=>{expect(brokerReadAllowed('/trade/quotes')).toBe(true);expect(brokerReadAllowed('/trade/history')).toBe(true);expect(brokerReadAllowed('/trade/accounts/123/instruments')).toBe(true);for(const path of ['/trade/accounts/123/orders','/trade/positions/123','/trade/accounts/123/positions','/trade/orders/456','https://evil.test/trade/quotes'])expect(brokerReadAllowed(path)).toBe(false);});
 it('uses broker instrument IDs without substituting a futures ticker',()=>{const m=brokerMarket({tradableInstrumentId:8,name:'NAS100',type:'INDICES',routes:[{id:1,type:'INFO'}]});expect(m.id).toBe('TL:8');expect(m.id).not.toBe('NQ');expect(isBrokerMarket(m.id)).toBe(true);expect(m.provider).toBe('tradelocker');});
 it('leaves non-USD paper valuation unsupported instead of fabricating USD P/L',()=>{const m=brokerMarket({tradableInstrumentId:9,name:'EURJPY',type:'FOREX',routes:[{id:1,type:'INFO'}]});expect(m.paperSupported).toBe(false);});
 it('preserves USD-base FX conversion with broker-prefixed symbols',()=>{const base={entry:150,stop:149,target:152,exit:151,quantity:1000,side:'long' as const,pointValue:1};expect(tradeMetrics({...base,market:'TL:44',valuationSymbol:'USDJPY'}).pnl).toBeCloseTo(1000/151);});
});
