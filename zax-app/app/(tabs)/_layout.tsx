import { OwnerGate } from '@/components/trading/owner-gate';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/components/trading/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 7);
  return <OwnerGate><Tabs screenOptions={{ headerShown:false, tabBarActiveTintColor:C.lime, tabBarInactiveTintColor:C.muted, tabBarStyle:{backgroundColor:C.surface,borderTopColor:C.border,height:54+bottom,paddingTop:5,paddingBottom:bottom}, tabBarLabelStyle:{fontSize:9,fontWeight:'700'}, tabBarItemStyle:{paddingHorizontal:0}, tabBarHideOnKeyboard:true }}>
    <Tabs.Screen name="index" options={{title:'Chart',tabBarIcon:({color})=><Ionicons name="analytics-outline" size={21} color={color}/>}}/>
    <Tabs.Screen name="markets" options={{title:'Markets',tabBarIcon:({color})=><Ionicons name="pulse-outline" size={21} color={color}/>}}/>
    <Tabs.Screen name="trades" options={{title:'Trades',tabBarIcon:({color})=><Ionicons name="swap-horizontal-outline" size={21} color={color}/>}}/>
    <Tabs.Screen name="alerts" options={{title:'Alerts',tabBarIcon:({color})=><Ionicons name="notifications-outline" size={21} color={color}/>}}/>
    <Tabs.Screen name="strategies" options={{title:'Strategies',tabBarIcon:({color})=><Ionicons name="layers-outline" size={21} color={color}/>}}/>
    <Tabs.Screen name="library" options={{title:'My Library',tabBarIcon:({color})=><Ionicons name="folder-open-outline" size={21} color={color}/>}}/>
  </Tabs></OwnerGate>;
}
