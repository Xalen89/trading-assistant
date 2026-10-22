import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { Candle, Match, Pattern, Quote, Strategy, Timeframe, Trade } from './model';
import { SECONDS } from './engine';
import { isDerivedTimeframe } from './timeframes';
import { MARKETS, type Market } from './model';

const api = trpc;
export type CandleResponse = { candles: Candle[]; source: string; fetchedAt: number; timezone: string; status: 'live' | 'historical'; message?: string };
export type MarketStatus = { coinbase: boolean; fmp: boolean; futures: boolean; pushConfigured: boolean; schedulerRegistered: boolean; message: string };
export const useCatalogQuery = () => api.market.catalog.useQuery(undefined, { staleTime: 30_000, refetchInterval:30_000,retry:false });
export const useMarketStatusQuery = () => api.market.status.useQuery(undefined, { staleTime: 20_000,refetchInterval:30_000,retry:false });
export const useQuotesQuery = (symbols: string[]) => api.market.quotes.useQuery({ symbols:symbols.slice(0,40) }, { enabled: symbols.length > 0, refetchInterval: 15_000, staleTime: 10_000,retry:false });
export const useCandlesQuery = (symbol: string, timeframe: Timeframe, enabled = true) => api.market.candles.useQuery({ symbol, timeframe }, { enabled, staleTime: symbol.startsWith('TL:')?20_000:60_000, refetchInterval:symbol.startsWith('TL:')?20_000:60_000, retry: false });
export function useTradingMarket(id:string):Market{const catalog=useCatalogQuery();return catalog.data?.find(m=>m.id===id)||MARKETS.find(m=>m.id===id)||{id,name:'Private instrument — sign in or check connection',category:'Indices',provider:'tradelocker',providerSymbol:'Private instrument',precision:2,pointValue:1,paperSupported:false};}
export const useMarketContextQuery = () => api.market.context.useQuery(undefined, { staleTime: 5 * 60_000 });
export const useMatchMutation = () => api.learning.match.useMutation();
export const useUploadMutation = () => api.learning.upload.useMutation();
export const usePhotoSearchMutation = () => api.learning.search.useMutation();
export const useReviewMutation = () => api.learning.review.useMutation();
export const useSourceQuery = (id?: string) => api.learning.definition.useQuery({ id: id || '' }, { enabled: Boolean(id), retry: false, select:pattern=>({pattern}) });
export const useReferenceRevisionMutation = () => api.learning.revise.useMutation();
export const useSourceVersionsQuery = (id?:string) => api.learning.versions.useQuery({id:id || ''},{enabled:Boolean(id),retry:false});
export const useNotificationRegisterMutation = () => api.notifications.register.useMutation();
export const useNotificationScanMutation = () => api.notifications.scan.useMutation();
export const useNotificationActivateMutation = () => api.notifications.activate.useMutation();
export const useAlertEventQuery = (id?:string) => api.notifications.event.useQuery({id:id || ''},{enabled:Boolean(id),retry:false});
export type TickerTick = {
  price: number;
  /** Provider event timestamp in epoch milliseconds, never a candle timestamp. */
  time: number;
  /** Local receipt timestamp, useful when a provider clock is unavailable. */
  receivedAt: number;
  productId?: string;
  source: 'Coinbase WebSocket' | 'Coinbase Exchange REST recovery';
};
export function useCoinbaseTicker(symbol: string, enabled: boolean) {
  const [tick, setTick] = useState<TickerTick | null>(null);
  useEffect(() => {
    setTick(null);
    if (!enabled || !symbol.includes('-') || typeof WebSocket === 'undefined') return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let restTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    let lastTickerReceipt = 0;

    const acceptTick = (
      price: number,
      time: number,
      source: TickerTick['source'],
    ) => {
      const receivedAt = Date.now();
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(time) ||
        time > receivedAt + 30_000 ||
        receivedAt - time > 120_000 ||
        stopped
      )
        return;
      lastTickerReceipt = receivedAt;
      // A real provider event makes the next reconnect attempt start gently.
      attempts = 0;
      setTick((previous) =>
        previous && previous.time > time
          ? previous
          : { price, time, receivedAt, productId: symbol, source },
      );
    };

    const scheduleRestRecovery = (delay = 15_000) => {
      if (stopped || restTimer) return;
      restTimer = setTimeout(async () => {
        restTimer = undefined;
        if (stopped) return;
        const socketOpen = socket?.readyState === WebSocket.OPEN;
        const streamHealthy =
          socketOpen &&
          lastTickerReceipt > 0 &&
          Date.now() - lastTickerReceipt < 15_000;
        if (streamHealthy) return;
        try {
          // This is deliberately the ticker endpoint, never a candle close.
          const response = await fetch(
            `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/ticker`,
            { headers: { Accept: 'application/json' } },
          );
          if (!response.ok) throw new Error(`Coinbase ticker HTTP ${response.status}`);
          const message = await response.json();
          acceptTick(Number(message?.price), Date.parse(message?.time), 'Coinbase Exchange REST recovery');
        } catch {
          // The owner-authorized server quote query remains an independent recovery path.
        } finally {
          if (!stopped && socket?.readyState !== WebSocket.OPEN)
            scheduleRestRecovery();
        }
      }, delay);
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
      scheduleRestRecovery(Math.min(delay, 5_000));
    };

    const connect = () => {
      if (stopped) return;
      try {
        socket = new WebSocket('wss://ws-feed.exchange.coinbase.com');
        socket.onopen = () => {
          // Re-subscribe on every new connection; Coinbase does not resume an old socket.
          socket?.send(JSON.stringify({ type: 'subscribe', product_ids: [symbol], channels: ['ticker'] }));
          scheduleRestRecovery(12_000);
        };
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data));
            if (message.type === 'ticker' && message.product_id === symbol)
              acceptTick(Number(message.price), Date.parse(message.time), 'Coinbase WebSocket');
          } catch {
            // Ignore malformed provider messages and keep the existing source value.
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          if (!stopped) {
            scheduleRestRecovery(0);
            scheduleReconnect();
          }
        };
      } catch {
        scheduleRestRecovery(0);
        scheduleReconnect();
      }
    };

    watchdog = setInterval(() => {
      if (stopped || socket?.readyState !== WebSocket.OPEN) return;
      if (!lastTickerReceipt || Date.now() - lastTickerReceipt > 30_000) socket.close();
    }, 10_000);
    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (restTimer) clearTimeout(restTimer);
      if (watchdog) clearInterval(watchdog);
      socket?.close();
    };
  },[enabled,symbol]);
  return tick?.productId===symbol&&Date.now()-tick.time<90_000&&Date.now()-tick.receivedAt<120_000?tick:null;
}
export function applyTickerToCandles(candles:Candle[],tick:TickerTick|null,timeframe:Timeframe):Candle[]{
  if(isDerivedTimeframe(timeframe))return candles;
  if(!tick||!candles.length||!Number.isFinite(tick.time)||!Number.isFinite(tick.price)||tick.price<=0)return candles;
  const bucket=Math.floor(tick.time/(SECONDS[timeframe]*1000))*SECONDS[timeframe];const last=candles.at(-1)!;
  if(bucket<last.time)return candles;
  if(bucket===last.time)return [...candles.slice(0,-1),{...last,close:tick.price,high:Math.max(last.high,tick.price),low:Math.min(last.low,tick.price)}];
  // A new candle opens at the first observed trade, never an invented carry-forward price.
  return [...candles.slice(-299),{time:bucket,open:tick.price,high:tick.price,low:tick.price,close:tick.price,volume:0}];
}
export function useAccumulatedCandles(source:Candle[],tick:TickerTick|null,timeframe:Timeframe,symbol:string){
  const [bars,setBars]=useState(source);useEffect(()=>setBars(source),[source,symbol,timeframe]);useEffect(()=>{if(tick)setBars(previous=>applyTickerToCandles(previous,tick,timeframe));},[tick,timeframe]);return bars;
}
export type LearningMatchInput = { patterns: Pattern[]; strategy: Strategy; candles: Candle[]; market: string; timeframe: Timeframe };
export type ReviewInput = { trade: Trade };
export type LearningMatchResult = Match[];
export type QuotesResult = Quote[];

export const useVisualMatchMutation = () => api.learning.visual.useMutation();
export const useReindexMutation = () => api.learning.reindex.useMutation();
export const useResearchStartMutation = () => api.research.start.useMutation();
export const useResearchJobQuery = (id?: string, enabled = true) => api.research.job.useQuery({id}, {
  enabled, retry:false,
  refetchInterval:query=>query.state.data && ['queued','running'].includes(query.state.data.status)?2500:false,
});

export const useSetupQuery=(input:{market:string;timeframe:Timeframe;strategyIds:string[];combination:'all'|'any';timezone:string;strategies?:Strategy[]},enabled=true)=>api.setup.analyze.useQuery(input,{enabled:enabled&&input.strategyIds.length>0,refetchInterval:30000,staleTime:20000,retry:false});
export const usePaperProposalMutation=()=>api.setup.propose.useMutation();
export const usePaperOrderMutation=()=>api.paper.order.useMutation();
export const usePaperEditMutation=()=>api.paper.edit.useMutation();
export const usePaperCloseMutation=()=>api.paper.close.useMutation();
export const usePaperManageMutation=()=>api.paper.manage.useMutation();
export const usePaperHistoryQuery=(status?:'pending'|'open'|'closed',cursor?:string)=>api.paper.history.useQuery({status,cursor,limit:50},{retry:false,refetchInterval:15000});
export const usePaperDetailQuery=(id?:string)=>api.paper.detail.useQuery({id:id||''},{enabled:Boolean(id),retry:false,staleTime:0,refetchInterval:15000});

export const useCollectionPageQuery = (input:{search:string;collection:'all'|'paperswithbacktest'|'quant-vault'|'sgx-orderbook';offset:number;limit:number},enabled:boolean)=>trpc.research.collections.useQuery(input,{enabled,staleTime:300000,retry:false});
