export type TradeLockerEnvironment='demo'|'live';
export function tradeLockerEnvironment(value:string|undefined):TradeLockerEnvironment{
  const text=(value||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().toLowerCase().replace(/^["']|["']$/g,'');
  if(text==='demo'||text==='live')return text;
  try{
    const url=new URL(text.includes('://')?text:`https://${text}`);
    // The input is only an account-environment label. It is never used as a request URL.
    if((url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password&&!url.port){
      if(url.hostname==='demo.tradelocker.com')return 'demo';
      if(url.hostname==='live.tradelocker.com')return 'live';
    }
  }catch{/* Do not infer an environment or route to an untrusted host. */}
  throw new Error('ACCOUNT_ENVIRONMENT_INVALID: Use demo/live or the official TradeLocker account URL.');
}
export function tradeLockerConfigured(){return Boolean(process.env.TRADELOCKER_ENVIRONMENT&&process.env.TRADELOCKER_EMAIL&&process.env.TRADELOCKER_PASSWORD&&process.env.TRADELOCKER_SERVER);}
export function tradeLockerBase(){return `https://${tradeLockerEnvironment(process.env.TRADELOCKER_ENVIRONMENT)}.tradelocker.com/backend-api`;}
