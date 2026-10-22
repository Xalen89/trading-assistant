import { tradeLockerBase } from '../server/trading/tradelocker-config';
async function main(){
  const base=tradeLockerBase();
  const email=process.env.TRADELOCKER_EMAIL,password=process.env.TRADELOCKER_PASSWORD,server=process.env.TRADELOCKER_SERVER;
  if(!email||!password||!server)throw new Error('ACCOUNT_INPUT_MISSING: Broker login inputs are not loaded in this runtime.');
  const response=await fetch(`${base}/auth/jwt/token`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({email,password,server}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`ACCOUNT_LOGIN_REJECTED: TradeLocker returned HTTP ${response.status}. No other environment or server was attempted.`);
  const auth=await response.json();if(typeof auth.accessToken!=='string')throw new Error('ACCOUNT_RESPONSE_INVALID: No access token returned.');
  const accounts=await fetch(`${base}/auth/jwt/all-accounts`,{headers:{Accept:'application/json',Authorization:`Bearer ${auth.accessToken}`},signal:AbortSignal.timeout(20000)});
  if(!accounts.ok)throw new Error(`ACCOUNT_LIST_REJECTED: HTTP ${accounts.status}.`);
  const data=await accounts.json();const rows=Array.isArray(data)?data:data.accounts;
  if(!Array.isArray(rows))throw new Error('ACCOUNT_LIST_INVALID: Unexpected account-list shape.');
  const requested=process.env.TRADELOCKER_ACCOUNT_ID?.trim();const selected=requested&&requested!=='select'?rows.find((a:any)=>String(a.id??a.accountId)===requested):rows.length===1?rows[0]:undefined;
  console.log(JSON.stringify({authenticated:true,accountCount:rows.length,selectedAccountFound:Boolean(selected),selectionRequired:!selected,accountFieldNames:rows[0]?Object.keys(rows[0]):[]},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'ACCOUNT_CHECK_FAILED');process.exitCode=1;});
