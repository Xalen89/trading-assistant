import { trpc } from '@/lib/trpc';
import { clearExpectedNativeOAuthState, getExpectedNativeOAuthState, startOAuthLogin } from '@/constants/oauth';
import * as Api from '@/lib/_core/api';
import * as Auth from '@/lib/_core/auth';
import { createOAuthCompletion } from '@/lib/_core/oauth-completion';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CallbackParams = { code?: string; state?: string; error?: string };
function toAuthUser(user: NonNullable<Awaited<ReturnType<typeof Api.getMe>>>): Auth.User {
  return { id:user.id, openId:user.openId, name:user.name, email:user.email, loginMethod:user.loginMethod, lastSignedIn:new Date(user.lastSignedIn) };
}
async function readCallbackParams(params:CallbackParams):Promise<CallbackParams> {
  if(params.code||params.state||params.error)return params;
  const initialUrl=await Linking.getInitialURL();if(!initialUrl)return {};
  try { const url=new URL(initialUrl);return {code:url.searchParams.get('code')??undefined,state:url.searchParams.get('state')??undefined,error:url.searchParams.get('error')??undefined}; }
  catch { return {}; }
}
async function completeCallback(params:CallbackParams):Promise<void> {
  const callback=await readCallbackParams(params);
  if(callback.error)throw new Error('Sign-in was cancelled or denied. Start a new sign-in request.');
  if(!callback.code||!callback.state)throw new Error('Missing sign-in response. Start a new sign-in request.');
  if(Platform.OS==='web') {
    await Api.completeWebOAuth(callback.code,callback.state);
  } else {
    const expectedState=await getExpectedNativeOAuthState();
    if(!expectedState||expectedState!==callback.state)throw new Error('This response does not match the sign-in request. Start again.');
    await clearExpectedNativeOAuthState();
    const exchange=await Api.exchangeOAuthCode(callback.code,callback.state);
    if(!exchange.sessionToken)throw new Error('Sign-in did not return a session.');
    await Auth.setSessionToken(exchange.sessionToken);
  }
  const user=await Api.getMe();
  if(!user) {
    if(Platform.OS!=='web'){await Auth.removeSessionToken();await Auth.clearUserInfo();}
    throw new Error('The new session could not be validated. In web Preview, try a standalone tab with cookies enabled.');
  }
  await Auth.setUserInfo(toAuthUser(user));
}
export default function OAuthCallback() {
  const utils=trpc.useUtils();const router=useRouter();const params=useLocalSearchParams<CallbackParams>();
  const code=typeof params.code==='string'?params.code:undefined;
  const state=typeof params.state==='string'?params.state:undefined;
  const error=typeof params.error==='string'?params.error:undefined;
  const completion=useRef(createOAuthCompletion());
  const [status,setStatus]=useState<'processing'|'success'|'error'>('processing');
  const [errorMessage,setErrorMessage]=useState<string|null>(null);
  const [retrying,setRetrying]=useState(false);
  useEffect(()=>{
    let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const snapshot={code,state,error};const key=JSON.stringify(snapshot);
    // Effect cleanup cancels only its UI subscription, never the shared one-use exchange.
    completion.current(key,()=>completeCallback(snapshot)).then(()=>{
      if(cancelled)return;void utils.auth.access.invalidate();setStatus('success');
      timer=setTimeout(()=>{if(!cancelled)router.replace('/(tabs)');},700);
    },reason=>{if(!cancelled){setStatus('error');setErrorMessage(reason instanceof Error?reason.message:'Failed to complete sign-in.');}});
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[code,state,error,router,utils.auth.access]);
  const retry=async()=>{setRetrying(true);try{await startOAuthLogin();}catch{setErrorMessage('Could not start sign-in. Return to the app and try again.');}finally{setRetrying(false);}};
  return <SafeAreaView style={styles.safe} edges={['top','bottom','left','right']}>
    <View style={styles.content}>
      {status==='processing'?<><ActivityIndicator size="large"/><Text style={styles.text}>Completing secure sign-in…</Text></>:null}
      {status==='success'?<><Text style={styles.title}>Signed in</Text><Text style={styles.text}>Returning to your paper workspace…</Text></>:null}
      {status==='error'?<><Text style={styles.errorTitle}>Sign-in failed</Text><Text style={styles.text}>{errorMessage}</Text><Pressable accessibilityRole="button" disabled={retrying} onPress={()=>void retry()} style={styles.button}><Text style={styles.buttonText}>{retrying?'Opening…':'Try sign-in again'}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.replace('/(tabs)')} style={styles.back}><Text style={styles.text}>Return to the app</Text></Pressable></>:null}
    </View>
  </SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#111512'},content:{flex:1,backgroundColor:'#111512',alignItems:'center',justifyContent:'center',gap:18,padding:24},text:{color:'#dce3db',fontSize:15,lineHeight:22,textAlign:'center',maxWidth:420},title:{color:'#dcf275',fontSize:22,fontWeight:'800'},errorTitle:{color:'#ff8b91',fontSize:22,fontWeight:'800'},button:{backgroundColor:'#dcf275',paddingHorizontal:24,paddingVertical:13,borderRadius:12},buttonText:{color:'#111512',fontSize:14,fontWeight:'800'},back:{padding:12}});
