import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActionButton, Card, Header, Pill, Screen, SectionLabel } from '@/components/trading/ui';
import { AccountControls } from '@/components/trading/account-controls';
import { C, formatAge, formatPrice, mono } from '@/components/trading/theme';
import { useWorkspace } from '@/hooks/use-workspace';
import { MARKETS, type Category, type Quote, uid } from '@/lib/trading/model';
import { useCatalogQuery, useMarketStatusQuery, useQuotesQuery } from '@/lib/trading/client';

const CATEGORIES: (Category | 'All')[] = ['All', 'Crypto', 'Forex', 'Metals', 'Indices', 'Stocks', 'Futures'];
const PAGE_SIZE = 12;

function categoryLabel(category: Category | 'All') {
  return category === 'Futures' ? 'Futures (broker only)' : category;
}

function quoteDescription(quote: Quote | undefined, requestError?: string) {
  if (!quote) return requestError || 'Checking timestamped provider quote…';
  if (quote.status === 'unavailable')
    return `${quote.source} · ${quote.message || 'Provider quote unavailable. Retry when the provider is reachable.'}`;
  const age = `${quote.timestampKind === 'received' ? 'received ' : ''}${formatAge(quote.timestamp)}`;
  if (quote.status === 'stale')
    return `${quote.source} · stale ${age} · ${quote.message || 'Past the 120-second quote policy. A candle close is not substituted.'}`;
  return `${quote.source} · ${age} · live quotes stale after 2m`;
}
export default function MarketsScreen() {
  const { workspace, update, setMarket } = useWorkspace(); const router = useRouter();
  const [term,setTerm]=useState(''),[category,setCategory]=useState<Category|'All'>('All'),[feed,setFeed]=useState<'all'|'broker'>('broker'),[page,setPage]=useState(0);
  const catalog=useCatalogQuery(),status=useMarketStatusQuery();const allMarkets=catalog.data?.length?catalog.data:MARKETS;
  // Static NQ/ES placeholders are not a source. Exchange futures appear only when
  // the selected private broker catalog actually exposes a FUTURES instrument.
  const markets=allMarkets.filter(m=>m.category!=='Futures'||m.provider==='tradelocker');
  const brokerCount=markets.filter(m=>m.provider==='tradelocker').length;
  const futuresAvailable=Boolean(status.data?.tradelocker?.connected&&markets.some(m=>m.provider==='tradelocker'&&m.category==='Futures'));
  const list=useMemo(()=>markets.filter(m=>(feed==='all'||m.provider==='tradelocker')&&(category==='All'||m.category===category)&&`${m.id} ${m.providerSymbol} ${m.name}`.toLowerCase().includes(term.toLowerCase())),[markets,feed,category,term]);
  const visible=list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);const quotes=useQuotesQuery(visible.map(m=>m.id));const bySymbol=new Map((quotes.data??[]).map(q=>[q.symbol,q]));
  const choose=(id:string)=>{setMarket(id);router.navigate('/');};
  const favorite=(id:string)=>update(w=>({...w,favorites:w.favorites.includes(id)?w.favorites.filter(s=>s!==id):[...w.favorites,id]}));
  const quickAlert=(id:string,price?:number)=>update(w=>({...w,alerts:[...w.alerts,{id:uid('alert'),name:`${id} price watch`,market:id,timeframe:w.timeframe,strategyId:w.activeStrategyId,kind:'above',price:price??0,enabled:false,cooldownMinutes:30,createdAt:Date.now()}]}));
  return <Screen><Header title="Markets" subtitle="Personal TradeLocker data · simulated trades only"/>
    <Card><Text style={styles.statusTitle}>Your account feed</Text><Text style={styles.statusText}>{status.data?.tradelocker?.message||'Checking private feed access…'}</Text><Pill label={status.data?.tradelocker?.connected?`${brokerCount} BROKER MARKETS`:'SIGN-IN / CONNECTION REQUIRED'} tone={status.data?.tradelocker?.connected?'mint':'amber'}/><Text style={styles.statusText}>Quotes refresh about every 15 seconds; candles every 20 seconds. Broker bid/ask reception time is not a provider timestamp. No broker orders are enabled.</Text>{catalog.error?<Text style={styles.statusText}>{catalog.error.message}</Text>:null}</Card>
    <AccountControls/>
    <Card><View style={styles.search}><Ionicons name="search" size={17} color={C.muted}/><TextInput value={term} onChangeText={v=>{setTerm(v);setPage(0);}} placeholder="Search XAUUSD, NAS100, symbol…" placeholderTextColor={C.muted} style={styles.searchInput}/></View>
      <View style={styles.actions}><ActionButton label="TradeLocker" compact kind={feed==='broker'?'primary':'secondary'} onPress={()=>{setFeed('broker');setPage(0);}}/><ActionButton label="All feeds" compact kind={feed==='all'?'primary':'secondary'} onPress={()=>{setFeed('all');setPage(0);}}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{CATEGORIES.map(item=>{const disabled=item==='Futures'&&!futuresAvailable;return <Pressable key={item} accessibilityRole="button" accessibilityState={{disabled,selected:category===item}} disabled={disabled} onPress={()=>{setCategory(item);setPage(0);}} style={[styles.filter,category===item&&styles.active,disabled&&styles.filterDisabled]}><Text style={[styles.filterText,category===item&&!disabled&&{color:C.black},disabled&&styles.filterTextDisabled]}>{categoryLabel(item)}</Text></Pressable>;})}</ScrollView>
    </Card>
    <SectionLabel>{`${list.length} matching instruments · page ${page+1}`}</SectionLabel>
    {visible.map(m=>{const q=bySymbol.get(m.id),unavailable=q?.status==='unavailable';return <Card key={m.id}><Pressable onPress={()=>choose(m.id)} style={styles.marketMain}><View style={{flex:1}}><Text style={styles.symbol}>{m.providerSymbol}</Text><Text style={styles.name}>{m.name}</Text><Text style={[styles.feed,q?.status==='stale'&&styles.stale,q?.status==='unavailable'&&styles.unavailable]}>{quoteDescription(q,quotes.error?.message)}</Text></View><View style={styles.quoteSide}><Text style={styles.quote}>{formatPrice(unavailable?undefined:q?.price,m.precision)}</Text><Text style={styles.feed}>{q&&!unavailable&&q.changeAvailable!==false?`${q.change>=0?'+':''}${q.change.toFixed(2)}%`:'—'}</Text><Pill label={m.category} tone="muted"/></View></Pressable><View style={styles.actions}><Pressable onPress={()=>favorite(m.id)} hitSlop={8}><Ionicons name={workspace.favorites.includes(m.id)?'star':'star-outline'} size={18} color={C.lime}/></Pressable><Pressable onPress={()=>quickAlert(m.id,unavailable?undefined:q?.price)} hitSlop={8}><Ionicons name="notifications-outline" size={18} color={C.muted}/></Pressable>{(unavailable||q?.status==='stale')?<ActionButton label={quotes.isFetching?'Checking…':'Retry quote'} compact kind="secondary" disabled={quotes.isFetching} onPress={()=>void quotes.refetch()}/>:null}<ActionButton label="Chart" compact kind="secondary" onPress={()=>choose(m.id)}/></View></Card>;})}
    {!visible.length?<Card><Text style={styles.note}>{feed==='broker'&&!brokerCount?'Sign in with the authorized Manus account to see your private broker instruments. The public Coinbase feed remains under All feeds.':category==='Futures'&&!futuresAvailable?'Futures (broker only) is unavailable until your selected TradeLocker account exposes a FUTURES instrument. No cash-index or sample substitute is shown.':'No instruments match. Try another search or feed.'}</Text></Card>:null}
    <View style={styles.actions}><ActionButton label="Previous" compact kind="secondary" disabled={page===0} onPress={()=>setPage(p=>p-1)}/><ActionButton label="Next" compact kind="secondary" disabled={(page+1)*PAGE_SIZE>=list.length} onPress={()=>setPage(p=>p+1)}/></View>
    <Card><Text style={styles.note}>Broker CFDs retain their actual provider names and types; they are not NQ/ES exchange futures. Paper quantity is price units, not broker lots. Instruments without a supported USD valuation can be charted, but paper planning remains disabled. Missing feeds are never silently replaced with sample bars.</Text></Card>
  </Screen>;
}
const styles=StyleSheet.create({search:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.black+'88',borderWidth:1,borderColor:C.border,borderRadius:11,paddingHorizontal:11},searchInput:{flex:1,color:C.text,height:42,fontSize:14},filters:{gap:7},filter:{paddingHorizontal:11,paddingVertical:7,borderRadius:9,backgroundColor:C.black+'66'},filterDisabled:{opacity:0.4},active:{backgroundColor:C.lime},filterText:{color:C.muted,fontSize:11,fontWeight:'800'},filterTextDisabled:{color:C.muted},statusTitle:{color:C.text,fontSize:14,fontWeight:'800'},statusText:{color:C.muted,fontSize:11,lineHeight:16},marketMain:{flexDirection:'row',gap:10},symbol:{color:C.text,fontFamily:mono,fontSize:16,fontWeight:'800'},name:{color:C.text,fontSize:11},feed:{color:C.muted,fontSize:10,lineHeight:14},stale:{color:C.amber},unavailable:{color:C.rose},quoteSide:{alignItems:'flex-end'},quote:{color:C.text,fontFamily:mono,fontSize:14},actions:{flexDirection:'row',gap:12,alignItems:'center',justifyContent:'flex-end'},note:{color:C.muted,fontSize:11,lineHeight:17}});
