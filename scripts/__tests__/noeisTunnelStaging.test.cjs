const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArguments } = require('../run_noeis_chatgpt_tunnel_staging');
test('exact temporary HTTPS origin produces synthetic review callback only', () => {
  const config = parseArguments(['--public-origin','https://bounded-review.trycloudflare.com']);
  assert.equal(config.publicOrigin,'https://bounded-review.trycloudflare.com');
  assert.equal(config.clients[0].client_id,'noeis-chatgpt-review');
  assert.deepEqual(config.clients[0].redirect_uris,['https://bounded-review.trycloudflare.com/chatgpt-test-callback']);
  assert.equal(config.localModel,false);
});
test('rejects alternate hosts, credentials, ports, URL suffixes and undocumented flags', () => {
  for (const origin of ['https://api.noeis.io','http://bounded-review.trycloudflare.com','https://nested.bounded-review.trycloudflare.com','https://bounded-review.trycloudflare.com/path','https://bounded-review.trycloudflare.com/','https://bounded-review.trycloudflare.com?next=attacker','https://u:p@bounded-review.trycloudflare.com','https://bounded-review.trycloudflare.com:8443']) assert.throws(()=>parseArguments(['--public-origin',origin]));
  assert.throws(()=>parseArguments(['--public-origin','https://bounded-review.trycloudflare.com','--unknown']));
});
test('client callbacks come only from exact private mode600 supplied configuration', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'noeis-client-config-test-'));
  const file=path.join(dir,'clients.json');
  try {
    const clients=[{client_id:'explicit-test-client',redirect_uris:['https://observed-callback.example/oauth-return']}];
    fs.writeFileSync(file,JSON.stringify(clients),{mode:0o600});
    const args=['--public-origin','https://bounded-review.trycloudflare.com','--clients-file',file,'--local-model'];
    const config=parseArguments(args);assert.deepEqual(config.clients,clients);assert.equal(config.localModel,true);
    fs.chmodSync(file,0o644);assert.throws(()=>parseArguments(args));
    fs.chmodSync(file,0o600);fs.writeFileSync(file,JSON.stringify([{client_id:'bad',redirect_uris:['http://public.example/callback']} ]));assert.throws(()=>parseArguments(args));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
