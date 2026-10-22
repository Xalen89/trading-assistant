import { useEffect,useState } from 'react';
import { AccessibilityInfo,Animated,Pressable,Text,StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useWorkspace } from '@/hooks/use-workspace';
import { C } from './theme';
export function ForegroundAlertPill(){
  const {workspace,update}=useWorkspace(),router=useRouter(),[now,setNow]=useState(Date.now),[reduced,setReduced]=useState(true);
  const [opacity]=useState(()=>new Animated.Value(0));
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{clearInterval(t);sub.remove();};},[]);
  const event=[...workspace.events].sort((a,b)=>b.createdAt-a.createdAt).find(e=>!e.read&&e.createdAt<=now&&now-e.createdAt<15000);
  useEffect(()=>{if(!event)return;opacity.setValue(reduced?1:0);if(!reduced)Animated.timing(opacity,{toValue:1,duration:220,useNativeDriver:true}).start();return()=>opacity.stopAnimation();},[event,opacity,reduced]);
  if(!event)return null;
  const jump=()=>{update(w=>({...w,market:event.market,timeframe:event.timeframe,activeStrategyId:w.strategies.some(s=>s.id===event.strategyId)?event.strategyId:w.activeStrategyId,events:w.events.map(e=>e.id===event.id?{...e,read:true}:e)}));router.navigate({pathname:'/',params:{alertId:event.id}});};
  return <Animated.View style={[styles.pill,{opacity,transform:[{translateY:opacity.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}]}><Pressable accessibilityRole="button" onPress={jump}><Text style={styles.title}>{event.title} → Chart</Text><Text style={styles.text}>{event.market} · {event.timeframe} · {event.source}</Text></Pressable><Pressable accessibilityLabel="Dismiss foreground alert" onPress={()=>update(w=>({...w,events:w.events.map(e=>e.id===event.id?{...e,read:true}:e)}))}><Text style={styles.text}>Dismiss</Text></Pressable></Animated.View>;
}
const styles=StyleSheet.create({pill:{position:'absolute',bottom:92,left:16,right:16,zIndex:1000,backgroundColor:C.surface2,borderWidth:1,borderColor:C.amber,borderRadius:18,padding:13,gap:7},title:{color:C.amber,fontWeight:'800',fontSize:13},text:{color:C.muted,fontSize:11}});
