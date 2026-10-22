import {readFile,writeFile} from 'node:fs/promises';
import {getCandles} from '../server/trading/market';
import {runPython} from '../server/trading/python';
import {DEFAULT_BACKTEST,type BacktestReport} from '../lib/trading/research';
async function main(){
 const feed=await getCandles('BTC-USD','5m');const candles=feed.candles.filter(c=>c.time+300<=Date.now()/1000);
 const report=await runPython<BacktestReport>('research_engine',{series:[{symbol:'BTC-USD',timeframe:'5m',source:feed.source,candles}],spec:DEFAULT_BACKTEST},60000);
 if(!report.assets[0].quantstats)throw new Error('QuantStats did not produce actual statistics.');
 const output=JSON.parse(await readFile('artifacts/resource-smoke.json','utf8'));output.quantstatsCheck={checkedAt:new Date().toISOString(),source:feed.source,bars:candles.length,quantstats:report.assets[0].quantstats,coreMetrics:report.assets[0].metrics};
 await writeFile('artifacts/resource-smoke.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output.quantstatsCheck,null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Reporting check failed');process.exitCode=1;});
