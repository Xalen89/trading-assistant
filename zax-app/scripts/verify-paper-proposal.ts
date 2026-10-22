import {eq} from 'drizzle-orm';
import {users} from '../drizzle/schema';
import {getDb} from '../server/db';
import {brokerCatalog,brokerOwner} from '../server/trading/tradelocker';
import {createProposal} from '../server/trading/setup-service';
import {WR1} from '../lib/trading/model';
import {paperFormGeometryError,parsePaperFormValues} from '../lib/trading/paper-form';
import {mkdir,writeFile} from 'node:fs/promises';
async function main(){
 const db=await getDb();if(!db)throw new Error('Database unavailable.');
 try{
  const ownerEmail=process.env.TRADELOCKER_OWNER_EMAIL?.trim();if(!ownerEmail)throw new Error('Approved owner identity missing.');
  const rows=await db.select().from(users).where(eq(users.email,ownerEmail)).limit(2);if(rows.length!==1||!brokerOwner(rows[0]))throw new Error('A unique real registered authorized owner is required.');
  const catalog=await brokerCatalog(),market=catalog.find(m=>m.providerSymbol==='XAUUSD');if(!market)throw new Error('Selected-account XAUUSD unavailable.');
  const results=[];
  for(const side of ['long','short'] as const){
   const started=Date.now();console.log(`Checking ${side} source proposal; no order call.`);
   try{
    const proposal=await createProposal(rows[0],{market:market.id,timeframe:'5m',strategies:[WR1],strategyIds:[WR1.id],combination:'all',timezone:'America/New_York',side,balance:100000,riskPct:.5});
    const values=parsePaperFormValues({entry:String(proposal.entry),stop:String(proposal.stop),target:String(proposal.target),quantity:String(proposal.quantity)});
    results.push({side,elapsedMs:Date.now()-started,durableDraftIdPresent:Boolean(proposal.id),entry:proposal.entry,stop:proposal.stop,target:proposal.target,risk:proposal.initialRisk,rr:proposal.rr,closedBars:proposal.analysis.candles.length,source:proposal.analysis.source,formError:paperFormGeometryError({...values,side,market}),paperOrderCreated:false});
    console.log(JSON.stringify({side,elapsedMs:Date.now()-started,draftReturned:true,orderCreated:false}));
   }catch(e){results.push({side,elapsedMs:Date.now()-started,error:e instanceof Error?e.message:'Proposal unavailable',paperOrderCreated:false});console.log(JSON.stringify({side,elapsedMs:Date.now()-started,draftReturned:false,orderCreated:false}));}
  }
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/paper-proposal-verification.json',JSON.stringify({at:new Date().toISOString(),market:market.providerSymbol,results,actions:'Used existing real owner registration, read actual broker data and saved diagnostic paper drafts only. No user session manufactured, no trade/journal/order, no broker order or scheduler created. Browser/device final submission remains user-unverified.'},null,2)+'\n');
 }finally{await (db as any).$client.promise().end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Real proposal check failed.');process.exitCode=1;});
