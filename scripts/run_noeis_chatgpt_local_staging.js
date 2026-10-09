#!/usr/bin/env node
/** Full application, loopback only, disposable synthetic DB, no inherited credentials. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const repo = path.resolve(__dirname, '..');
const api = 'http://127.0.0.1:5607';
const appUrl = 'http://127.0.0.1:4307';
const callback = `${appUrl}/chatgpt-test-callback`;
const localModel = process.argv.includes('--local-model');
if (process.argv.slice(2).some(arg => arg !== '--local-model')) throw new Error('Only --local-model is supported; remote targets are not configurable.');
let mongo, child, temp, closing = false;
const close = async code => {
  if (closing) return; closing = true;
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  process.exit(code);
};
process.on('SIGINT', () => close(0));
process.on('SIGTERM', () => close(0));
(async () => {
  // Abort rather than collide with an existing service.
  try { await fetch(`${api}/mcp/health`, {signal:AbortSignal.timeout(300)}); throw new Error('Port 5607 already serves HTTP; refusing reuse.'); } catch(error) { if (error.message.includes('refusing')) throw error; }
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-local-staging-'));
  const binary = path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  if (!fs.existsSync(binary)) throw new Error('Cached Mongo binary required; automatic network download is disabled.');
  mongo = await MongoMemoryServer.create({instance:{ip:'127.0.0.1',dbName:'noeis_synthetic_local_staging'},binary:{systemBinary:binary,version:'8.2.6'}});
  const uri = mongo.getUri();
  const parsed = new URL(uri);
  if (parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password) throw new Error('Non-disposable database URI rejected.');
  await mongoose.connect(uri);
  const { User, Article, NotebookEntry, WikiPage, Edition } = require('../server/models');
  const fixtures=[];
  for(let i=0;i<2;i++) {
    const username = `synthetic_local_reader_${i+1}`;
    const password = 'LoopbackSyntheticOnly123!';
    const user=await User.create({username,password:await bcrypt.hash(password,10)});
    const marker=`SYNTHETIC_ACCOUNT_${i+1}_ONLY`;
    const article=await Article.create({userId:user.id,url:`https://example.com/noeis-synthetic-${i+1}`,title:`Synthetic source ${i+1}`,content:`<p>${marker}: A synthetic author says evidence has limits.</p>`,highlights:[{text:`${marker}: evidence has limits.`,note:'My synthetic reader thought: the claim needs replication.',anchor:{text:`${marker}: evidence has limits.`}}]});
    const notebook=await NotebookEntry.create({userId:user.id,title:`Synthetic notebook ${i+1}`,content:`<p>${marker}: my own thinking.</p>`,linkedArticleId:article.id,linkedHighlightIds:[article.highlights[0].id]});
    const wiki=await WikiPage.create({userId:user.id,title:`Synthetic knowledge ${i+1}`,slug:`synthetic-knowledge-${i+1}`,pageType:'topic',status:'draft',visibility:'private',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:`${marker}: retained private accepted wording.`}]}]},sourceRefs:[{type:'article',objectId:article.id,title:article.title,addedBy:'user'}]});
    const edition=await Edition.create({userId:user.id,profile:'this_week_in_ai',title:'Synthetic evidence paper',windowStart:new Date('2026-09-28T00:00:00Z'),windowEnd:new Date('2026-10-04T23:59:59Z'),items:[],writtenBy:{label:'Synthetic local fixture'}});
    fixtures.push({username,password,userId:user.id,articleId:article.id,highlightId:article.highlights[0].id,notebookId:notebook.id,wikiId:wiki.id,editionId:edition.id,marker});
  }
  await mongoose.disconnect();
  // Empty cwd makes the server's dotenv.config() read no repository/personal .env.
  // Do not copy process.env; only OS executable lookup and disposable explicit config.
  const env={PATH:process.env.PATH||'/usr/bin:/bin',NODE_ENV:'test',HOST:'127.0.0.1',PORT:'5607',MONGODB_URI:uri,JWT_SECRET:crypto.randomBytes(48).toString('hex'),AI_ENABLED:'false',AI_GENERATION_ENABLED:'false',PAID_DATA_SOURCES_ENABLED:'false',ANALYTICS_ENABLED:'false',NOEIS_APP_URL:appUrl,NOEIS_CHATGPT_OAUTH_ISSUER:api,NOEIS_MCP_INTERNAL_API_URL:api,NOEIS_CHATGPT_OAUTH_CLIENTS:JSON.stringify([{client_id:'noeis-loopback-staging',client_name:'NOEIS synthetic loopback staging',redirect_uris:[callback]}])};
  if (localModel) Object.assign(env, { AI_TEXT_UPSTREAM: 'openrouter', OPENROUTER_BASE_URL: 'http://127.0.0.1:11434/v1', OPENROUTER_API_KEY: 'local-fixture-placeholder', OPENROUTER_TEXT_MODEL: 'muse-glimmer:30b-mlx', OPENROUTER_TIMEOUT_MS: '120000', OPENROUTER_TEXT_MODEL_FALLBACKS: 'muse-glimmer:30b-mlx', OPENROUTER_HTTP_REFERER: appUrl });
  if (localModel) for (const route of ['CHAT','TOOL','STRUCTURE','ARTIFACT','CRITIQUE','HYGIENE','DEEP_AUDIT']) env[`OPENROUTER_AGENT_${route}_ROUTES`]='muse-glimmer:30b-mlx';
  for(const name of ['WIKI_SOURCE_EVENT_WORKER_DISABLED','EDGAR_WATCH_WORKER_DISABLED','TRANSCRIPT_WATCH_WORKER_DISABLED','GITHUB_REPO_WATCH_WORKER_DISABLED','READING_WATCH_WORKER_DISABLED','MORNING_PAPER_EMAIL_WORKER_DISABLED','EMBEDDING_JOB_WORKER_DISABLED','EMBEDDING_PERSISTENT_QUEUE_DISABLED','WIKI_SCHEDULED_MAINTENANCE_DISABLED','WIKI_STORAGE_GOVERNOR_DISABLED']) env[name]='true';
  const guard=path.join(temp,'loopback-only.cjs');
  fs.writeFileSync(guard, `const dns=require('node:dns');const original=dns.lookup;dns.lookup=function(host,...args){if(!['127.0.0.1','localhost','::1'].includes(host)){const cb=args[args.length-1];const error=new Error('Synthetic staging blocks external DNS');error.code='ENETUNREACH';if(typeof cb==='function')return queueMicrotask(()=>cb(error));throw error;}return original.call(this,host,...args);};const net=require('node:net');const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const options=typeof args[0]==='object'?args[0]:null;const host=options?.host||(typeof args[1]==='string'?args[1]:'localhost');if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Synthetic staging blocks external socket');return connect.apply(this,args);};`);
  child=spawn(process.execPath,['--require',guard,path.join(repo,'server/server.js')],{cwd:temp,env,stdio:['ignore','inherit','inherit']});
  child.once('exit',code=>{if(!closing) close(code||0);});
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error('Actual server exited before readiness.');
    try {const r=await fetch(`${api}/mcp/health`);if(r.ok) {
      const login=await fetch(`${api}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fixtures[0].username,password:fixtures[0].password})});
      if(!login.ok) throw new Error(`Real login gate failed: ${login.status}`);
      const readiness={runnerPid:process.pid,serverPid:child.pid,api,appUrl,callback,clientId:'noeis-loopback-staging',fixtures,localModel:localModel ? {baseUrl:'http://127.0.0.1:11434/v1',model:'muse-glimmer:30b-mlx'} : null,limits:'Synthetic disposable loopback only. No external API credentials, watchers, email, scheduling or storage workers. Optional model stays loopback. Login gate passed; OAuth grants not pre-created.'};
      const readinessPath=path.join(repo,'output/noeis-plugin/local-staging-fixtures.json');fs.mkdirSync(path.dirname(readinessPath),{recursive:true});fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
      console.log('NOEIS_LOCAL_STAGING_READY '+JSON.stringify(readiness));return;
    }} catch(error) {if(error.message.includes('login gate')) throw error;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('Actual server readiness timed out.');
})().catch(error=>{console.error('Local staging failed:',error.message);close(1);});
