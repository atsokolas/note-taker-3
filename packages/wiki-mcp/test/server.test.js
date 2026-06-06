import assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { NoeisClient } from '../src/client.js';
import { createMcpServer, toolDefinitions } from '../src/server.js';
import { renderWikiSchemaPrompt } from '../src/prompts/wiki_schema.js';

const run = async () => {
  const requiredReadTools = [
    'list_pages',
    'get_page',
    'search_pages',
    'list_sources',
    'list_backlinks',
    'list_autolinks',
    'list_revisions',
    'list_activity',
    'get_schema',
    'list_proposals',
    'get_briefing',
    'search_articles',
    'get_article',
    'list_article_highlights',
    'search_highlights',
    'get_highlight',
    'list_questions',
    'get_question',
    'list_concepts',
    'get_concept'
  ];
  for (const name of requiredReadTools) {
    assert(toolDefinitions.some(tool => tool.name === name), `missing ${name}`);
  }
  const requiredWriteTools = [
    'create_page',
    'update_page',
    'archive_page',
    'ingest_source',
    'draft_page',
    'ask_page',
    'promote_answer',
    'lint_wiki',
    'apply_autolink',
    'add_source',
    'remove_source',
    'update_schema',
    'accept_proposal',
    'dismiss_proposal',
    'merge_proposal',
    'create_article',
    'create_highlight',
    'create_question',
    'update_question',
    'update_concept',
    'pin_highlight_to_concept'
  ];
  for (const name of requiredWriteTools) {
    assert(toolDefinitions.some(tool => tool.name === name), `missing ${name}`);
  }

  const seenRequests = [];
  const jsonResponse = (payload) => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  });

  const client = new NoeisClient({
    token: 'ntk_at_test',
    apiUrl: 'https://noeis.example',
    fetchImpl: async (url, init) => {
      seenRequests.push({ url: String(url), init });
      const requestUrl = new URL(String(url));
      if (requestUrl.pathname.endsWith('/schema')) return jsonResponse({ content: '# Wiki Schema' });
      if (requestUrl.pathname.endsWith('/lint')) return jsonResponse({ runId: 'lint-1', findings: [] });
      if (requestUrl.pathname.endsWith('/briefing')) return jsonResponse({ summary: 'Updated today' });
      if (requestUrl.pathname.endsWith('/proposals')) return jsonResponse({ proposals: [] });
      if (requestUrl.pathname.includes('/api/wiki/proposals/proposal-1/accept')) {
        return jsonResponse({ proposal: { id: 'proposal-1', status: 'accepted' }, page: { _id: 'page-4', title: 'Accepted' } });
      }
      if (requestUrl.pathname.includes('/api/wiki/proposals/proposal-1/dismiss')) {
        return jsonResponse({ id: 'proposal-1', status: 'dismissed' });
      }
      if (requestUrl.pathname.includes('/api/wiki/proposals/proposal-1/merge')) {
        return jsonResponse({ id: 'proposal-1', status: 'merged' });
      }
      if (requestUrl.pathname.endsWith('/ingest')) {
        return jsonResponse({ runId: 'ingest-1', touchedPageIds: ['page-1'] });
      }
      if (requestUrl.pathname.endsWith('/api/articles') && init.method !== 'POST') {
        return jsonResponse([
          {
            _id: 'article-1',
            title: 'Opportunity cost memo',
            url: 'https://example.com/opportunity',
            siteName: 'Example',
            highlightCount: 1,
            updatedAt: '2026-05-16T12:00:00.000Z'
          }
        ]);
      }
      if (requestUrl.pathname.endsWith('/articles/article-1') && init.method !== 'DELETE') {
        return jsonResponse({
          _id: 'article-1',
          title: 'Opportunity cost memo',
          url: 'https://example.com/opportunity',
          content: 'Opportunity cost is what you forgo.',
          highlights: [{ _id: 'highlight-1', text: 'Every choice excludes another return.' }]
        });
      }
      if (requestUrl.pathname.endsWith('/api/articles/article-1/highlights')) {
        return jsonResponse([
          {
            _id: 'highlight-1',
            articleId: 'article-1',
            articleTitle: 'Opportunity cost memo',
            text: 'Every choice excludes another return.',
            tags: ['opportunity-cost']
          }
        ]);
      }
      if (requestUrl.pathname.endsWith('/api/highlights')) {
        return jsonResponse([
          {
            _id: 'highlight-1',
            articleId: 'article-1',
            articleTitle: 'Opportunity cost memo',
            text: 'Every choice excludes another return.',
            tags: ['opportunity-cost']
          }
        ]);
      }
      if (requestUrl.pathname.endsWith('/api/highlights/all')) {
        return jsonResponse([
          {
            _id: 'highlight-1',
            articleId: 'article-1',
            articleTitle: 'Opportunity cost memo',
            text: 'Every choice excludes another return.',
            tags: ['opportunity-cost']
          }
        ]);
      }
      if (requestUrl.pathname.endsWith('/save-article')) {
        return jsonResponse({
          _id: 'article-created',
          title: 'Saved article',
          url: 'https://example.com/new',
          content: 'Saved.'
        });
      }
      if (requestUrl.pathname.endsWith('/articles/article-1/highlights') && init.method === 'POST') {
        return jsonResponse({
          highlight: {
            _id: 'highlight-created',
            articleId: 'article-1',
            articleTitle: 'Opportunity cost memo',
            text: 'New highlight'
          }
        });
      }
      if (requestUrl.pathname.endsWith('/api/questions') && init.method !== 'POST') {
        return jsonResponse([
          {
            _id: 'question-1',
            text: 'Where does opportunity cost show up?',
            status: 'open',
            conceptName: 'Opportunity Cost'
          }
        ]);
      }
      if (requestUrl.pathname.endsWith('/api/questions/question-1') && init.method !== 'PUT') {
        return jsonResponse({
          _id: 'question-1',
          text: 'Where does opportunity cost show up?',
          status: 'open',
          conceptName: 'Opportunity Cost'
        });
      }
      if (requestUrl.pathname.endsWith('/api/questions') && init.method === 'POST') {
        return jsonResponse({
          _id: 'question-created',
          text: 'What did this highlight change?',
          status: 'open',
          conceptName: 'Opportunity Cost'
        });
      }
      if (requestUrl.pathname.endsWith('/api/questions/question-1') && init.method === 'PUT') {
        return jsonResponse({
          _id: 'question-1',
          text: 'Updated question',
          status: 'answered',
          conceptName: 'Opportunity Cost'
        });
      }
      if (requestUrl.pathname.endsWith('/api/concepts') && init.method !== 'PUT') {
        return jsonResponse([{ _id: 'concept-1', name: 'Opportunity Cost', description: 'Tradeoffs.' }]);
      }
      if (requestUrl.pathname.endsWith('/api/concepts/Opportunity%20Cost') && init.method !== 'PUT') {
        return jsonResponse({ _id: 'concept-1', name: 'Opportunity Cost', description: 'Tradeoffs.' });
      }
      if (requestUrl.pathname.endsWith('/api/concepts/Opportunity%20Cost') && init.method === 'PUT') {
        return jsonResponse({ _id: 'concept-1', name: 'Opportunity Cost', description: 'Updated tradeoffs.' });
      }
      if (requestUrl.pathname.endsWith('/api/concepts/Opportunity%20Cost/add-highlight')) {
        return jsonResponse({ _id: 'concept-1', name: 'Opportunity Cost', pinnedHighlightIds: ['highlight-1'] });
      }
      if (requestUrl.pathname.endsWith('/activity')) {
        return jsonResponse({
          events: [
            { id: 'new-event', title: 'New event', at: '2026-05-16T12:00:00.000Z' },
            { id: 'old-event', title: 'Old event', at: '2026-05-01T12:00:00.000Z' }
          ]
        });
      }
      if (requestUrl.pathname.endsWith('/revisions')) {
        return jsonResponse({ revisions: [{ id: 'rev-1' }, { id: 'rev-2' }] });
      }
      if (requestUrl.pathname.endsWith('/backlinks')) return jsonResponse({ backlinks: [{ id: 'page-2', title: 'Moats' }] });
      if (requestUrl.pathname.endsWith('/autolinks')) return jsonResponse({ autolinks: [{ id: 'page-3', title: 'Cash flow' }] });
      if (requestUrl.pathname.includes('/autolinks/page-3/apply')) {
        return jsonResponse({ _id: 'page-1', title: 'Compounding', sourceRefs: [] });
      }
      if (requestUrl.pathname.includes('/sources/source-1')) {
        return jsonResponse({ _id: 'page-1', title: 'Compounding', sourceRefs: [] });
      }
      if (requestUrl.pathname.endsWith('/sources')) {
        return jsonResponse({ _id: 'page-1', title: 'Compounding', sourceRefs: [{ id: 'source-1', title: 'Buffett letter' }] });
      }
      if (requestUrl.pathname.endsWith('/ai/draft')) {
        return jsonResponse({ _id: 'page-1', title: 'Compounding', bodyMarkdown: 'Drafted.' });
      }
      if (requestUrl.pathname.endsWith('/ask')) {
        return jsonResponse({
          _id: 'page-1',
          title: 'Compounding',
          discussions: [{ _id: 'discussion-1', question: 'Why?', status: 'answered' }]
        });
      }
      if (requestUrl.pathname.includes('/discussions/discussion-1/promote')) {
        return jsonResponse({ page: { _id: 'page-9', title: 'Why compounding matters' }, sourcePage: { _id: 'page-1', title: 'Compounding' } });
      }
      if (requestUrl.pathname.includes('/api/wiki/pages/page-1')) {
        return jsonResponse({
          _id: 'page-1',
          title: 'Compounding',
          pageType: 'concept',
          slug: 'compounding',
          bodyMarkdown: 'Compounding turns reinvested returns into durable advantage.',
          sourceRefs: [{ id: 'source-1', title: 'Buffett letter' }],
          claims: [{ id: 'claim-1', text: 'Reinvestment matters.' }],
          aiState: { infobox: { Summary: 'Capital compounds.' } },
          updatedAt: '2026-05-16T12:00:00.000Z'
        });
      }
      if (requestUrl.pathname.endsWith('/api/wiki/pages') && init.method === 'POST') {
        return jsonResponse({
          _id: 'page-created',
          title: 'New page',
          pageType: 'topic',
          slug: 'new-page',
          bodyMarkdown: 'Hello wiki'
        });
      }
      return jsonResponse([
        {
          _id: 'page-1',
          title: 'Compounding',
          pageType: 'concept',
          slug: 'compounding',
          plainText: 'Compounding is the engine that turns reinvested returns into durable advantage.',
          updatedAt: '2026-05-16T12:00:00.000Z'
        }
      ]);
    }
  });

  const listPages = toolDefinitions.find(tool => tool.name === 'list_pages');
  const pages = await listPages.handler(client, { q: 'compound', limit: 5 });
  assert.deepStrictEqual(Object.keys(pages[0]), ['id', 'title', 'pageType', 'slug', 'updatedAt']);
  assert.strictEqual(pages[0].id, 'page-1');
  assert.strictEqual(pages[0].title, 'Compounding');
  assert(seenRequests[0].url.includes('/api/wiki/pages?q=compound&limit=5'));
  assert.strictEqual(seenRequests[0].init.headers.Authorization, 'Bearer ntk_at_test');

  const searchPages = toolDefinitions.find(tool => tool.name === 'search_pages');
  const hits = await searchPages.handler(client, { query: 'reinvested', limit: 5 });
  assert.strictEqual(hits[0].id, 'page-1');
  assert(hits[0].snippet.includes('reinvested returns'));

  const getPage = toolDefinitions.find(tool => tool.name === 'get_page');
  const page = await getPage.handler(client, { pageId: 'page-1' });
  assert.strictEqual(page.sources[0].title, 'Buffett letter');
  assert.strictEqual(page.infobox.Summary, 'Capital compounds.');

  const listSources = toolDefinitions.find(tool => tool.name === 'list_sources');
  const sources = await listSources.handler(client, { pageId: 'page-1' });
  assert.strictEqual(sources.sources[0].id, 'source-1');

  const activity = await toolDefinitions.find(tool => tool.name === 'list_activity').handler(client, {
    since: '2026-05-10T00:00:00.000Z',
    limit: 10
  });
  assert.strictEqual(activity.events.length, 1);
  assert(seenRequests.some(request => request.url.includes('/api/wiki/activity?limit=10&since=2026-05-10T00%3A00%3A00.000Z')));

  await toolDefinitions.find(tool => tool.name === 'list_revisions').handler(client, { pageId: 'page-1', limit: 1 });
  assert(seenRequests.some(request => request.url.includes('/api/wiki/pages/page-1/revisions?limit=1')));

  const createPage = await toolDefinitions.find(tool => tool.name === 'create_page').handler(client, {
    title: 'New page',
    body: 'Hello wiki'
  });
  assert.strictEqual(createPage.id, 'page-created');
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/pages') && request.init.method === 'POST'));

  await toolDefinitions.find(tool => tool.name === 'update_page').handler(client, {
    pageId: 'page-1',
    visibility: 'shared'
  });
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/pages/page-1') && request.init.method === 'PATCH'));

  await toolDefinitions.find(tool => tool.name === 'archive_page').handler(client, { pageId: 'page-1' });
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/pages/page-1') && request.init.method === 'DELETE'));

  await toolDefinitions.find(tool => tool.name === 'ingest_source').handler(client, {
    source: { type: 'url', url: 'https://example.com/research' }
  });
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/ingest') && request.init.method === 'POST'));

  await toolDefinitions.find(tool => tool.name === 'draft_page').handler(client, { pageId: 'page-1' });
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/pages/page-1/ai/draft') && request.init.method === 'POST'));

  const asked = await toolDefinitions.find(tool => tool.name === 'ask_page').handler(client, {
    pageId: 'page-1',
    question: 'Why does compounding matter?'
  });
  assert.strictEqual(asked.discussions[0].question, 'Why?');

  const promoted = await toolDefinitions.find(tool => tool.name === 'promote_answer').handler(client, {
    pageId: 'page-1',
    discussionId: 'discussion-1',
    newTitle: 'Why compounding matters'
  });
  assert.strictEqual(promoted.pageId, 'page-9');

  await toolDefinitions.find(tool => tool.name === 'lint_wiki').handler(client, { pageId: 'page-1' });
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/lint') && request.init.method === 'POST'));

  await toolDefinitions.find(tool => tool.name === 'apply_autolink').handler(client, { pageId: 'page-1', targetPageId: 'page-3' });
  await toolDefinitions.find(tool => tool.name === 'add_source').handler(client, { pageId: 'page-1', source: { type: 'url', url: 'https://example.com' } });
  await toolDefinitions.find(tool => tool.name === 'remove_source').handler(client, { pageId: 'page-1', sourceRefId: 'source-1' });

  await toolDefinitions.find(tool => tool.name === 'update_schema').handler(client, { content: '# Updated schema' });
  assert(seenRequests.some(request => request.url.endsWith('/api/wiki/schema') && request.init.method === 'PUT'));

  const accepted = await toolDefinitions.find(tool => tool.name === 'accept_proposal').handler(client, { proposalId: 'proposal-1' });
  assert.strictEqual(accepted.pageId, 'page-4');
  await toolDefinitions.find(tool => tool.name === 'dismiss_proposal').handler(client, { proposalId: 'proposal-1', reason: 'Duplicate' });
  await toolDefinitions.find(tool => tool.name === 'merge_proposal').handler(client, { proposalId: 'proposal-1', pageId: 'page-1' });

  const articles = await toolDefinitions.find(tool => tool.name === 'search_articles').handler(client, {
    query: 'opportunity',
    limit: 5
  });
  assert.strictEqual(articles[0].id, 'article-1');
  assert(seenRequests.some(request => request.url.includes('/api/articles?query=opportunity')));

  const article = await toolDefinitions.find(tool => tool.name === 'get_article').handler(client, { articleId: 'article-1' });
  assert.strictEqual(article.content, 'Opportunity cost is what you forgo.');

  const articleHighlights = await toolDefinitions.find(tool => tool.name === 'list_article_highlights').handler(client, { articleId: 'article-1' });
  assert.strictEqual(articleHighlights[0].id, 'highlight-1');

  const highlights = await toolDefinitions.find(tool => tool.name === 'search_highlights').handler(client, {
    query: 'choice',
    limit: 5
  });
  assert.strictEqual(highlights[0].articleTitle, 'Opportunity cost memo');
  assert(seenRequests.some(request => request.url.includes('/api/highlights?q=choice')));

  const highlight = await toolDefinitions.find(tool => tool.name === 'get_highlight').handler(client, { highlightId: 'highlight-1' });
  assert.strictEqual(highlight.text, 'Every choice excludes another return.');

  const createdArticle = await toolDefinitions.find(tool => tool.name === 'create_article').handler(client, {
    title: 'Saved article',
    url: 'https://example.com/new',
    content: 'Saved.'
  });
  assert.strictEqual(createdArticle.id, 'article-created');
  assert(seenRequests.some(request => request.url.endsWith('/save-article') && request.init.method === 'POST'));

  const createdHighlight = await toolDefinitions.find(tool => tool.name === 'create_highlight').handler(client, {
    articleId: 'article-1',
    text: 'New highlight'
  });
  assert.strictEqual(createdHighlight.id, 'highlight-created');

  const questions = await toolDefinitions.find(tool => tool.name === 'list_questions').handler(client, {
    conceptName: 'Opportunity Cost'
  });
  assert.strictEqual(questions[0].id, 'question-1');

  const question = await toolDefinitions.find(tool => tool.name === 'get_question').handler(client, { questionId: 'question-1' });
  assert.strictEqual(question.conceptName, 'Opportunity Cost');

  const createdQuestion = await toolDefinitions.find(tool => tool.name === 'create_question').handler(client, {
    text: 'What did this highlight change?',
    conceptName: 'Opportunity Cost',
    linkedHighlightIds: ['highlight-1']
  });
  assert.strictEqual(createdQuestion.id, 'question-created');

  const updatedQuestion = await toolDefinitions.find(tool => tool.name === 'update_question').handler(client, {
    questionId: 'question-1',
    status: 'answered',
    text: 'Updated question'
  });
  assert.strictEqual(updatedQuestion.status, 'answered');

  const concepts = await toolDefinitions.find(tool => tool.name === 'list_concepts').handler(client, {});
  assert.strictEqual(concepts[0].name, 'Opportunity Cost');

  const concept = await toolDefinitions.find(tool => tool.name === 'get_concept').handler(client, { name: 'Opportunity Cost' });
  assert.strictEqual(concept.description, 'Tradeoffs.');

  const updatedConcept = await toolDefinitions.find(tool => tool.name === 'update_concept').handler(client, {
    name: 'Opportunity Cost',
    description: 'Updated tradeoffs.'
  });
  assert.strictEqual(updatedConcept.description, 'Updated tradeoffs.');

  const pinnedConcept = await toolDefinitions.find(tool => tool.name === 'pin_highlight_to_concept').handler(client, {
    name: 'Opportunity Cost',
    highlightId: 'highlight-1'
  });
  assert.deepStrictEqual(pinnedConcept.pinnedHighlightIds, ['highlight-1']);

  const prompt = await renderWikiSchemaPrompt(client);
  assert(prompt.messages[0].content.text.includes('# Wiki Schema'));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpServer = createMcpServer({ client });
  const mcpClient = new Client({ name: 'test-client', version: '0.1.0' });
  await Promise.all([
    mcpServer.connect(serverTransport),
    mcpClient.connect(clientTransport)
  ]);

  const listed = await mcpClient.listTools();
  assert(listed.tools.some(tool => tool.name === 'list_pages'));

  const called = await mcpClient.callTool({
    name: 'search_pages',
    arguments: { query: 'compound', limit: 5 }
  });
  assert(called.content[0].text.includes('Compounding'));
  assert(called.content[0].text.includes('snippet'));

  const prompts = await mcpClient.listPrompts();
  assert(prompts.prompts.some(row => row.name === 'wiki_schema'));
  const schemaPrompt = await mcpClient.getPrompt({ name: 'wiki_schema' });
  assert(schemaPrompt.messages[0].content.text.includes('# Wiki Schema'));

  await mcpClient.close();
  await mcpServer.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
