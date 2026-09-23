import test from 'node:test';
import assert from 'node:assert/strict';
import { pollPlexAuthorization } from '../../plexAuthorization.js';

test('Plex PIN polling accepts the actual authorized response after pending', async () => {
  let polls=0;
  await new Promise((resolve,reject) => pollPlexAuthorization({
    request: async () => ({status: ++polls === 1 ? 'pending' : 'authorized'}),
    onAuthorized:resolve,onError:reject,intervalMs:1,timeoutMs:1000,
  }));
  assert.equal(polls,2);
});
test('Plex polling reports expiration and fences a late authorization after cancellation', async () => {
  let message;
  await new Promise(resolve => pollPlexAuthorization({request:async()=>({status:'expired'}),onAuthorized:()=>assert.fail('Expired PIN accepted'),onError:value=>{message=value;resolve();},timeoutMs:1000}));
  assert.match(message,/expired/);
  let deliver;
  let completed=false;
  const cancel=pollPlexAuthorization({request:()=>new Promise(resolve=>{deliver=resolve;}),onAuthorized:()=>{completed=true;},onError:()=>assert.fail('Cancelled poll reported an error'),timeoutMs:1000});
  cancel(); deliver({status:'authorized'});
  await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(completed,false);
});
