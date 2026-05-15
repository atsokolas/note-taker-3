import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { chatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import {
  getWikiPage,
  getWikiSchema,
  ingestWikiSource,
  listWikiActivity,
  listWikiPages,
  saveWikiSchema,
  streamMaintainWikiPage
} from '../../api/wiki';
import { Button } from '../ui';
import WikiIndex from './WikiIndex';
import WikiPageReadView from './WikiPageReadView';

const LAST_PAGE_KEY = 'noeis.wiki.workspace.last_page_id';
const CHAT_WIDTH_KEY = 'noeis.wiki.workspace.chat_width';
const POLL_MS = 2000;

const clean = (value = '') => String(value || '').trim();

const messageId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const COMMANDS = [
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
    template: '/ingest https://',
    label: 'Ingest URL',
    hint: 'Feed a source URL to the wiki.'
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
  )).slice(0, 6);
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
  const match = String(value || '').match(/https?:\/\/\S+/i);
  return clean(match?.[0]);
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
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!chatDraft?.text) return;
    setInput(chatDraft.text);
  }, [chatDraft]);

  useEffect(() => {
    let cancelled = false;
    listWikiPages({ limit: 30 })
      .then((pages) => {
        if (!cancelled) setWikiPages(Array.isArray(pages) ? pages : []);
      })
      .catch(() => {
        if (!cancelled) setWikiPages([]);
      });
    return () => { cancelled = true; };
  }, []);

  const append = useCallback((message) => {
    setMessages(current => [...current, { id: messageId(message.role), createdAt: new Date().toISOString(), ...message }]);
  }, []);

  const showCommands = commandMatches(input);
  const mentionQuery = useMemo(() => {
    const match = input.match(/@wiki:([^\s]*)$/i);
    return match ? clean(match[1]).toLowerCase() : '';
  }, [input]);
  const showWikiMentions = useMemo(() => {
    if (!input.match(/@wiki:[^\s]*$/i)) return [];
    return wikiPages
      .filter(page => {
        const id = String(page._id || page.id || '').toLowerCase();
        const title = String(page.title || '').toLowerCase();
        return !mentionQuery || id.includes(mentionQuery) || title.includes(mentionQuery);
      })
      .slice(0, 6);
  }, [input, mentionQuery, wikiPages]);

  const applyCommandTemplate = (template) => {
    setInput(template);
  };

  const applyWikiMention = (page) => {
    const pageId = clean(page?._id || page?.id);
    if (!pageId) return;
    setInput(current => current.replace(/@wiki:[^\s]*$/i, `@wiki:${pageId}`));
  };

  const handleCommand = async (command) => {
    const pageRef = parseWikiRef(command.args) || selectedPageId;
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
      append({ role: 'assistant', text: `Drafting @wiki:${pageRef}. The right pane will update from the maintenance stream.` });
      try {
        await streamMaintainWikiPage(pageRef, {}, {
          onPage: (_page, event = {}) => {
            onNavigate({ page: pageRef });
            onPageChanged?.(pageRef);
          },
          onEvent: (event, payload = {}) => {
            if (event !== 'wiki-draft') return;
            if (payload.stage === 'quality_rebuild') {
              append({ role: 'assistant', text: 'The first draft missed quality gates, so I am rebuilding it once with stricter instructions.' });
            }
          }
        });
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
    if (command.verb === 'ingest') {
      const url = parseUrl(command.args);
      if (!url) {
        append({ role: 'assistant', text: 'Paste a URL after /ingest to feed it to the wiki.' });
        return true;
      }
      setBusy(true);
      try {
        const result = await ingestWikiSource({ type: 'url', url });
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
    if (command.verb === 'help') {
      append({ role: 'assistant', text: 'Commands: /draft @wiki:X, /page @wiki:X, /graph, /activity, /sources, /schema, /ingest <url>.' });
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
    const command = parseCommand(text);
    if (command && await handleCommand(command)) return;

    setBusy(true);
    try {
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
          metadata: {
            surface: 'wiki_workspace'
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
      append({ role: 'assistant', text: clean(result?.reply) || 'No reply generated.' });
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
        {showWikiMentions.length ? (
          <div className="wiki-workspace-chat__palette" aria-label="Wiki page references">
            {showWikiMentions.map(page => (
              <button type="button" key={page._id || page.id} onClick={() => applyWikiMention(page)}>
                <strong>{page.title || 'Untitled wiki page'}</strong>
                <span>@wiki:{page._id || page.id}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div>
          <span>Type / for commands, @wiki: for page references</span>
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
        await getWikiPage(selectedPageId);
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
  }, [navigate, selectedPageId]);

  const onPageChanged = useCallback((pageId) => {
    if (pageId === selectedPageId) setRefreshNonce(value => value + 1);
  }, [selectedPageId]);

  const useSourceInChat = useCallback((article = {}) => {
    const title = clean(article.title || article.url || 'this source');
    const url = clean(article.url);
    const pageId = selectedPageId || lastSelectedPageRef.current;
    const pageContext = pageId ? ` for @wiki:${pageId}` : '';
    setChatDraft({
      id: `${article._id || article.id || title}-${Date.now()}`,
      text: `Use "${title}"${url ? ` (${url})` : ''}${pageContext} and tell me what wiki update it supports.`
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
    return <WikiIndex />;
  }, [navigate, refreshNonce, selectedPageId, useSourceInChat, view]);

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
      className={`wiki-workspace is-mobile-${mobilePane}`}
      style={{ '--wiki-workspace-chat-width': `${chatWidth}px` }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="wiki-workspace__mobile-tabs" role="tablist" aria-label="Workspace panes">
        <button type="button" className={mobilePane === 'chat' ? 'is-active' : ''} onClick={() => setMobilePane('chat')}>Chat</button>
        <button type="button" className={mobilePane === 'wiki' ? 'is-active' : ''} onClick={() => setMobilePane('wiki')}>Wiki</button>
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
        {rightPane}
      </section>
    </main>
  );
};

export default WikiWorkspace;
