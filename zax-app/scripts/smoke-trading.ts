import fs from 'node:fs/promises';
import { getQuote, getCandles } from '../server/trading/market';
import { extractSource } from '../server/trading/learning';
import { storageGetSignedUrl } from '../server/storage';
async function main(){
const results:Record<string,unknown>={};
for(const symbol of ['BTC-USD','ETH-USD']){const quote=await getQuote(symbol);if(quote.status!=='live'||quote.price<=0)throw new Error(`${symbol}: ${quote.message||quote.status}`);results[symbol]={price:quote.price,providerTime:new Date(quote.timestamp*1000).toISOString(),source:quote.source};console.log(`Live ${symbol} verified.`);}
const chart=await getCandles('BTC-USD','5m');results.candles={count:chart.candles.length,first:chart.candles[0].time,last:chart.candles.at(-1)!.time,source:chart.source};console.log(`Validated ${chart.candles.length} real Coinbase bars.`);
const image=await fs.readFile('/tmp/wr1-pattern.png');const learned=await extractSource('image/png',image.toString('base64'),{name:'WR1 FVG source page 9',kind:'pattern',notes:'Source chart reference only; do not treat WR1 as the user’s personal strategy.'});results.vision={description:learned.description,rules:learned.rules,tags:learned.tags,limitations:learned.limitations};console.log('Real chart-image extraction verified.');
await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/live-ai-smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
// Download the reserved generated icon once after independent implementation work.
const url=await storageGetSignedUrl('async-images/ezn7kgqudpuejDGMiM6f7F/image-1.webp');const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Generated icon download failed.');await fs.writeFile('assets/images/stratdesk-original.webp',Buffer.from(await response.arrayBuffer()));console.log('Icon bytes acquired for native conversion.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Smoke test failed.');process.exitCode=1;});
