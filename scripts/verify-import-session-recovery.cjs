// Run from the repository root against the local staging-only QA server on 5182.
// Uses an isolated browser context; does not revoke credentials or alter auth settings.
const {chromium,expect}=require('@playwright/test');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 if(!process.argv[2])throw Error('Usage: node scripts/verify-import-session-recovery.cjs <private-pilot-directory>');
 const account=JSON.parse(readFileSync(resolve(process.argv[2],'accounts.json')))[1];
 if(!/^plot-import-qa-.*@example\.invalid$/.test(account.email))throw Error('Only the approved synthetic QA account is allowed');
 const base=process.env.PLOT_QA_BASE_URL || 'http://127.0.0.1:5182';
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Local QA preview required');
 const errors=[];
 const login=async page=>{
  await page.locator('#auth-email').fill(account.email);
  await page.locator('#auth-password').fill(account.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL('**/home');
 };
 const review=async page=>{
  await page.getByRole('button',{name:'Trakt saved export JSON export'}).click();
  await page.locator('input[type=file]').setInputFiles('packages/core/tests/fixtures/imports/trakt-history.json');
  await expect(page.getByRole('button',{name:'Import →',exact:true})).toBeVisible();
  await expect(page.getByText('0 new · 2 skipped',{exact:true})).toBeVisible();
 };
 try{
  let context=await browser.newContext();let page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  let catalogue=0;
  page.on('response',r=>{if(r.url().includes('tmdb-proxy-staging.sav-black.workers.dev')&&r.status()===200)catalogue++;});
  await page.goto(base+'/login');await login(page);
  await page.getByText('Settings',{exact:true}).first().click();
  await page.getByRole('button',{name:'Import watch history',exact:true}).click();await review(page);
  if(!catalogue)throw Error('No successful deployed catalogue requests');
  console.log('PASS real import preview resolves through deployed staging catalogue');
  let state=await context.storageState();await context.close();
  const expire=state=>{
   const item=state.origins.flatMap(o=>o.localStorage).find(x=>x.name==='sb-uzrhfivnhdcfieuaxzip-auth-token');
   if(!item)throw Error('Missing QA session');
   const session=JSON.parse(item.value);session.expires_at=Math.floor(Date.now()/1000)-3600;item.value=JSON.stringify(session);
  };
  // Controlled client-clock expiry; the real refresh credential remains valid.
  expire(state);context=await browser.newContext({storageState:state});page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));let refreshed=0;
  page.on('response',r=>{if(r.url().includes('grant_type=refresh_token')&&r.status()===200)refreshed++;});
  await page.goto(base+'/import');await review(page);
  if(!refreshed)throw Error('Expected a real successful token renewal');
  console.log('PASS expired cached session renews through real Supabase Auth and restores import access');
  state=await context.storageState();await context.close();expire(state);
  context=await browser.newContext({storageState:state});
  let rejected=0;
  await context.route('**/auth/v1/token?grant_type=refresh_token',route=>{rejected++;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'refresh_token_not_found',message:'Invalid Refresh Token: Refresh Token Not Found'})});});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/import');await page.waitForURL('**/login');
  if(!rejected)throw Error('Expected rejected renewal');
  await expect(page.getByRole('button',{name:'Import →',exact:true})).toHaveCount(0);
  await context.unroute('**/auth/v1/token?grant_type=refresh_token');
  await login(page);await page.getByText('Settings',{exact:true}).first().click();
  await page.getByRole('button',{name:'Import watch history',exact:true}).click();await review(page);
  await page.getByRole('button',{name:'Import →',exact:true}).click();
  await expect(page.getByText('0 entries added · 2 duplicates skipped · 0 not confirmed',{exact:true})).toBeVisible();
  console.log('PASS rejected renewal redirects to sign-in; reselecting the file preserves both watches without duplicates');
  if(errors.length)throw Error('Uncaught page errors: '+errors.join(';'));
  console.log('PASS no uncaught page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1);});
