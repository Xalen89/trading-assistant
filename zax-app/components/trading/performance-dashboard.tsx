import { useEffect, useState } from 'react';
import { Text,View,StyleSheet } from 'react-native';
import type { Trade } from '@/lib/trading/model';
import { paperPerformance } from '@/lib/trading/paper-performance';
import { useQuotesQuery } from '@/lib/trading/client';
import { Card,Pill } from './ui';
import { C,mono } from './theme';
export function PerformanceDashboard({trades,startingBalance,dailyDrawdownLimitPct}:{trades:Trade[];startingBalance:number;dailyDrawdownLimitPct?:number}){
  const [now,setNow]=useState(Date.now);useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(t);},[]);
  const symbols=[...new Set(trades.filter(t=>t.status==='open').map(t=>t.market))].slice(0,40),quotes=useQuotesQuery(symbols);
  const p=paperPerformance(trades,startingBalance,quotes.data||[],now),cap=dailyDrawdownLimitPct;
  return <Card><Pill label="PAPER PERFORMANCE · RECORDED DATA" tone="amber"/><View style={styles.row}><Cell label="OPEN P/L" value={p.openPnl===null?'Unknown':`$${p.openPnl.toFixed(2)}`} good={p.openPnl!==null&&p.openPnl>=0}/><Cell label="OPEN RISK" value={`$${p.openRisk.toFixed(2)}`}/><Cell label="MEAN R:R" value={p.meanRR?.toFixed(2)??'—'}/></View><View style={styles.row}><Cell label="REALIZED P/L" value={`$${p.realized.toFixed(2)}`}/><Cell label="DAILY REALISED DD" value={p.todayClosedDrawdownPct===null?'Unknown':p.todayClosedDrawdownPct.toFixed(2)+'%'}/><Cell label="PAPER CAP" value={cap===undefined?'Unset':cap+'%'}/></View><Text style={styles.note}>UTC-day closed-trade peak drawdown, not live intraday/open-equity drawdown. P/L uses simulated price units, not broker lots; excludes spreads/fees/slippage.</Text>{p.missing.length?<Text style={styles.note}>Fresh quotes missing: {p.missing.join(', ')}. Aggregate open P/L is not fabricated.</Text>:null}{cap!==undefined&&p.todayClosedDrawdownPct!==null&&p.todayClosedDrawdownPct>=cap?<Text style={[styles.note,{color:C.rose}]}>Configured paper drawdown cap reached. No broker setting or order was changed.</Text>:null}</Card>;
}
function Cell({label,value,good}:{label:string;value:string;good?:boolean}){return <View style={{flex:1}}><Text style={styles.label}>{label}</Text><Text style={[styles.value,{color:good?C.mint:C.text}]}>{value}</Text></View>;}
const styles=StyleSheet.create({row:{flexDirection:'row',gap:8},label:{color:C.muted,fontSize:8,fontWeight:'800'},value:{color:C.text,fontFamily:mono,fontSize:13,fontWeight:'700',marginTop:4},note:{color:C.muted,fontSize:10,lineHeight:15}});
