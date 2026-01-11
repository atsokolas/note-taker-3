import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import AllHighlights from './AllHighlights';
import TagBrowser from './TagBrowser';
import Views from './Views';
import Collections from './Collections';
import { Page, Button, TagChip, SectionHeader, QuietButton, SubtleDivider } from '../components/ui';
import { fetchWithCache, getCached, setCached } from '../utils/cache';
import WorkspaceShell from '../layouts/WorkspaceShell';
import ArticleReader from '../components/ArticleReader';

const RIGHT_STORAGE_KEY = 'workspace-right-open:/library';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const LibraryMode = () => {
  const tabs = [
    { key: 'articles', label: 'Articles' },
    { key: 'highlights', label: 'Highlights' },
    { key: 'concepts', label: 'Concepts' },
    { key: 'views', label: 'Saved Views' },
    { key: 'collections', label: 'Collections' }
  ];
  const [active, setActive] = useState('articles');
  const [filters, setFilters] = useState({
    query: '',
    tags: [],
    dateFrom: '',
    dateTo: '',
    sort: 'recent'
  });
  const [tagOptions, setTagOptions] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [showSaveView, setShowSaveView] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [saveViewForm, setSaveViewForm] = useState({ name: '', description: '' });
  const [saveViewError, setSaveViewError] = useState('');
  const [articles, setArticles] = useState([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState('');
  const [articleHighlights, setArticleHighlights] = useState([]);
  const [references, setReferences] = useState({ notebookBlocks: [], collections: [] });
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesError, setReferencesError] = useState('');
  const [activeHighlightId, setActiveHighlightId] = useState('');
  const [rightOpen, setRightOpen] = useState(() => {
    const stored = localStorage.getItem(RIGHT_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });
  const [readingMode, setReadingMode] = useState(false);
  const [savedRightOpen, setSavedRightOpen] = useState(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [highlightToSend, setHighlightToSend] = useState(null);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('new');
  const [sendingHighlight, setSendingHighlight] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const readerRef = useRef(null);

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const setRightPanelOpen = (value) => {
    setRightOpen(value);
    localStorage.setItem(RIGHT_STORAGE_KEY, String(value));
  };

  useEffect(() => {
    const loadTags = async () => {
      setTagsLoading(true);
      try {
        const data = await fetchWithCache('tags.list', async () => {
          const res = await api.get('/api/tags', authHeaders());
          return res.data || [];
        });
        setTagOptions(data);
      } catch (err) {
        console.error('Failed to load tags for filters:', err);
      } finally {
        setTagsLoading(false);
      }
    };
    loadTags();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && tabs.some(t => t.key === tab)) {
      setActive(tab);
    }
    const tag = params.get('tag');
    const from = params.get('from');
    const to = params.get('to');
    const q = params.get('q');
    if (tag || from || to || q) {
      setFilters((prev) => ({
        ...prev,
        tags: tag ? [tag] : prev.tags,
        dateFrom: from || prev.dateFrom,
        dateTo: to || prev.dateTo,
        query: q || prev.query
      }));
    }
  }, [location.search, tabs]);

  useEffect(() => {
    const loadArticles = async () => {
      setArticlesLoading(true);
      setArticlesError('');
      try {
        const res = await api.get('/get-articles', authHeaders());
        setArticles(res.data || []);
      } catch (err) {
        setArticlesError(err.response?.data?.error || 'Failed to load articles.');
      } finally {
        setArticlesLoading(false);
      }
    };
    loadArticles();
  }, []);

  useEffect(() => {
    if (articles.length === 0) return;
    const saved = localStorage.getItem('library.lastArticleId');
    if (saved && articles.some(a => a._id === saved)) {
      setSelectedArticleId(saved);
      return;
    }
    if (!selectedArticleId) {
      setSelectedArticleId(articles[0]._id);
    }
  }, [articles, selectedArticleId]);

  useEffect(() => {
    if (active !== 'articles') {
      setReadingMode(false);
    }
  }, [active]);

  useEffect(() => {
    if (!selectedArticleId || active !== 'articles') return;
    let cancelled = false;
    const loadArticle = async () => {
      setArticleLoading(true);
      setArticleError('');
      try {
        const [articleRes, highlightRes] = await Promise.all([
          api.get(`/articles/${selectedArticleId}`, authHeaders()),
          api.get(`/api/articles/${selectedArticleId}/highlights`, authHeaders()).catch(() => ({ data: [] }))
        ]);
        if (cancelled) return;
        setSelectedArticle(articleRes.data || null);
        const highlights = highlightRes.data?.length ? highlightRes.data : (articleRes.data?.highlights || []);
        setArticleHighlights(highlights);
        setActiveHighlightId('');
      } catch (err) {
        if (cancelled) return;
        setArticleError(err.response?.data?.error || 'Failed to load article.');
      } finally {
        if (!cancelled) setArticleLoading(false);
      }
    };
    loadArticle();
    return () => {
      cancelled = true;
    };
  }, [selectedArticleId, active]);

  useEffect(() => {
    if (!selectedArticleId || active !== 'articles') return;
    let cancelled = false;
    const loadReferences = async () => {
      setReferencesLoading(true);
      setReferencesError('');
      try {
        const res = await api.get(`/api/references/for-article/${selectedArticleId}`, authHeaders());
        if (!cancelled) setReferences(res.data || { notebookBlocks: [], collections: [] });
      } catch (err) {
        if (!cancelled) setReferencesError(err.response?.data?.error || 'Failed to load references.');
      } finally {
        if (!cancelled) setReferencesLoading(false);
      }
    };
    loadReferences();
    return () => {
      cancelled = true;
    };
  }, [selectedArticleId, active]);

  const toggleFilterTag = (tag) => {
    setFilters((prev) => {
      const nextTags = prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag];
      return { ...prev, tags: nextTags };
    });
  };

  const clearFilters = () => {
    setFilters({ query: '', tags: [], dateFrom: '', dateTo: '', sort: 'recent' });
  };

  const applyView = (view) => {
    const filtersFromView = view.filters || {};
    setFilters({
      query: filtersFromView.textQuery || '',
      tags: Array.isArray(filtersFromView.tags) ? filtersFromView.tags : [],
      dateFrom: filtersFromView.dateFrom ? String(filtersFromView.dateFrom).slice(0, 10) : '',
      dateTo: filtersFromView.dateTo ? String(filtersFromView.dateTo).slice(0, 10) : '',
      sort: filtersFromView.sort || 'recent'
    });
    if (view.targetType === 'articles') {
      setActive('articles');
    } else {
      setActive('highlights');
    }
  };

  const openSaveView = () => {
    setSaveViewForm({ name: '', description: '' });
    setSaveViewError('');
    setShowSaveView(true);
  };

  const saveCurrentView = async () => {
    setSavingView(true);
    setSaveViewError('');
    try {
      const payload = {
        name: saveViewForm.name.trim(),
        description: saveViewForm.description.trim(),
        targetType: active === 'articles' ? 'articles' : 'highlights',
        filters: {
          tags: filters.tags,
          textQuery: filters.query,
          dateFrom: filters.dateFrom || null,
          dateTo: filters.dateTo || null,
          sort: filters.sort
        }
      };
      const res = await api.post('/api/views', payload, authHeaders());
      const existing = getCached('views.list');
      setCached('views.list', Array.isArray(existing) ? [res.data, ...existing] : [res.data]);
      setShowSaveView(false);
    } catch (err) {
      setSaveViewError(err.response?.data?.error || 'Failed to save view.');
    } finally {
      setSavingView(false);
    }
  };

  const handleSelectArticle = (id) => {
    setSelectedArticleId(id);
    localStorage.setItem('library.lastArticleId', id);
  };

  const handleHighlightClick = (highlight) => {
    setActiveHighlightId(highlight._id);
    readerRef.current?.scrollToHighlight(highlight._id);
  };

  const handleToggleRight = (nextOpen) => {
    if (readingMode && nextOpen) {
      setReadingMode(false);
    }
    setRightPanelOpen(nextOpen);
  };

  const handleToggleReadingMode = () => {
    setReadingMode(prev => {
      const next = !prev;
      if (next) {
        setSavedRightOpen(rightOpen);
        setRightPanelOpen(false);
      } else {
        setRightPanelOpen(savedRightOpen === null ? true : savedRightOpen);
      }
      return next;
    });
  };

  const loadNotes = async () => {
    setNotesLoading(true);
    setNotesError('');
    try {
      const res = await api.get('/api/notebook', authHeaders());
      setNotes(res.data || []);
    } catch (err) {
      setNotesError(err.response?.data?.error || 'Failed to load notes.');
    } finally {
      setNotesLoading(false);
    }
  };

  const openSendModal = (highlight) => {
    setHighlightToSend(highlight);
    setSelectedNoteId('new');
    setSendModalOpen(true);
    if (notes.length === 0) {
      loadNotes();
    }
  };

  const closeSendModal = () => {
    setSendModalOpen(false);
    setHighlightToSend(null);
    setSendingHighlight(false);
  };

  const createHighlightBlock = (highlight) => {
    const blockId = createId();
    const text = `"${highlight.text}" — ${highlight.articleTitle || selectedArticle?.title || 'Untitled article'}`;
    const html = `<blockquote data-highlight-id="${escapeHtml(highlight._id)}" data-block-id="${blockId}">${escapeHtml(text)}</blockquote><p></p>`;
    return { blockId, text, html };
  };

  const createNoteFromHighlight = async (highlight) => {
    const title = highlight.articleTitle ? `Note — ${highlight.articleTitle}` : 'New note';
    const block = createHighlightBlock(highlight);
    const payload = {
      title,
      content: `<h2>${escapeHtml(title)}</h2>${block.html}`,
      blocks: [{ id: block.blockId, type: 'highlight-ref', text: block.text, highlightId: highlight._id }]
    };
    const res = await api.post('/api/notebook', payload, authHeaders());
    return res.data?._id || null;
  };

  const appendHighlightToNote = async (highlight, noteId) => {
    const res = await api.get(`/api/notebook/${noteId}`, authHeaders());
    const entry = res.data;
    if (!entry) return;
    const block = createHighlightBlock(highlight);
    const nextBlocks = [...(entry.blocks || []), { id: block.blockId, type: 'highlight-ref', text: block.text, highlightId: highlight._id }];
    const contentBase = entry.content || '';
    const nextContent = `${contentBase}${contentBase ? '' : ''}${block.html}`;
    await api.put(`/api/notebook/${noteId}`, { content: nextContent, blocks: nextBlocks }, authHeaders());
  };

  const sendHighlightToNote = async () => {
    if (!highlightToSend) return;
    setSendingHighlight(true);
    try {
      if (selectedNoteId === 'new') {
        const newId = await createNoteFromHighlight(highlightToSend);
        if (newId) navigate(`/notebook?entryId=${newId}`);
      } else {
        await appendHighlightToNote(highlightToSend, selectedNoteId);
        navigate(`/notebook?entryId=${selectedNoteId}`);
      }
      closeSendModal();
    } catch (err) {
      setNotesError(err.response?.data?.error || 'Failed to send highlight.');
      setSendingHighlight(false);
    }
  };

  const canSaveView = active === 'articles' || active === 'highlights';

  const filteredTagOptions = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    if (!query) return tagOptions;
    return tagOptions.filter(t => t.tag.toLowerCase().includes(query));
  }, [tagOptions, filters.query]);

  const groupedHighlights = useMemo(() => {
    const groups = {};
    (articleHighlights || []).forEach(h => {
      const tags = h.tags && h.tags.length > 0 ? h.tags : ['Untagged'];
      tags.forEach(tag => {
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(h);
      });
    });
    return groups;
  }, [articleHighlights]);

  const highlightGroups = useMemo(() => {
    const tags = Object.keys(groupedHighlights);
    return tags.sort((a, b) => a.localeCompare(b));
  }, [groupedHighlights]);

  const activeHighlight = useMemo(
    () => articleHighlights.find(h => h._id === activeHighlightId) || null,
    [articleHighlights, activeHighlightId]
  );

  const renderTab = () => {
    switch (active) {
      case 'highlights':
        return <AllHighlights embedded filters={filters} />;
      case 'concepts':
        return <TagBrowser embedded filters={filters} />;
      case 'views':
        return <Views embedded filters={filters} onSelectView={applyView} />;
      case 'collections':
        return <Collections embedded filters={filters} />;
      default:
        return null;
    }
  };

  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Library" subtitle="Reading room." />
      <div className="section-stack">
        {tabs.map(t => (
          <QuietButton
            key={t.key}
            className={active === t.key ? 'is-active' : ''}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </QuietButton>
        ))}
      </div>
      {active === 'articles' && (
        <>
          <SubtleDivider />
          <div className="library-article-list">
            {articlesLoading && <p className="muted small">Loading articles…</p>}
            {articlesError && <p className="status-message error-message">{articlesError}</p>}
            {!articlesLoading && !articlesError && articles.length === 0 && (
              <p className="muted small">No saved articles yet.</p>
            )}
            {!articlesLoading && !articlesError && articles.map(article => (
              <button
                key={article._id}
                className={`library-article-item ${selectedArticleId === article._id ? 'is-active' : ''}`}
                onClick={() => handleSelectArticle(article._id)}
              >
                <div className="library-article-title">{article.title || 'Untitled article'}</div>
                <div className="library-article-meta">
                  <span>{formatDate(article.createdAt)}</span>
                  <span>{(article.highlights || []).length} highlights</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const mainPanel = active === 'articles' ? (
    <div className="section-stack">
      {articleError && <p className="status-message error-message">{articleError}</p>}
      {articleLoading && <p className="muted small">Loading article…</p>}
      {!articleLoading && (
        <ArticleReader
          ref={readerRef}
          article={selectedArticle}
          highlights={articleHighlights}
          readingMode={readingMode}
          onToggleReadingMode={handleToggleReadingMode}
        />
      )}
    </div>
  ) : (
    <div className="section-stack">{renderTab()}</div>
  );

  const rightPanel = active === 'articles' ? (
    <div className="section-stack">
      <SectionHeader title="Quick actions" subtitle="Use one highlight at a time." />
      {activeHighlight ? (
        <div className="library-quick-actions">
          <QuietButton onClick={() => openSendModal(activeHighlight)}>Send highlight to note</QuietButton>
          {activeHighlight.tags && activeHighlight.tags.length > 0 && (
            <QuietButton onClick={() => navigate(`/tags/${encodeURIComponent(activeHighlight.tags[0])}`)}>
              Open concept page
            </QuietButton>
          )}
        </div>
      ) : (
        <p className="muted small">Select a highlight to enable quick actions.</p>
      )}
      <SubtleDivider />
      <SectionHeader title="Highlights" subtitle="Grouped by concept." />
      {articleHighlights.length === 0 && !articleLoading && (
        <p className="muted small">No highlights saved for this article yet.</p>
      )}
      {highlightGroups.map(tag => (
        <div key={tag} className="library-highlight-group">
          <div className="library-highlight-group-header">
            <span className="library-highlight-group-title">{tag}</span>
            {tag !== 'Untagged' && (
              <Link to={`/tags/${encodeURIComponent(tag)}`} className="muted small">Open concept</Link>
            )}
          </div>
          <div className="library-highlight-list">
            {groupedHighlights[tag].map(highlight => (
              <div
                key={highlight._id}
                className={`library-highlight-item ${activeHighlightId === highlight._id ? 'is-active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => handleHighlightClick(highlight)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleHighlightClick(highlight);
                }}
              >
                <div className="library-highlight-text">{highlight.text}</div>
                <div className="library-highlight-tags">
                  {(highlight.tags || []).length > 0 ? (
                    highlight.tags.map(tagName => (
                      <TagChip key={`${highlight._id}-${tagName}`} to={`/tags/${encodeURIComponent(tagName)}`}>
                        {tagName}
                      </TagChip>
                    ))
                  ) : (
                    <span className="muted small">Untagged</span>
                  )}
                </div>
                <div className="library-highlight-actions">
                  <QuietButton
                    onClick={(e) => {
                      e.stopPropagation();
                      openSendModal(highlight);
                    }}
                  >
                    Send to Note
                  </QuietButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <SubtleDivider />
      <SectionHeader title="Used in Notes" subtitle="Backlinks for this article." />
      {referencesLoading && <p className="muted small">Loading references…</p>}
      {referencesError && <p className="status-message error-message">{referencesError}</p>}
      {!referencesLoading && !referencesError && (
        <div className="library-references">
          {references.notebookBlocks.length === 0 ? (
            <p className="muted small">No notes yet.</p>
          ) : (
            references.notebookBlocks.slice(0, 6).map((block, idx) => (
              <button
                key={`${block.notebookEntryId}-${block.blockId}-${idx}`}
                className="library-reference-item"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('entryId', block.notebookEntryId);
                  if (block.blockId) params.set('blockId', block.blockId);
                  navigate(`/notebook?${params.toString()}`);
                }}
              >
                <div className="library-reference-title">{block.notebookTitle || 'Untitled note'}</div>
                <div className="muted small">{block.blockPreviewText || 'Referenced block'}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  ) : (
    <div className="section-stack">
      <SectionHeader title="Filters" subtitle="Narrow the view." />
      <label className="feedback-field" style={{ margin: 0 }}>
        <span>Search</span>
        <input
          type="text"
          value={filters.query}
          onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
          placeholder="Search titles, text, notes, or tags"
        />
      </label>
      <label className="feedback-field" style={{ margin: 0 }}>
        <span>Sort</span>
        <select
          value={filters.sort}
          onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value }))}
          className="compact-select"
        >
          <option value="recent">Most recent</option>
          <option value="most-highlighted">Most highlighted</option>
        </select>
      </label>
      <label className="feedback-field" style={{ margin: 0 }}>
        <span>From</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
        />
      </label>
      <label className="feedback-field" style={{ margin: 0 }}>
        <span>To</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <QuietButton onClick={clearFilters}>Clear</QuietButton>
        <Button onClick={openSaveView} disabled={!canSaveView}>Save view</Button>
      </div>
      <SubtleDivider />
      <SectionHeader title="Tags" subtitle="Quick filters." />
      <div className="library-tag-filters" style={{ padding: 0, border: 'none' }}>
        {tagsLoading && <span className="muted small">Loading tags…</span>}
        {!tagsLoading && filteredTagOptions.map(t => (
          <TagChip
            key={t.tag}
            className={filters.tags.includes(t.tag) ? 'ui-tag-chip-selected' : ''}
            onClick={() => toggleFilterTag(t.tag)}
          >
            {t.tag} <span className="tag-count">{t.count}</span>
          </TagChip>
        ))}
        {!tagsLoading && filteredTagOptions.length === 0 && (
          <span className="muted small">No tags match that search.</span>
        )}
      </div>
    </div>
  );

  return (
    <Page>
      <WorkspaceShell
        title="Library"
        subtitle="Read in full. Keep your highlights close. Return when it matters."
        eyebrow="Mode"
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        defaultRightOpen
        rightOpen={active === 'articles' ? (readingMode ? false : rightOpen) : rightOpen}
        onToggleRight={handleToggleRight}
        className={`library-shell ${active === 'articles' && readingMode ? 'library-shell--reading' : ''}`}
      />
      {showSaveView && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Save this view</h3>
              <button className="icon-button" onClick={() => setShowSaveView(false)}>×</button>
            </div>
            <label className="feedback-field">
              <span>Name</span>
              <input
                type="text"
                value={saveViewForm.name}
                onChange={(e) => setSaveViewForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="feedback-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={saveViewForm.description}
                onChange={(e) => setSaveViewForm(f => ({ ...f, description: e.target.value }))}
              />
            </label>
            {saveViewError && <p className="status-message error-message">{saveViewError}</p>}
            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowSaveView(false)}>Cancel</Button>
              <Button onClick={saveCurrentView} disabled={savingView || !saveViewForm.name.trim()}>
                {savingView ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {sendModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Send highlight to note</h3>
              <button className="icon-button" onClick={closeSendModal}>×</button>
            </div>
            {highlightToSend && (
              <p className="muted small">{highlightToSend.text}</p>
            )}
            <label className="feedback-field">
              <span>Choose note</span>
              <select
                value={selectedNoteId}
                onChange={(e) => setSelectedNoteId(e.target.value)}
                className="compact-select"
              >
                <option value="new">New note</option>
                {notes.map(note => (
                  <option key={note._id} value={note._id}>{note.title || 'Untitled note'}</option>
                ))}
              </select>
            </label>
            {notesLoading && <p className="muted small">Loading notes…</p>}
            {notesError && <p className="status-message error-message">{notesError}</p>}
            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={closeSendModal}>Cancel</Button>
              <Button onClick={sendHighlightToNote} disabled={sendingHighlight || notesLoading}>
                {sendingHighlight ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default LibraryMode;
