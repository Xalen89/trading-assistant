import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Text, View } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc";
import { deviceLocalLock } from "@/lib/trading/device-local-lock";
import { LocalAppLock } from "./local-app-lock";
import { C } from "./theme";
const RESET_KEY = "zax.local-pin.owner-reauth-request.v1";

export function OwnerPrivacyBoundary({ children }: {children:ReactNode}) {
  const access = trpc.auth.access.useQuery(undefined,{retry:false,refetchInterval:15000});
  const {workspace} = useWorkspace();
  const {logout} = useAuth();
  const utils = trpc.useUtils();
  const [background,setBackground] = useState(AppState.currentState !== "active");
  const [recoveryBusy,setRecoveryBusy] = useState(false);
  const [recoveryError,setRecoveryError] = useState<string>();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setBackground(state !== "active"));
    return () => subscription.remove();
  },[]);
  useEffect(() => {
    if (!access.data?.allowed) return;
    let stopped = false;
    void AsyncStorage.getItem(RESET_KEY).then(async value => {
      if (!value || stopped) return;
      const requestedAt = Number(value);
      if (!Number.isFinite(requestedAt) || requestedAt > Date.now() || Date.now()-requestedAt > 86400000) {
        await AsyncStorage.removeItem(RESET_KEY); return;
      }
      setRecoveryBusy(true);
      try {
        // This marker is written only after the old owner session was verified signed out.
        await deviceLocalLock.resetAfterReauthentication();
        await AsyncStorage.removeItem(RESET_KEY);
      } catch { if(!stopped) setRecoveryError("PIN recovery could not finish. Sign out and sign back in to retry; private data is unchanged."); }
      finally { if(!stopped) setRecoveryBusy(false); }
    });
    return () => {stopped=true;};
  },[access.data?.allowed]);
  const recover = async () => {
    await logout();
    const signedOut = await utils.auth.access.fetch();
    if (signedOut.allowed) throw new Error("The old owner session is still active; no PIN was reset.");
    await AsyncStorage.setItem(RESET_KEY,String(Date.now()));
    await utils.auth.access.invalidate();
    return false;
  };
  if (recoveryBusy) return <View style={{flex:1,backgroundColor:C.bg,justifyContent:"center",padding:24}}><Text style={{color:C.text}}>Restoring private device access after owner sign-in…</Text></View>;
  const content = <View style={{flex:1}}>{children}{recoveryError?<Text style={{color:C.rose}}>{recoveryError}</Text>:null}{background && access.data?.allowed && workspace.settings.hideValuesOnBackground !== false ? <View style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:C.bg,justifyContent:"center",alignItems:"center"}} accessibilityViewIsModal><Text style={{color:C.lime,fontWeight:"900",fontSize:24}}>ZAX PRIVATE</Text><Text style={{color:C.muted,marginTop:12}}>Balances, P/L and source content hidden.</Text></View>:null}</View>;
  return access.data?.allowed ? <LocalAppLock service={deviceLocalLock} onRequestReauthentication={recover}>{content}</LocalAppLock> : content;
}
