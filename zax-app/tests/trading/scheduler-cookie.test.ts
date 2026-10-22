import {describe,expect,it} from 'vitest';
import {parseSchedulerCredential} from '../../server/trading/notifications';
describe('scheduled identity transport',()=>{
 it('reads only the documented platform cron cookie, not an app login cookie',()=>{expect(parseSchedulerCredential('app_session_id=UNIT_PLATFORM_TICKET; __Host-manus_session_unit=UNIT_APP_SESSION')).toBe('UNIT_PLATFORM_TICKET');expect(parseSchedulerCredential('__Host-manus_session_unit=UNIT_APP_SESSION')).toBeUndefined();});
});
