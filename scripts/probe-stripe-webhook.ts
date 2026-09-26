// Isolated probe of the real handler. Network is replaced before module import.
Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_local_placeholder');
Deno.env.set('STRIPE_WEBHOOK_SECRET', 'local-signing-placeholder');
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:59999');
Deno.env.set('SB_SECRET_KEY', 'local-service-placeholder');
let handler: (req: Request) => Promise<Response>;
Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as typeof Deno.serve;
const seen = new Set<string>();
let billing: Record<string, unknown> | null = null;
let badge: boolean | null = null;
let profileFail = false;
let transactionFail = false;
let currentSubscription: Record<string, unknown>;
let stripeFail = false;
globalThis.fetch = async (input, init) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
 if(url.origin === 'https://api.stripe.com') {
  if(stripeFail) return new Response(JSON.stringify({error:{message:'Unavailable',type:'api_error'}}),{status:503,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify(currentSubscription),{headers:{'content-type':'application/json'}});
 }
 if(url.origin !== 'http://127.0.0.1:59999') throw Error('Unexpected network destination');
 const method = init?.method || 'GET';
 const body = init?.body ? JSON.parse(String(init.body)) : null;
 const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json'}});
 if(url.pathname.endsWith('/rpc/apply_stripe_subscription_snapshot')) {
  if(transactionFail)return json({message:'transaction unavailable'},503);
  if(seen.has(body.p_event_id))return json({duplicate:true});
  if(profileFail)return json({message:'profile unavailable'},503);
  seen.add(body.p_event_id);
  billing={cancel_at_period_end:body.p_cancel_at_period_end};
  badge=['active','trialing','past_due'].includes(body.p_status)
    && Date.parse(body.p_current_period_end)>Date.now()-3*86400000;
  return json({applied:true});
 }
 if(url.pathname.endsWith('/billing_customers') && method === 'GET')return json(null);
 throw Error('Unexpected table');
};
await import('../supabase/functions/stripe-webhook/index.ts');
const now = Math.floor(Date.now()/1000);
async function deliver(id: string, status: string, end: number, cancelAt: number | null = null, currentStatus = status) {
 const event={id,type:'customer.subscription.updated',created:now,data:{object:{id:'sub_local',customer:'cus_local',status,metadata:{supabase_user_id:'qa-local'},items:{data:[{current_period_end:end,price:{id:'price_local'}}]},cancel_at_period_end:false,cancel_at:cancelAt}}};
 currentSubscription={...event.data.object,status:currentStatus};
 const body=JSON.stringify(event);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('local-signing-placeholder'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${now}.${body}`));
 const signature=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 const response=await handler(new Request('http://localhost/webhook',{method:'POST',headers:{'stripe-signature':`t=${now},v1=${signature}`},body}));
 return {status:response.status,body:await response.json()};
}
function check(value: boolean,label: string){if(!value)throw Error(label);console.log('PASS '+label);}
check((await handler(new Request('http://localhost/webhook',{method:'POST',body:'{}'}))).status===400,'unsigned request rejected');
check((await deliver('evt_active','active',now+86400)).status===200&&badge===true,'active subscription enables badge');
const duplicate=await deliver('evt_active','active',now+86400);
check(duplicate.body.duplicate===true,'duplicate delivery acknowledged');
await deliver('evt_portal_cancel','active',now+86400,now+86400);
check(billing?.['cancel_at_period_end']===true,'portal timestamp cancellation is stored');
await deliver('evt_portal_renew','active',now+86400);
check(billing?.['cancel_at_period_end']===false,'portal cancellation reversal is stored');
await deliver('evt_grace','past_due',now-86400);
check(badge===true,'grace-period badge comes from atomic database policy');
await deliver('evt_expired','past_due',now-4*86400);
check(badge===false,'expired grace disables badge');
profileFail=true;
const failed=await deliver('evt_retry','active',now+86400);
check(failed.status===500,'profile write failure returns retryable status');
profileFail=false;
const retried=await deliver('evt_retry','active',now+86400);
check(retried.status===200&&retried.body.applied===true&&badge===true,'failed event retries unfinished update');
transactionFail=true;
check((await deliver('evt_unavailable','active',now+86400)).status===500,'database outage remains retryable');
transactionFail=false;
check((await deliver('evt_unavailable','active',now+86400)).body.applied===true,'database recovery applies event');

await deliver('evt_delayed_active','active',now+86400,null,'canceled');
check(badge===false,'old active event uses current canceled Stripe snapshot');
stripeFail=true;
check((await deliver('evt_stripe_unavailable','active',now+86400)).status===500,'Stripe lookup failure is retryable without stale payload fallback');
stripeFail=false;
check((await deliver('evt_stripe_unavailable','active',now+86400)).body.applied===true,'Stripe recovery applies unfinished event');
