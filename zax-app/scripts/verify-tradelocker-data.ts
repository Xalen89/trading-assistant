import {brokerCatalog,brokerStatus,brokerQuote,brokerCandles} from '../server/trading/tradelocker';
async function main(){
 const status=await brokerStatus();const catalog=await brokerCatalog();
 const preferred=catalog.find(m=>/XAU.?USD/i.test(m.providerSymbol))||catalog.find(m=>/EUR.?USD/i.test(m.providerSymbol))||catalog[0];
 if(!preferred)throw new Error('Selected account has no information-route instruments.');
 const quote=await brokerQuote(preferred.id),history=await brokerCandles(preferred.id,'5m');
 console.log(JSON.stringify({authenticated:status.connected,instruments:status.instrumentCount,verifiedSymbol:preferred.providerSymbol,bid:quote.bid,ask:quote.ask,quoteTimestampBasis:quote.timestampKind,candleCount:history.candles.length,lastBarAt:new Date(history.candles.at(-1)!.time*1000).toISOString(),source:history.source,brokerOrderCalls:0},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'TradeLocker data check failed.');process.exitCode=1;});
