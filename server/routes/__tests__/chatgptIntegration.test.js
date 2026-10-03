const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildChatgptOAuthRouter } = require('../chatgptOAuthRoutes');
const { readChatgptOAuthConfig } = require('../../services/chatgptOAuthConfig');
const { buildAuthenticateAgentToken, createAgentTokenSecret, hashAgentTokenSecret } = require('../../services/agentTokenService');
const { buildLegacyContentRouter } = require('../legacyContentRoutes');
const { buildHighlightMutationRouter } = require('../highlightMutationRoutes');
const { buildNotebookRouter } = require('../notebookRoutes');
const { buildWikiRouter } = require('../wikiRoutes');
const { buildEditionRouter } = require('../editionRoutes');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Execute the actual, non-exported JWT middleware without starting server.js,
// its production integrations, or background workers. Secret is disposable.
const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
const authSource = source.slice(source.indexOf('const getCookieValue ='), source.indexOf('function optionalAuthenticateToken'));
const jwtSecret = crypto.randomBytes(32).toString('hex');
const humanAuth = vm.runInNewContext(`${authSource}\nauthenticateToken`, { jwt, process: { env: { JWT_SECRET: jwtSecret } }, console });
const config = readChatgptOAuthConfig({ NOEIS_CHATGPT_OAUTH_ISSUER: 'https://api.integration.example', NOEIS_APP_URL: 'https://integration.example', NOEIS_CHATGPT_OAUTH_CLIENTS: JSON.stringify([{client_id:'integration',client_name:'ChatGPT integration',redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect']}]) });
const verifier = 'integration-pkce-verifier-'.repeat(3);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const noop = () => {};

test('actual OAuth grants and content routes preserve two-account boundaries in disposable Mongo', async t => {
  const cached = path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  const mongo = await MongoMemoryServer.create({ binary: fs.existsSync(cached) ? {systemBinary:cached,version:'8.2.6'} : undefined });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const models = require('../../models');
    const { Article, NotebookEntry, WikiPage, WikiRevision, WikiProposal, Edition, EditionProfile, AgentToken } = models;
    const { ChatgptOAuthRequest: Request, ChatgptOAuthGrant: Grant } = require('../../models/chatgptOAuthModels');
    await Promise.all([Request.init(), Grant.init(), AgentToken.init(), Article.init(), Edition.init()]);
    const users = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const human = users.map(id => jwt.sign({id:String(id)}, jwtSecret, {expiresIn:'1h'}));
    const agentAuth = buildAuthenticateAgentToken({AgentToken,OAuthGrant:Grant,oauthResource:config.resource,consume:false});
    const auth = (req,res,next) => (req.headers.authorization?.startsWith('Bearer ntk_at_') ? agentAuth : humanAuth)(req,res,next);
    const mountStart = source.indexOf('app.use(buildNotebookRouter({');
    const mountSource = source.slice(mountStart, source.indexOf('}));', mountStart) + 4);
    const mountContext = { app: { use: noop }, buildNotebookRouter: options => { assert.equal(options.authenticateToken, auth, 'Actual Notebook mount must use account-or-agent authentication'); }, authenticateToken: humanAuth, authenticateUserOrAgentToken: auth };
    for (const symbol of mountSource.match(/\b[A-Za-z_$][\w$]*\b/g)) if (!(symbol in mountContext)) mountContext[symbol] = noop;
    vm.runInNewContext(mountSource, mountContext);
    const app = express(); app.use(require('../../services/chatgptOAuthIngress').buildChatgptOAuthIngress());
    app.use(buildChatgptOAuthRouter({config,authenticateToken:humanAuth,Request,Grant,AgentToken}));
    app.use(express.json());
    app.use(buildLegacyContentRouter({authenticateToken:auth,mongoose,...models,normalizeChecklist:x=>x,normalizePdfs:x=>x,enqueueArticleEmbedding:noop,deleteArticleEmbeddingState:noop,safeMapEmbedding:noop,queueEmbeddingUpsert:noop,normalizeItemType:x=>x,queueEmbeddingDelete:noop}));
    app.use(buildHighlightMutationRouter({authenticateToken:auth,mongoose,Article,normalizeTags:x=>x,enqueueHighlightEmbedding:noop,safeMapEmbedding:noop,highlightToEmbeddingItem:noop,queueEmbeddingUpsert:noop,markTourSignal:noop,normalizeItemType:x=>x,parseClaimId:x=>x,queueEmbeddingDelete:noop}));
    app.use(buildNotebookRouter({authenticateToken:auth,NotebookEntry,ensureNotebookBlocks:noop,createBlockId:()=>crypto.randomUUID(),stripHtml:x=>x,normalizeItemType:x=>x,parseClaimId:x=>x,normalizeTags:x=>x,syncNotebookReferences:noop,enqueueNotebookEmbedding:noop,trackEvent:noop,EVENT_NAMES:{}}));
    app.use(buildWikiRouter({authenticateToken:auth,WikiPage,WikiRevision,WikiProposal,Article,NotebookEntry}));
    app.use(buildEditionRouter({auth,Edition,EditionProfile,Article,humanOnly:(req,res,next)=>req.agentToken?res.status(403).json({error:'Human required'}):next()}));
    server = await new Promise(resolve => {const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (url,token,method='GET',body) => {
      const r=await fetch(base+url,{method,redirect:'manual',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const text=await r.text();return {status:r.status,location:r.headers.get('location'),body:text.startsWith('{')||text.startsWith('[')?JSON.parse(text):text};
    };
    const connect = async user => {
      const start=await call('/oauth/chatgpt/authorize?'+new URLSearchParams({response_type:'code',client_id:'integration',redirect_uri:config.clients.get('integration').redirectUris[0],resource:config.resource,scope:'read agent-write',code_challenge:challenge,code_challenge_method:'S256'}));
      assert.equal(start.status,302,JSON.stringify(start.body));
      const id=new URL(start.location).searchParams.get('request');
      const approval=await call(`/api/chatgpt/oauth/requests/${id}/consent`,user,'POST',{approved:true});assert.equal(approval.status,200);
      const exchanged=await call('/oauth/chatgpt/token',null,'POST',{grant_type:'authorization_code',client_id:'integration',redirect_uri:config.clients.get('integration').redirectUris[0],resource:config.resource,code:new URL(approval.body.redirectUrl).searchParams.get('code'),code_verifier:verifier});assert.equal(exchanged.status,200);return exchanged.body.access_token;
    };
    const tokens = [await connect(human[0]), await connect(human[1])];
    const fixtures = [];
    for (let i=0;i<2;i++) {
      const marker=`ACCOUNT_${i}_PRIVATE_SENTINEL`;
      const article=await Article.create({userId:users[i],url:`https://example.com/${i}`,title:marker,content:marker,highlights:[{text:marker,note:marker}]});
      const notebook=await NotebookEntry.create({userId:users[i],title:marker,content:marker});
      const wiki=await WikiPage.create({userId:users[i],title:marker,slug:`integration-${i}`,pageType:'topic',status:'draft',visibility:'private',body:marker});
      fixtures.push({marker,article,notebook,wiki});
    }
    await t.test('real JWT signature required before consent',async()=>assert.equal((await call('/api/chatgpt/oauth/requests/invalid','invalid.jwt.signature')).status,401));
    await t.test('Library, embedded highlights, Notebook and Wiki reads reject the other account and never disclose its marker',async()=>{
      for(let i=0;i<2;i++) {
        const own=fixtures[i],other=fixtures[1-i];
        for(const p of [`/articles/${own.article.id}`,`/api/articles/${own.article.id}/highlights`,`/api/notebook/${own.notebook.id}`,`/api/wiki/pages/${own.wiki.id}`]) assert.equal((await call(p,tokens[i])).status,200,p);
        for(const p of [`/articles/${other.article.id}`,`/api/articles/${other.article.id}/highlights`,`/api/notebook/${other.notebook.id}`,`/api/wiki/pages/${other.wiki.id}`]) {const r=await call(p,tokens[i]);assert.equal(r.status,404,p);assert.equal(JSON.stringify(r.body).includes(other.marker),false);}
        const all=await call('/api/highlights/all',tokens[i]);assert.equal(all.status,200);assert.equal(JSON.stringify(all.body).includes(other.marker),false);assert.equal(JSON.stringify(all.body).includes(own.marker),true);
      }
    });
    await t.test('OAuth cannot replace, publish, share or accept an ordinary owned Wiki; rejection leaves stored document unchanged',async()=>{
      const wiki=fixtures[0].wiki;
      const before=JSON.stringify(await WikiPage.findById(wiki.id).lean());
      for(const [p,m,b] of [[`/api/wiki/pages/${wiki.id}`,'PATCH',{body:'overwrite'}],[`/api/wiki/pages/${wiki.id}`,'PATCH',{status:'published',visibility:'shared'}],[`/api/wiki/pages/${wiki.id}/research-head/adopt`,'POST',{}],[`/api/wiki/pages/${wiki.id}/public-proof/accept`,'POST',{}],[`/api/wiki/proposals/${new mongoose.Types.ObjectId()}/accept`,'POST',{}]]) assert.equal((await call(p,tokens[0],m,b)).status,403,p);
      assert.equal(JSON.stringify(await WikiPage.findById(wiki.id).lean()),before);
      const legacy=createAgentTokenSecret();await AgentToken.create({userId:users[0],label:'Legacy fixture',hashedSecret:hashAgentTokenSecret(legacy),scopes:['read','agent-write']});
      const edited=await call(`/api/wiki/pages/${wiki.id}`,legacy,'PATCH',{body:'Legacy direct edit still supported'});assert.equal(edited.status,200,JSON.stringify(edited.body));
      assert.ok(JSON.stringify((await WikiPage.findById(wiki.id)).body).includes('Legacy direct edit still supported'));
    });
    await t.test('cross-account direct content writes are denied without changing private content',async()=>{
      const other=fixtures[1];
      const snapshots=await Promise.all([Article.findById(other.article.id).lean(),NotebookEntry.findById(other.notebook.id).lean(),WikiPage.findById(other.wiki.id).lean()]);
      for(const [url,method,body] of [[`/articles/${other.article.id}/placement`,'PATCH',{placement:'setAside'}],[`/articles/${other.article.id}/highlights/${other.article.highlights[0].id}`,'PATCH',{note:'attacker'}],[`/api/notebook/${other.notebook.id}`,'PUT',{content:'attacker'}],[`/api/wiki/pages/${other.wiki.id}`,'PATCH',{body:'attacker',visibility:'shared'}]]) assert.equal((await call(url,tokens[0],method,body)).status,403,url);
      const after=await Promise.all([Article.findById(other.article.id).lean(),NotebookEntry.findById(other.notebook.id).lean(),WikiPage.findById(other.wiki.id).lean()]);assert.deepEqual(after,snapshots);
    });
    await t.test('source preparation is permitted but cannot attach to another account page',async()=>{
      const payload={type:'article',objectId:fixtures[0].article.id,title:'Owned evidence',snippet:'Exact owned passage',addedBy:'ai'};
      const r=await call(`/api/wiki/pages/${fixtures[0].wiki.id}/sources`,tokens[0],'POST',payload);assert.equal(r.status,201,JSON.stringify(r.body));
      assert.equal((await WikiPage.findById(fixtures[0].wiki.id)).sourceRefs.length,1);
      assert.equal((await call(`/api/wiki/pages/${fixtures[1].wiki.id}/sources`,tokens[0],'POST',payload)).status,404);
      assert.equal((await WikiPage.findById(fixtures[1].wiki.id)).sourceRefs.length,0);
    });
    await t.test('Edition filing persists provenance and deduplicates lost-response retry; cross-account read/share denied',async()=>{
      const payload={profile:'this_week_in_ai',items:[{title:'Synthetic research',url:'https://example.com/research',section:'models_methods',finding:'New synthetic result',boundary:'Synthetic fixture; no external verification'}]};
      const first=await call('/api/editions/file',tokens[0],'POST',payload);assert.equal(first.status,201,JSON.stringify(first.body));
      const retry=await call('/api/editions/file',tokens[0],'POST',payload);assert.equal(retry.status,200,JSON.stringify(retry.body));
      const held=await Edition.findOne({userId:users[0]});assert.equal(held.items.length,1);assert.equal(held.items[0].finding,payload.items[0].finding);assert.equal(held.items[0].boundary,payload.items[0].boundary);assert.ok(held.items[0].filedBy.agentTokenId);
      assert.equal((await call(`/api/editions/${held.id}`,tokens[1])).status,404);
      const before=JSON.stringify(await Edition.findById(held.id).lean());assert.equal((await call(`/api/editions/${held.id}/share`,tokens[1],'POST',{enabled:true})).status,403);assert.equal(JSON.stringify(await Edition.findById(held.id).lean()),before);
      assert.equal(await Edition.countDocuments(),1);
    });
    await t.test('conditional thoughts preserve a concurrent reader edit and make response-loss retries idempotent even after another edit',async()=>{
      const article=fixtures[0].article,highlight=article.highlights[0];
      const p=`/articles/${article.id}/highlights/${highlight.id}/thoughts`;
      const body={thought:'Explicit synthetic thought',operationId:'integration_operation_001',expectedNoteHash:hash(highlight.note),expectedNoteRevision:0,expectedPassageHash:hash(highlight.text),explicitlyRequested:true};
      assert.equal((await call(`/articles/${article.id}/highlights/${highlight.id}`,human[0],'PATCH',{note:'Newer reader writing'})).status,200);
      assert.equal((await call(p,tokens[0],'POST',body)).status,409);
      let fresh=(await Article.findById(article.id)).highlights[0];assert.equal(fresh.note,'Newer reader writing');
      const reconciled={...body,expectedNoteHash:hash(fresh.note),expectedNoteRevision:fresh.noteRevision};
      const saved=await call(p,tokens[0],'POST',reconciled);assert.equal(saved.status,200,JSON.stringify(saved.body));
      assert.equal((await call(p,tokens[0],'POST',reconciled)).status,200);
      fresh=(await Article.findById(article.id)).highlights[0];assert.ok(fresh.note.includes('Newer reader writing'));assert.equal(fresh.note.split(body.thought).length-1,1);
      assert.equal((await call(`/articles/${article.id}/highlights/${highlight.id}`,human[0],'PATCH',{note:'Reader later rewrite'})).status,200);
      const retry=await call(p,tokens[0],'POST',reconciled);assert.equal(retry.status,200);assert.deepEqual(retry.body,saved.body);
      assert.equal((await Article.findById(article.id)).highlights[0].note,'Reader later rewrite');
      const other=fixtures[1].article;assert.equal((await call(`/articles/${other.id}/highlights/${other.highlights[0].id}/thoughts`,tokens[0],'POST',body)).status,404);
      assert.equal((await Article.findById(other.id)).highlights[0].note,fixtures[1].marker);
    });
  } finally { if(server) await new Promise(resolve=>server.close(resolve));await mongoose.disconnect();await mongo.stop(); }
});
