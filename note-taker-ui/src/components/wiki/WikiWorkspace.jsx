import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { chatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import { getConcepts } from '../../api/concepts';
import { getHighlights } from '../../api/highlights';
import { getQuestions } from '../../api/questions';
import {
  createWikiPage,
  getWikiPage,
  getWikiSchema,
  ingestWikiSource,
  listWikiActivity,
  listWikiPages,
  maintainWikiPage,
  saveWikiSchema
} from '../../api/wiki';
import { buildWikiCreatePayload } from '../../utils/wikiCreate';
import { Button } from '../ui';
import WikiPageReadView from './WikiPageReadView';

const WikiIndex = lazy(() => import('./WikiIndex'));

const LAST_PAGE_KEY = 'noeis.wiki.workspace.last_page_id';
const CHAT_WIDTH_KEY = 'noeis.wiki.workspace.chat_width';
const CHAT_COLLAPSED_KEY = 'noeis.wiki.workspace.chat_collapsed';
const WIKI_COLLAPSED_KEY = 'noeis.wiki.workspace.wiki_collapsed';
const POLL_MS = 2000;

const clean = (value = '') => String(value || '').trim();

const messageId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const COMMANDS = [
  {
    verb: 'ask',
    template: '/ask ',
    label: 'Ask workspace',
    hint: 'Ask across the current wiki context.'
  },
  {
    verb: 'draft',
    template: '/draft @wiki:',
    label: 'Draft page',
    hint: 'Run wiki maintenance for a page in the right pane.'
  },
  {
    verb: 'page',
    template: '/page @wiki:',
    label: 'Open page',
    hint: 'Route a wiki page into the workspace.'
  },
  {
    verb: 'sources',
    template: '/sources',
    label: 'Library sources',
    hint: 'Browse Library sources on the right.'
  },
  {
    verb: 'graph',
    template: '/graph',
    label: 'Knowledge map',
    hint: 'Open the wiki graph.'
  },
  {
    verb: 'activity',
    template: '/activity',
    label: 'Activity',
    hint: 'Open the wiki activity log.'
  },
  {
    verb: 'schema',
    template: '/schema',
    label: 'Schema',
    hint: 'Edit wiki conventions.'
  },
  {
    verb: 'ingest',
    template: '/ingest @url:',
    label: 'Ingest URL',
    hint: 'Feed a source URL to the wiki.'
  },
  {
    verb: 'lint',
    template: '/lint @wiki:',
    label: 'Lint page',
    hint: 'Ask the agent for gaps, weak claims, and maintenance risks.'
  },
  {
    verb: 'promote',
    template: '/promote ',
    label: 'Promote answer',
    hint: 'Turn the last agent answer into an overview wiki draft.'
  },
  {
    verb: 'diff',
    template: '/diff @wiki:',
    label: 'Review diff',
    hint: 'Open a page and review what changed since last visit.'
  },
  {
    verb: 'help',
    template: '/help',
    label: 'Help',
    hint: 'Show available wiki commands.'
  }
];

const commandMatches = (input = '') => {
  const text = clean(input);
  if (!text.startsWith('/')) return [];
  const query = text.slice(1).split(/\s+/)[0].toLowerCase();
  return COMMANDS.filter(command => (
    !query
    || command.verb.startsWith(query)
    || command.label.toLowerCase().includes(query)
  )).slice(0, 10);
};

const toWorkspaceThreadMessages = (thread = null) => {
  const rows = Array.isArray(thread?.messages) ? thread.messages : [];
  return rows
    .map((message) => ({
      id: message._id || message.id || messageId(message.role || 'thread'),
      role: message.role === 'user' ? 'user' : 'assistant',
      text: clean(message.text || message.content || ''),
      createdAt: message.createdAt || new Date().toISOString()
    }))
    .filter(message => message.text);
};

const parseCommand = (value = '') => {
  const text = clean(value);
  if (!text.startsWith('/')) return null;
  const [verbToken, ...rest] = text.slice(1).split(/\s+/);
  return {
    verb: clean(verbToken).toLowerCase(),
    args: rest.join(' ').trim()
  };
};

const parseWikiRef = (value = '') => {
  const match = String(value || '').match(/@wiki:([^\s]+)/i);
  return clean(match?.[1]);
};

const parseUrl = (value = '') => {
  const text = String(value || '');
  const tagged = text.match(/@url:?(https?:\/\/\S+)/i);
  const bare = text.match(/https?:\/\/\S+/i);
  return clean(tagged?.[1] || bare?.[0]);
};

const labelForRef = (ref = {}) => {
  if (ref.label) return ref.label;
  if (ref.type === 'wiki') return `@wiki:${ref.id}`;
  if (ref.type === 'url') return ref.url || '@url';
  if (ref.type === 'article') return ref.title || '@article';
  if (ref.type === 'highlight') return ref.title || '@highlight';
  if (ref.type === 'concept') return ref.title || '@concept';
  if (ref.type === 'question') return ref.title || '@question';
  if (ref.type === 'today') return '@today';
  return ref.label || ref.id || 'Reference';
};

const contextKeyFor = (ref = {}) => `${ref.type}:${ref.id || ref.url || ref.title || ref.label}`;

const mergeReferences = (current = [], next = []) => {
  const map = new Map();
  [...current, ...next].forEach((ref) => {
    const key = contextKeyFor(ref);
    if (key && key !== `${ref.type}:`) map.set(key, { ...ref, label: ref.label || labelForRef(ref) });
  });
  return Array.from(map.values()).slice(0, 12);
};

const refId = (item = {}) => clean(item._id || item.id || item.name || item.text || item.title || item.url);

const refTitle = (item = {}, fallback = 'Untitled') => clean(item.title || item.name || item.text || item.url || fallback);

const typedRefFromItem = (type, item = {}) => {
  const id = refId(item);
  const title = refTitle(item, id || type);
  const base = {
    type,
    id,
    title,
    label: type === 'wiki' ? `@wiki:${title}` : `@${type}:${title}`
  };
  if (type === 'article') return { ...base, url: clean(item.url), snippet: clean(item.summary || item.description || item.text || item.content) };
  if (type === 'highlight') return { ...base, articleId: item.articleId, articleTitle: item.articleTitle, snippet: clean(item.text || item.note) };
  if (type === 'concept') return { ...base, description: clean(item.description) };
  if (type === 'question') return { ...base, status: item.status, conceptName: item.linkedTagName || item.conceptName };
  return base;
};

const referencesFromText = (text = '', referenceCatalog = {}) => {
  const refs = [];
  const catalogs = {
    wiki: referenceCatalog.wiki || [],
    article: referenceCatalog.article || [],
    highlight: referenceCatalog.highlight || [],
    concept: referenceCatalog.concept || [],
    question: referenceCatalog.question || []
  };
  const byTypeAndId = Object.fromEntries(Object.entries(catalogs).map(([type, items]) => [
    type,
    new Map(items.map(item => [refId(item), item]))
  ]));
  String(text || '').replace(/@(wiki|article|highlight|concept|question|source):([^\s]+)/gi, (_match, type, id) => {
    const cleanId = clean(id);
    const resolvedType = type.toLowerCase() === 'source' ? 'article' : type.toLowerCase();
    const item = byTypeAndId[resolvedType]?.get(cleanId);
    refs.push(item ? typedRefFromItem(resolvedType, item) : { type: resolvedType, id: cleanId, label: `@${type}:${cleanId}` });
    return _match;
  });
  const url = parseUrl(text);
  if (url) refs.push({ type: 'url', url, id: url, label: url });
  if (String(text || '').match(/@today\b/i)) {
    refs.push({ type: 'today', id: new Date().toISOString().slice(0, 10), label: '@today' });
  }
  return refs;
};

const mentionTrigger = (input = '') => {
  const match = String(input || '').match(/@(wiki|article|highlight|concept|question|source|url|today):?([^\s]*)$/i);
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    query: clean(match[2]).toLowerCase()
  };
};

const matchesQuery = (item = {}, query = '') => {
  if (!query) return true;
  return [
    item._id,
    item.id,
    item.name,
    item.title,
    item.text,
    item.articleTitle,
    item.description,
    item.url,
    item.linkedTagName
  ].some(value => String(value || '').toLowerCase().includes(query));
};

const viewPathFor = ({ view = 'graph', page = '' } = {}) => {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  else params.set('view', view);
  return `/wiki/workspace?${params.toString()}`;
};

const searchFor = (target = {}) => {
  const path = viewPathFor(target);
  return path.slice(path.indexOf('?'));
};

const WorkspaceSources = ({ onUseSource }) => {
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getArticles({ query, limit: 25, sort: 'recent' })
      .then(items => {
        if (!cancelled) setArticles(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load Library sources.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <section className="wiki-workspace-sources" aria-label="Library sources">
      <header>
        <p className="wiki-index__eyebrow">Sources</p>
        <h1>Library</h1>
      </header>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search Library sources"
        aria-label="Search Library sources"
      />
      {loading ? <p className="wiki-index__status">Loading Library sources...</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
      <ol className="wiki-workspace-sources__list">
        {articles.map(article => (
          <li key={article._id || article.id}>
            <Link to={`/articles/${article._id || article.id}`}>{article.title || article.url || 'Untitled source'}</Link>
            {article.url ? <span>{article.url}</span> : null}
            <button type="button" onClick={() => onUseSource?.(article)}>
              Use in chat
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

const WorkspaceActivity = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listWikiActivity({ limit: 40 })
      .then(items => {
        if (!cancelled) setEvents(Array.isArray(items) ? items : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="wiki-workspace-activity" aria-label="Wiki activity">
      <header>
        <p className="wiki-index__eyebrow">Activity</p>
        <h1>Wiki log</h1>
      </header>
      {loading ? <p className="wiki-index__status">Loading activity...</p> : null}
      <ol>
        {events.map(event => (
          <li key={event.id || `${event.type}-${event.at}`}>
            <strong>{event.title || 'Wiki activity'}</strong>
            {event.summary ? <p>{event.summary}</p> : null}
            {event.pageId ? <Link to={viewPathFor({ page: event.pageId })}>Open page</Link> : null}
          </li>
        ))}
      </ol>
    </section>
  );
};

const WorkspaceSchema = () => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    getWikiSchema()
      .then(result => {
        if (!cancelled) setContent(result?.content || '');
      })
      .catch(() => {
        if (!cancelled) setStatus('Failed to load schema.');
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setStatus('Saving...');
    try {
      const result = await saveWikiSchema(content);
      setContent(result?.content || content);
      setStatus('Schema saved.');
    } catch (_error) {
      setStatus('Failed to save schema.');
    }
  };

  return (
    <section className="wiki-workspace-schema" aria-label="Wiki schema">
      <header>
        <p className="wiki-index__eyebrow">Schema</p>
        <h1>Wiki conventions</h1>
      </header>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="Wiki schema editor"
        rows={18}
      />
      <div>
        <Button type="button" onClick={handleSave}>Save schema</Button>
        {status ? <span role="status">{status}</span> : null}
      </div>
    </section>
  );
};

const WikiWorkspaceChat = ({ selectedPageId, view, onNavigate, onPageChanged, busy, setBusy, chatDraft }) => {
  const [messages, setMessages] = useState([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      text: 'Use this chat to drive the wiki. Try /draft @wiki:page_id, /graph, /sources, /activity, /schema, or paste a source URL with /ingest.',
      createdAt: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [wikiPages, setWikiPages] = useState([]);
  const [articles, setArticles] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [contextRefs, setContextRefs] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!chatDraft?.text) return;
    setInput(chatDraft.text);
    if (Array.isArray(chatDraft.refs)) {
      setContextRefs(current => mergeReferences(current, chatDraft.refs));
    }
  }, [chatDraft]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      listWikiPages({ limit: 50 }),
      getArticles({ limit: 50, sort: 'recent' }),
      getHighlights({ limit: 50 }),
      getConcepts(),
      getQuestions()
    ]).then(([pages, articleRows, highlightRows, conceptRows, questionRows]) => {
      if (cancelled) return;
      if (pages.status === 'fulfilled') setWikiPages(Array.isArray(pages.value) ? pages.value : []);
      if (articleRows.status === 'fulfilled') setArticles(Array.isArray(articleRows.value) ? articleRows.value : []);
      if (highlightRows.status === 'fulfilled') setHighlights(Array.isArray(highlightRows.value) ? highlightRows.value : []);
      if (conceptRows.status === 'fulfilled') setConcepts(Array.isArray(conceptRows.value) ? conceptRows.value : []);
      if (questionRows.status === 'fulfilled') setQuestions(Array.isArray(questionRows.value) ? questionRows.value : []);
    });
    return () => { cancelled = true; };
  }, []);

  const append = useCallback((message) => {
    setMessages(current => [...current, { id: messageId(message.role), createdAt: new Date().toISOString(), ...message }]);
  }, []);

  const referenceCatalog = useMemo(() => ({
    wiki: wikiPages,
    article: articles,
    highlight: highlights,
    concept: concepts,
    question: questions
  }), [articles, concepts, highlights, questions, wikiPages]);

  const showCommands = commandMatches(input);
  const trigger = useMemo(() => mentionTrigger(input), [input]);
  const showMentions = useMemo(() => {
    if (!trigger || trigger.type === 'url') return [];
    if (trigger.type === 'today') {
      return [{ type: 'today', id: new Date().toISOString().slice(0, 10), title: 'Today', label: '@today' }];
    }
    const type = trigger.type === 'source' ? 'article' : trigger.type;
    const items = referenceCatalog[type] || [];
    return items
      .filter(item => matchesQuery(item, trigger.query))
      .slice(0, 8)
      .map(item => typedRefFromItem(type, item));
  }, [referenceCatalog, trigger]);

  const applyCommandTemplate = (template) => {
    setInput(template);
  };

  const applyMention = (ref) => {
    const id = clean(ref?.id || ref?.url);
    if (!id && ref?.type !== 'today') return;
    const token = ref.type === 'today' ? '@today' : `@${ref.type}:${id}`;
    setInput(current => current.replace(/@(wiki|article|highlight|concept|question|source|url|today):?[^\s]*$/i, token));
    setContextRefs(current => mergeReferences(current, [ref]));
  };

  const sendAgentMessage = useCallback(async (text, { assistantPrefix = '', extraRefs = [] } = {}) => {
    const nextRefs = mergeReferences(contextRefs, [...referencesFromText(text, referenceCatalog), ...extraRefs]);
    setContextRefs(nextRefs);
    const result = await chatWithAgent({
      message: text,
      threadId: threadId || undefined,
      persistThread: true,
      threadTitle: 'Wiki workspace',
      context: {
        type: 'workspace',
        id: 'wiki',
        title: selectedPageId ? `Wiki page ${selectedPageId}` : 'Wiki workspace',
        pageId: selectedPageId || '',
        view,
        references: nextRefs,
        metadata: {
          surface: 'wiki_workspace',
          references: nextRefs
        }
      },
      history: messages.map(message => ({ role: message.role, text: message.text })),
      limit: 6
    });
    if (result?.thread?.threadId) {
      setThreadId(result.thread.threadId);
      setThreadTitle(clean(result.thread.title) || 'Wiki workspace');
    }
    const hydratedMessages = toWorkspaceThreadMessages(result?.thread);
    if (hydratedMessages.length > messages.length + 1) {
      setMessages(hydratedMessages);
    }
    append({ role: 'assistant', text: `${assistantPrefix}${clean(result?.reply) || 'No reply generated.'}` });
  }, [append, contextRefs, messages, referenceCatalog, selectedPageId, threadId, view]);

  const handleCommand = async (command) => {
    const pageRef = parseWikiRef(command.args) || selectedPageId;
    const argsWithoutWikiRef = clean(command.args.replace(/@wiki:[^\s]+/i, ''));
    if (command.verb === 'graph') {
      onNavigate({ view: 'graph' });
      append({ role: 'assistant', text: 'Opened the wiki graph on the right.' });
      return true;
    }
    if (command.verb === 'activity') {
      onNavigate({ view: 'activity' });
      append({ role: 'assistant', text: 'Opened the wiki activity log on the right.' });
      return true;
    }
    if (command.verb === 'sources') {
      onNavigate({ view: 'sources' });
      append({ role: 'assistant', text: 'Opened the Library sources pane on the right.' });
      return true;
    }
    if (command.verb === 'schema') {
      onNavigate({ view: 'schema' });
      append({ role: 'assistant', text: 'Opened the wiki schema on the right.' });
      return true;
    }
    if (command.verb === 'page') {
      if (!pageRef) {
        append({ role: 'assistant', text: 'Add a wiki reference, for example /page @wiki:PAGE_ID.' });
        return true;
      }
      onNavigate({ page: pageRef });
      append({ role: 'assistant', text: `Opened @wiki:${pageRef} on the right.` });
      return true;
    }
    if (command.verb === 'draft') {
      if (!pageRef) {
        append({ role: 'assistant', text: 'Add a wiki reference, for example /draft @wiki:PAGE_ID.' });
        return true;
      }
      setBusy(true);
      append({ role: 'assistant', text: `Drafting @wiki:${pageRef}. The right pane will refresh while the run is active.` });
      try {
        await maintainWikiPage(pageRef);
        onNavigate({ page: pageRef });
        onPageChanged?.(pageRef);
        append({ role: 'assistant', text: `Finished drafting @wiki:${pageRef}.` });
      } catch (_error) {
        append({ role: 'assistant', text: `Draft failed for @wiki:${pageRef}.` });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'diff') {
      if (!pageRef) {
        append({ role: 'assistant', text: 'Add a wiki reference, for example /diff @wiki:PAGE_ID.' });
        return true;
      }
      onNavigate({ page: pageRef });
      setContextRefs(current => mergeReferences(current, [{ type: 'wiki', id: pageRef, label: `@wiki:${pageRef}` }]));
      append({ role: 'assistant', text: `Opened @wiki:${pageRef}. Use the page banner to review changes since your last visit.` });
      return true;
    }
    if (command.verb === 'ingest') {
      const url = parseUrl(command.args);
      if (!url) {
        append({ role: 'assistant', text: 'Paste a URL after /ingest to feed it to the wiki.' });
        return true;
      }
      setBusy(true);
      try {
        const result = await ingestWikiSource({ type: 'url', url });
        setContextRefs(current => mergeReferences(current, [{ type: 'url', id: url, url, label: url }]));
        append({
          role: 'assistant',
          text: `Ingested source. ${result?.affectedPageIds?.length || 0} page${result?.affectedPageIds?.length === 1 ? '' : 's'} affected.`
        });
        onNavigate({ view: 'activity' });
      } catch (_error) {
        append({ role: 'assistant', text: 'Source ingest failed.' });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'ask') {
      const question = argsWithoutWikiRef || command.args;
      if (!question) {
        append({ role: 'assistant', text: 'Add a question after /ask.' });
        return true;
      }
      setBusy(true);
      try {
        await sendAgentMessage(question, {
          extraRefs: pageRef ? [{ type: 'wiki', id: pageRef, label: `@wiki:${pageRef}` }] : []
        });
      } catch (_error) {
        append({ role: 'assistant', text: 'Agent chat failed.' });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'lint') {
      if (!pageRef) {
        append({ role: 'assistant', text: 'Add a wiki reference, for example /lint @wiki:PAGE_ID.' });
        return true;
      }
      setBusy(true);
      try {
        await sendAgentMessage(`Lint @wiki:${pageRef}. Be opinionated: identify unsupported claims, stale sections, missing links, weak source coverage, and the smallest rebuild plan.`, {
          extraRefs: [{ type: 'wiki', id: pageRef, label: `@wiki:${pageRef}` }]
        });
      } catch (_error) {
        append({ role: 'assistant', text: `Lint failed for @wiki:${pageRef}.` });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'promote') {
      const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant' && clean(message.text) && message.id !== 'assistant-welcome');
      if (!lastAssistant) {
        append({ role: 'assistant', text: 'There is no agent answer to promote yet.' });
        return true;
      }
      setBusy(true);
      try {
        const title = argsWithoutWikiRef || clean(lastAssistant.text).split(/[.!?]\s/)[0] || 'Promoted wiki draft';
        const created = await createWikiPage(buildWikiCreatePayload({
          type: 'thought_partner',
          title,
          text: lastAssistant.text,
          pageType: 'overview',
          sourceScope: 'selected_sources'
        }));
        const createdPageId = created?._id || created?.id;
        if (createdPageId) {
          onNavigate({ page: createdPageId });
          setContextRefs(current => mergeReferences(current, [{ type: 'wiki', id: createdPageId, title, label: `@wiki:${title}` }]));
          append({ role: 'assistant', text: `Promoted the last answer into @wiki:${createdPageId}.` });
        } else {
          append({ role: 'assistant', text: 'Promoted the last answer, but the new page id was not returned.' });
        }
      } catch (_error) {
        append({ role: 'assistant', text: 'Promotion failed.' });
      } finally {
        setBusy(false);
      }
      return true;
    }
    if (command.verb === 'help') {
      append({ role: 'assistant', text: 'Commands: /ask, /draft @wiki:X, /lint @wiki:X, /promote, /page @wiki:X, /diff @wiki:X, /graph, /activity, /sources, /schema, /ingest @url:https://...' });
      return true;
    }
    return false;
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    const text = clean(input);
    if (!text || busy) return;
    setInput('');
    append({ role: 'user', text });
    setContextRefs(current => mergeReferences(current, referencesFromText(text, referenceCatalog)));
    const command = parseCommand(text);
    if (command && await handleCommand(command)) return;

    setBusy(true);
    try {
      await sendAgentMessage(text);
    } catch (_error) {
      append({ role: 'assistant', text: 'Agent chat failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wiki-workspace-chat" aria-label="Wiki agent chat">
      <header>
        <p className="wiki-index__eyebrow">Agent workspace</p>
        <h1>Wiki chat</h1>
        <span>{busy ? 'Agent is working' : threadId ? 'Saved thread' : 'Ready'}</span>
        {threadId ? (
          <Link className="wiki-workspace-chat__thread-link" to={`/think?tab=threads&threadId=${encodeURIComponent(threadId)}`}>
            Open thread{threadTitle ? ` · ${threadTitle}` : ''}
          </Link>
        ) : null}
      </header>
      <div ref={scrollRef} className="wiki-workspace-chat__messages">
        {messages.map(message => (
          <article key={message.id} className={`wiki-workspace-chat__message is-${message.role}`}>
            <span>{message.role === 'user' ? 'You' : 'Agent'}</span>
            <p>{message.text}</p>
          </article>
        ))}
      </div>
      <form onSubmit={submit} className="wiki-workspace-chat__composer">
        {contextRefs.length ? (
          <div className="wiki-workspace-chat__refs" aria-label="Workspace context references">
            {contextRefs.map(ref => (
              <button
                type="button"
                key={contextKeyFor(ref)}
                onClick={() => setContextRefs(current => current.filter(item => contextKeyFor(item) !== contextKeyFor(ref)))}
                aria-label={`Remove ${labelForRef(ref)}`}
              >
                {labelForRef(ref)}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit(event);
          }}
          placeholder="Ask, paste a source, or type / for wiki commands"
          aria-label="Wiki workspace message"
          rows={4}
          disabled={busy}
        />
        {showCommands.length ? (
          <div className="wiki-workspace-chat__palette" aria-label="Wiki commands">
            {showCommands.map(command => (
              <button type="button" key={command.verb} onClick={() => applyCommandTemplate(command.template)}>
                <strong>/{command.verb}</strong>
                <span>{command.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showMentions.length ? (
          <div className="wiki-workspace-chat__palette" aria-label="Workspace references">
            {showMentions.map(ref => (
              <button type="button" key={contextKeyFor(ref)} onClick={() => applyMention(ref)}>
                <strong>{ref.title || ref.label || 'Reference'}</strong>
                <span>@{ref.type}:{ref.id || ref.url}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div>
          <span>Type / for commands, @ for references</span>
          <Button type="submit" disabled={busy || !input.trim()}>{busy ? 'Working...' : 'Send'}</Button>
        </div>
      </form>
    </section>
  );
};

const WikiWorkspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [chatWidth, setChatWidth] = useState(() => Number(window.localStorage?.getItem(CHAT_WIDTH_KEY)) || 380);
  const [busy, setBusy] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mobilePane, setMobilePane] = useState('chat');
  const [routeOverride, setRouteOverride] = useState('');
  const [chatDraft, setChatDraft] = useState(null);
  const [chatCollapsed, setChatCollapsed] = useState(() => window.localStorage?.getItem(CHAT_COLLAPSED_KEY) === 'true');
  const [wikiCollapsed, setWikiCollapsed] = useState(() => window.localStorage?.getItem(WIKI_COLLAPSED_KEY) === 'true');
  const touchStartRef = useRef(null);
  const dragRef = useRef(null);
  const chatWidthRef = useRef(chatWidth);
  const lastSelectedPageRef = useRef('');

  const params = useMemo(() => new URLSearchParams(routeOverride || location.search), [location.search, routeOverride]);
  const selectedPageId = clean(params.get('page'));
  const explicitView = clean(params.get('view'));
  const view = selectedPageId ? 'page' : explicitView || 'graph';

  useEffect(() => {
    chatWidthRef.current = chatWidth;
  }, [chatWidth]);

  useEffect(() => {
    if (selectedPageId) lastSelectedPageRef.current = selectedPageId;
  }, [selectedPageId]);

  useEffect(() => {
    if (selectedPageId) {
      window.localStorage?.setItem?.(LAST_PAGE_KEY, selectedPageId);
      return;
    }
    if (explicitView) return;
    const lastPage = clean(window.localStorage?.getItem?.(LAST_PAGE_KEY));
    const target = lastPage ? { page: lastPage } : { view: 'graph' };
    setRouteOverride(searchFor(target));
    navigate(viewPathFor(target), { replace: true });
  }, [explicitView, navigate, selectedPageId]);

  useEffect(() => {
    if (!busy || !selectedPageId) return undefined;
    const handle = window.setInterval(async () => {
      try {
        await getWikiPage(selectedPageId, { force: true });
        setRefreshNonce(value => value + 1);
      } catch (_error) {
        // Polling is opportunistic; the explicit command result still reports failure.
      }
    }, POLL_MS);
    return () => window.clearInterval(handle);
  }, [busy, selectedPageId]);

  const onNavigate = useCallback(({ page = '', view: nextView = '' } = {}) => {
    if (selectedPageId) lastSelectedPageRef.current = selectedPageId;
    const target = { page, view: nextView || 'graph' };
    setRouteOverride(searchFor(target));
    navigate(viewPathFor(target));
    if (page) setMobilePane('wiki');
    if (page || nextView) setWikiCollapsed(false);
  }, [navigate, selectedPageId]);

  const onPageChanged = useCallback((pageId) => {
    if (pageId === selectedPageId) setRefreshNonce(value => value + 1);
  }, [selectedPageId]);

  const useSourceInChat = useCallback((article = {}) => {
    const title = clean(article.title || article.url || 'this source');
    const url = clean(article.url);
    const pageId = selectedPageId || lastSelectedPageRef.current;
    const pageContext = pageId ? ` for @wiki:${pageId}` : '';
    const refs = [];
    if (article._id || article.id) refs.push({
      type: 'article',
      id: article._id || article.id,
      title,
      url,
      label: title
    });
    if (url) refs.push({ type: 'url', id: url, url, label: url });
    if (pageId) refs.push({ type: 'wiki', id: pageId, label: `@wiki:${pageId}` });
    setChatDraft({
      id: `${article._id || article.id || title}-${Date.now()}`,
      text: `Use "${title}"${url ? ` (${url})` : ''}${pageContext} and tell me what wiki update it supports.`,
      refs
    });
    setMobilePane('chat');
  }, [selectedPageId]);

  const rightPane = useMemo(() => {
    if (selectedPageId) {
      return (
        <WikiPageReadView
          key={`${selectedPageId}:${refreshNonce}`}
          pageId={selectedPageId}
          workspaceMode
          onEdit={() => navigate(`/wiki/${selectedPageId}`)}
        />
      );
    }
    if (view === 'activity') return <WorkspaceActivity />;
    if (view === 'sources') return <WorkspaceSources onUseSource={useSourceInChat} />;
    if (view === 'schema') return <WorkspaceSchema />;
    return (
      <Suspense fallback={<p className="wiki-index__status">Loading wiki graph...</p>}>
        <WikiIndex />
      </Suspense>
    );
  }, [navigate, refreshNonce, selectedPageId, useSourceInChat, view]);

  const toggleChatCollapsed = () => {
    setChatCollapsed(current => {
      const next = !current;
      window.localStorage?.setItem?.(CHAT_COLLAPSED_KEY, String(next));
      if (next && wikiCollapsed) {
        setWikiCollapsed(false);
        window.localStorage?.setItem?.(WIKI_COLLAPSED_KEY, 'false');
      }
      return next;
    });
  };

  const toggleWikiCollapsed = () => {
    setWikiCollapsed(current => {
      const next = !current;
      window.localStorage?.setItem?.(WIKI_COLLAPSED_KEY, String(next));
      if (next && chatCollapsed) {
        setChatCollapsed(false);
        window.localStorage?.setItem?.(CHAT_COLLAPSED_KEY, 'false');
      }
      return next;
    });
  };

  const handleDragStart = (event) => {
    dragRef.current = { startX: event.clientX, startWidth: chatWidth };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (event) => {
    if (!dragRef.current) return;
    const next = Math.max(300, Math.min(560, dragRef.current.startWidth + event.clientX - dragRef.current.startX));
    setChatWidth(next);
  };

  const handleDragEnd = () => {
    window.localStorage?.setItem?.(CHAT_WIDTH_KEY, String(chatWidthRef.current));
    dragRef.current = null;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    setMobilePane(dx < 0 ? 'wiki' : 'chat');
  };

  return (
    <main
      className={`wiki-workspace is-mobile-${mobilePane} ${chatCollapsed ? 'is-chat-collapsed' : ''} ${wikiCollapsed ? 'is-wiki-collapsed' : ''}`.trim()}
      style={{ '--wiki-workspace-chat-width': `${chatWidth}px` }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="wiki-workspace__mobile-tabs" role="tablist" aria-label="Workspace panes">
        <button type="button" className={mobilePane === 'chat' ? 'is-active' : ''} onClick={() => setMobilePane('chat')}>Chat</button>
        <button type="button" className={mobilePane === 'wiki' ? 'is-active' : ''} onClick={() => setMobilePane('wiki')}>Wiki</button>
      </div>
      <div className="wiki-workspace__desktop-tabs" aria-label="Desktop workspace panes">
        <button type="button" onClick={toggleChatCollapsed} aria-pressed={chatCollapsed}>
          {chatCollapsed ? 'Show chat' : 'Hide chat'}
        </button>
        <button type="button" onClick={toggleWikiCollapsed} aria-pressed={wikiCollapsed}>
          {wikiCollapsed ? 'Show wiki' : 'Hide wiki'}
        </button>
      </div>
      <aside className="wiki-workspace__chat-pane">
        <WikiWorkspaceChat
          selectedPageId={selectedPageId}
          view={view}
          onNavigate={onNavigate}
          onPageChanged={onPageChanged}
          busy={busy}
          setBusy={setBusy}
          chatDraft={chatDraft}
        />
      </aside>
      <button
        type="button"
        className="wiki-workspace__resizer"
        aria-label="Resize workspace panes"
        onMouseDown={handleDragStart}
      />
      <section className="wiki-workspace__right-pane" aria-label="Wiki workspace right pane">
        <Suspense fallback={<p className="wiki-index__status">Loading wiki view...</p>}>
          {rightPane}
        </Suspense>
      </section>
    </main>
  );
};

export default WikiWorkspace;
