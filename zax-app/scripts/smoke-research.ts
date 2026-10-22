import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getCandles} from '../server/trading/market';
import {runPython,pythonCache} from '../server/trading/python';
import {DEFAULT_BACKTEST,DESCRIPTOR_VERSION,type BacktestReport} from '../lib/trading/research';
import {initialWorkspace} from '../lib/trading/model';
import {discuss} from '../server/trading/discussion';
async function main(){
 const image=(await readFile('/tmp/stratdesk-wr1-p9.png')).toString('base64');
 const index=await runPython<{vectorBase64:string;sourceHash:string;dimensions:number}>('pattern_indexer',{operation:'index',owner:'offline-smoke-only',dbPath:pythonCache,patternId:'shared-wr1-p9',version:1,imageBase64:image});
 const exact=await runPython<{results:{similarity:number}[]}>('pattern_indexer',{operation:'query',owner:'offline-smoke-only',dbPath:pythonCache,imageBase64:image,candidates:[{patternId:'shared-wr1-p9',version:1,sourceHash:index.sourceHash,descriptorVersion:DESCRIPTOR_VERSION,vectorBase64:index.vectorBase64}],topK:1});
 const feed=await getCandles('BTC-USD','5m');const candles=feed.candles.filter(c=>c.time+300<=Date.now()/1000);
 const test=await runPython<BacktestReport>('research_engine',{series:[{symbol:'BTC-USD',timeframe:'5m',source:feed.source,candles}],spec:DEFAULT_BACKTEST},60000);
 if(index.dimensions!==3780||exact.results[0].similarity<.999||test.probability!==null)throw new Error('Worker smoke assertion failed.');
 const output:Record<string,unknown>={checkedAt:new Date().toISOString(),sourceImage:'Shared wr1 PDF.pdf page 9; offline test, not a user-uploaded strategy',descriptorDimensions:index.dimensions,exactImageCosine:exact.results[0].similarity,ohlcSource:feed.source,realClosedBars:candles.length,backtest:{assets:test.assets.map(a=>({symbol:a.symbol,folds:a.folds.length,metrics:a.metrics,quantstats:a.quantstats,labels:a.labels.length})),assumptions:test.assumptions,limitations:test.limitations},productionWrites:false,sessionMinted:false};
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/resource-smoke.json',JSON.stringify(output,null,2));
 console.log('Real-image/actual-OHLC checks passed. Starting one bounded evidence discussion.');
 const w=initialWorkspace();
 try{const r=await discuss({kind:'discussion',market:'BTC-USD',timeframe:'5m',strategy:w.strategies[0],confirmations:{},weeklyBias:'Neutral',trades:[],startingBalance:w.paperStartingBalance},candles,feed.source);output.discussion={roles:r.roles.map(role=>({role:role.role,status:role.status,evidenceIds:role.evidenceIds})),decision:r.decision,riskVeto:r.riskVeto,probability:r.probability};}
 catch(e){output.discussion={failed:true,error:e instanceof Error?e.message.slice(0,300):'Discussion failed'};process.exitCode=1;}
 await writeFile('artifacts/resource-smoke.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Smoke failed');process.exitCode=1;});
