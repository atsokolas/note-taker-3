#!/usr/bin/env node
/** Disposable synthetic API behind a separately reviewed, default-deny gateway. Never tunnel this port directly. */
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
const parseArguments = args => {
  const values = {}; let localModel = false;
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--local-model') { localModel = true; continue; }
    if (!['--public-origin','--clients-file'].includes(args[i]) || !args[i+1] || values[args[i]]) throw new Error('Use --public-origin HTTPS_TRYCLOUDFLARE_ORIGIN [--clients-file PRIVATE_CONFIG] [--local-model].');
    values[args[i]] = args[++i];
  }
  const raw = values['--public-origin'];
  const url = new URL(raw || 'invalid');
  if (url.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || raw !== url.origin) throw new Error('Public origin must be an exact HTTPS single-label trycloudflare origin; no paths, ports or credentials.');
  let clients = [{client_id:'noeis-chatgpt-review',client_name:'NOEIS synthetic review (not ChatGPT)',redirect_uris:[`${url.origin}/chatgpt-test-callback`]}];
  if (values['--clients-file']) {
    const file = path.resolve(values['--clients-file']);
    const stat = fs.lstatSync(file);
    if (!file.startsWith(os.tmpdir()+path.sep) && !file.startsWith('/tmp/')) throw new Error('Client configuration must be private temporary data, not a repository file.');
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Client configuration must be a regular private mode600 file.');
    clients = JSON.parse(fs.readFileSync(file,'utf8'));
    require('../server/services/chatgptOAuthConfig').readChatgptOAuthConfig({NOEIS_CHATGPT_OAUTH_ISSUER:url.origin,NOEIS_APP_URL:url.origin,NOEIS_CHATGPT_OAUTH_CLIENTS:JSON.stringify(clients)});
  }
  return { publicOrigin:url.origin, clients, localModel };
};
module.exports = { parseArguments };
const main = async () => {
const { publicOrigin:appUrl, clients, localModel } = parseArguments(process.argv.slice(2));
const callback = clients[0].redirect_uris[0];
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
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-tunnel-staging-'));
  const binary = path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  if (!fs.existsSync(binary)) throw new Error('Cached Mongo binary required; automatic network download is disabled.');
  mongo = await MongoMemoryServer.create({instance:{ip:'127.0.0.1',dbName:'noeis_synthetic_tunnel_staging'},binary:{systemBinary:binary,version:'8.2.6'}});
  const uri = mongo.getUri();
  const parsed = new URL(uri);
  if (parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password) throw new Error('Non-disposable database URI rejected.');
  await mongoose.connect(uri);
  const { User, Article, NotebookEntry, WikiPage, Edition } = require('../server/models');
  const fixtures=[];
  for(let i=0;i<2;i++) {
    const username = `synthetic_review_${crypto.randomBytes(8).toString('hex')}`;
    const password = crypto.randomBytes(32).toString('base64url');
    const user=await User.create({username,password:await bcrypt.hash(password,10)});
    const marker=`SYNTHETIC_ACCOUNT_${i+1}_ONLY`;
    const topic = 'Replication limits in synthetic evaluation';
    const dimensions = ['Measurement design', 'Repeated trials', 'Sampling uncertainty', 'Distribution shifts', 'Failure reporting', 'Independent replication'];
    const articles=[];
    for (let j=0;j<6;j++) {
      const paragraphs = [
        `${marker}. This is fictional synthetic test material about ${topic.toLowerCase()}, written solely for a disposable integration fixture. No real experiment, researcher, institution or publication is represented. ${dimensions[j]} is the specific mechanism considered in this source.`,
        `Replication limits in synthetic evaluation begin with the difference between a measured result and a justified general claim. A measurement reports the outcome of a specified procedure on a specified sample. An independent replication repeats the procedure with new material while recording the same inclusion rule, score definition and decision threshold. Within this fictional fixture, the procedure compares two scoring rules across repeated batches. The comparison is useful because it makes the assumed connection between measurement design and repeated outcomes visible.`,
        `The mechanism for ${dimensions[j].toLowerCase()} is to state the test condition before interpreting its result. A fictional batch contains one hundred synthetic cases assigned to ten groups. The observed score can vary when the groups are resampled, even though the scoring rule is fixed. Reporting only the best batch would conceal that uncertainty. Reporting every batch, its inclusion rule and its failure mode lets another reader inspect how the conclusion depends on those choices. This description is a teaching example and does not assert a statistical guarantee.`,
        `A worked fictional example illustrates the limit. Suppose one scoring rule succeeds on eight of ten groups and another succeeds on seven. Those counts alone do not establish superiority because the group membership and outcome dependence remain unspecified. An independent reproduction would preserve the original case definitions, rerun the evaluation on new groups and report the full distribution. A disagreement between repetitions becomes useful evidence rather than a reason to suppress the new result. The authorship and source boundary must stay attached to both the original observation and the reader's interpretation.`,
        `Several limitations follow. A test restricted to one distribution cannot justify claims about another distribution. A sample chosen after observing failures cannot be treated as an independently selected sample. Repeated measurements on shared cases may share the same source of error. A confidence statement requires explicit assumptions that this synthetic source does not supply. The narrow conclusion is that ${dimensions[j].toLowerCase()} should be recorded as an observable part of an evaluation protocol, not silently inferred from a single favorable result.`,
        `The counterexample is a perfectly reproducible mistake: repeating a flawed scoring rule can yield stable agreement while measuring the wrong property. Replication therefore needs a substantive account of the measured property as well as repeated numbers. In this fictional fixture, the property is whether a synthetic answer identifies an intentionally introduced inconsistency. If the scoring rule instead rewards length, repetition could stabilize an irrelevant signal. Another investigator would need to examine the rule and the introduced inconsistency before treating the score as evidence.`,
        `Open questions remain about the number of independent repetitions, the relevance of new distributions and the sensitivity of the scoring rule to ambiguous cases. This source gives no universal threshold and recommends no production decision. Its durable contribution is the explicit relationship between a bounded test procedure, its observed outcome and the limitations on interpretation. A reader may disagree with that contribution, but the disagreement should be stored as the reader's own thought with this fictional source identity preserved. All content remains synthetic and private to the temporary test account.`
      ];
      const text = `${marker}: ${dimensions[j]} matters for replication limits in synthetic evaluation.`;
      articles.push(await Article.create({userId:user.id,url:`https://example.com/noeis-review-${i+1}-source-${j+1}`,title:`${topic}: ${dimensions[j]} (fictional fixture)`,content:paragraphs.map(p=>`<p>${p}</p>`).join(''),author:'Synthetic fixture author',highlights:[{text,note:'My synthetic reader thought: this bounded result still needs independent replication.',anchor:{text}}]}));
    }
    const article=articles[0];
    const notebook=await NotebookEntry.create({userId:user.id,title:`Synthetic notebook ${i+1}`,content:`<p>${marker}: my own thinking.</p>`,linkedArticleId:article.id,linkedHighlightIds:[article.highlights[0].id]});
    const wiki=await WikiPage.create({userId:user.id,title:topic,slug:`synthetic-replication-limits-${i+1}`,pageType:'topic',status:'draft',visibility:'private',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:`${marker}: retained private wording about replication limits in synthetic evaluation.`}]}]},sourceRefs:articles.map(source=>({type:'article',objectId:source.id,title:source.title,url:source.url,addedBy:'user'}))});
    const edition=await Edition.create({userId:user.id,profile:'this_week_in_ai',title:'Synthetic evidence paper',windowStart:new Date('2026-09-28T00:00:00Z'),windowEnd:new Date('2026-10-04T23:59:59Z'),items:[],writtenBy:{label:'Synthetic local fixture'}});
    fixtures.push({username,password,sourceIds:articles.map(source=>source.id),userId:user.id,articleId:article.id,highlightId:article.highlights[0].id,notebookId:notebook.id,wikiId:wiki.id,editionId:edition.id,marker});
  }
  await mongoose.disconnect();
  // Empty cwd makes the server's dotenv.config() read no repository/personal .env.
  // Do not copy process.env; only OS executable lookup and disposable explicit config.
  const signingKey = crypto.randomBytes(48).toString('hex');
  const credentialsFile=path.join(temp,'private-fixture-credentials.json');
  fs.writeFileSync(credentialsFile,JSON.stringify({syntheticOnly:true,fixtures,signingKey}),{mode:0o600});
  const ownerLoginFile=path.join(temp,'owner-login.txt');
  fs.writeFileSync(ownerLoginFile,`Temporary synthetic NOEIS account — this runner only\n\nLogin origin: ${appUrl}\nUsername: ${fixtures[0].username}\nPassword: ${fixtures[0].password}\n\nUse only for the explicitly approved synthetic connection. Deleted when the runner stops. No personal or production account is involved.\n`,{mode:0o600});
  const env={PATH:process.env.PATH||'/usr/bin:/bin',NODE_ENV:'test',HOST:'127.0.0.1',PORT:'5607',NOEIS_MCP_JSON_RESPONSES:'true',MONGODB_URI:uri,JWT_SECRET:signingKey,AI_ENABLED:'false',AI_GENERATION_ENABLED:'false',PAID_DATA_SOURCES_ENABLED:'false',ANALYTICS_ENABLED:'false',NOEIS_APP_URL:appUrl,NOEIS_CHATGPT_OAUTH_ISSUER:appUrl,NOEIS_MCP_INTERNAL_API_URL:api,NOEIS_CHATGPT_OAUTH_CLIENTS:JSON.stringify(clients)};
  if (localModel) Object.assign(env, { AI_TEXT_UPSTREAM: 'openrouter', OPENROUTER_BASE_URL: 'http://127.0.0.1:11434/v1', OPENROUTER_API_KEY: 'local-fixture-placeholder', OPENROUTER_TEXT_MODEL: 'muse-glimmer:30b-mlx', OPENROUTER_TIMEOUT_MS: '120000', OPENROUTER_TEXT_MODEL_FALLBACKS: 'muse-glimmer:30b-mlx', OPENROUTER_HTTP_REFERER: appUrl });
  if (localModel) for (const route of ['CHAT','TOOL','STRUCTURE','ARTIFACT','CRITIQUE','HYGIENE','DEEP_AUDIT']) env[`OPENROUTER_AGENT_${route}_ROUTES`]='muse-glimmer:30b-mlx';
  for(const name of ['WIKI_SOURCE_EVENT_WORKER_DISABLED','EDGAR_WATCH_WORKER_DISABLED','TRANSCRIPT_WATCH_WORKER_DISABLED','GITHUB_REPO_WATCH_WORKER_DISABLED','READING_WATCH_WORKER_DISABLED','MORNING_PAPER_EMAIL_WORKER_DISABLED','EMBEDDING_WARM_PING_DISABLED','EMBEDDING_JOB_WORKER_DISABLED','EMBEDDING_PERSISTENT_QUEUE_DISABLED','WIKI_SCHEDULED_MAINTENANCE_DISABLED','WIKI_STORAGE_GOVERNOR_DISABLED']) env[name]='true';
  const guard=path.join(temp,'loopback-only.cjs');
  fs.writeFileSync(guard, `const dns=require('node:dns');const original=dns.lookup;dns.lookup=function(host,...args){if(!['127.0.0.1','localhost','::1'].includes(host)){const cb=args[args.length-1];const error=new Error('Synthetic staging blocks external DNS');error.code='ENETUNREACH';if(typeof cb==='function')return queueMicrotask(()=>cb(error));throw error;}return original.call(this,host,...args);};const net=require('node:net');const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const options=typeof args[0]==='object'?args[0]:null;const host=options?.host||(typeof args[1]==='string'?args[1]:'localhost');if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Synthetic staging blocks external socket');return connect.apply(this,args);};`);
  child=spawn(process.execPath,['--require',guard,path.join(repo,'server/server.js')],{cwd:temp,env,stdio:['ignore','inherit','inherit']});
  child.once('exit',code=>{if(!closing) close(code||0);});
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error('Actual server exited before readiness.');
    try {const r=await fetch(`${api}/mcp/health`);if(r.ok) {
      const login=await fetch(`${api}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fixtures[0].username,password:fixtures[0].password})});
      if(!login.ok) throw new Error(`Real login gate failed: ${login.status}`);
      const readiness={runnerPid:process.pid,serverPid:child.pid,api,publicOrigin:appUrl,callback,clientId:clients[0].client_id,credentialsFile,ownerLoginFile,fixtures:fixtures.map(({username,password,...publicFixture})=>publicFixture),oauthGrantsCreated:false,localModel:localModel ? {baseUrl:'http://127.0.0.1:11434/v1',model:'muse-glimmer:30b-mlx'} : null,limits:'Fresh synthetic-only API on loopback behind separately reviewed gateway. No production credentials or data. Random login/JWT material is private temp mode600. No grants created; exact predefined client callback only. JSON MCP responses enabled. No external API calls, email, watches or schedules.'};
      const readinessPath=path.join(repo,'output/noeis-plugin/tunnel-staging-fixtures.json');fs.mkdirSync(path.dirname(readinessPath),{recursive:true});fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
      console.log('NOEIS_TUNNEL_STAGING_READY '+JSON.stringify(readiness));return;
    }} catch(error) {if(error.message.includes('login gate')) throw error;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('Actual server readiness timed out.');
})().catch(error=>{console.error('Tunnel staging failed:',error.message);close(1);});
};
if (require.main === module) main().catch(error=>{console.error('Tunnel staging configuration rejected:',error.message);process.exitCode=1;});
