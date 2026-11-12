import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import authoredExplorations from '../api/authoredExplorations';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearNotebookCache, getNotebookShelf, moveNotebookEntry } from '../api/notebook';
import { getConcepts, updateConcept } from '../api/concepts';
import { createQuestion, getQuestions } from '../api/questions';
import { getAgentThread } from '../api/agent';
import { getHighlights } from '../api/highlights';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import NotebookCuttings from '../components/think/notebook/NotebookCuttings';
import NoteStage from '../components/think/notebook/NoteStage';
import { movedBoard, stageChange, stageOf } from '../components/think/notebook/notebookStages';
import ThinkEntryEditor from '../components/think/ThinkEntryEditor';
import ThinkBar from '../components/think/ThinkBar';
import ThinkDesk from '../components/think/ThinkDesk';
import ThinkIndex from '../components/think/ThinkIndex';
import FocusMode from '../components/think/FocusMode';
import {
  RoomShelfList,
  RoomShelfSection,
  roomShelfItemClass
} from '../components/collection/RoomShelf';
import { takeFirstPaint } from '../motion/columnMotion';
import { useAgentRail, useNoeisAgentSurface } from '../agent/AgentRailContext';
import {
  buildAuthoredShelf,
  buildThinkEntries,
  buildWritingResults,
  isTarget,
  readThinkTarget,
  readThinkView,
  targetParams,
  thinkView,
  THINK_VIEWS
} from './thinkNotesModel';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { Button } from '../components/ui';

// Think.
//
// Opening Think opens the desk: the pieces you are writing and where each one
// stopped. The left bar lists every way of looking (Working, Ideas, Closed,
// Concepts, Questions, Cuttings); notes, concepts and questions all open in
// one page. The Partner (⌘J) reads beside the page; the page only changes
// when the reader keeps what came back.

const WritingMatch = ({ item }) => {
  const text = item.excerpt || '';
  const start = Math.max(0, Math.min(text.length, item.matchStart || 0));
  const end = Math.min(text.length, start + (item.matchLength || 0));
  return <>{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</>;
};

const ThinkNotes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const target = readThinkTarget(searchParams);
  const view = readThinkView(searchParams);
  const [notes, setNotes] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [openRecord, setOpenRecord] = useState(null);
  const threadId = searchParams.get('threadId') || '';
  const pulling = searchParams.get('pull') === '1';
  const entries = useMemo(() => buildThinkEntries({ notes, concepts, questions }), [notes, concepts, questions]);
  const piecesIn = key => entries.filter(thinkView(key).holds);
  const working = piecesIn('working');
  const views = THINK_VIEWS.map(item => ({ ...item, count: item.holds ? piecesIn(item.key).length : null }));
  /* Asked for on their own, concepts include every tag you have used, not only named ones. */
  const viewEntries = view === 'concepts' ? buildThinkEntries({ concepts, filter: 'concept' })
    : thinkView(view)?.holds ? piecesIn(view) : [];
  /* Which entry is open: the one the URL names, and nothing otherwise. */
  const targetKey = target ? `${target.kind}:${target.id}` : '';
  const openTarget = useMemo(() => (
    target ? entries.find(item => `${item.kind}:${item.id}` === targetKey) || target : null
  ), [target, targetKey, entries]);
  const openId = openTarget?.kind === 'note' ? openTarget.id : '';
  const activeId = useRef(openId);
  activeId.current = openId;
  const saveCurrent = useRef(null);
  const room = useRef(null);
  const noteSurface = useRef(null);
  const drawer = useRef(null);
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState('');
  const [freshId, setFreshId] = useState('');
  const previousOpenId = useRef(openId);
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const shelfQuery = searchParams.get('find') || '';
  const phrase = shelfQuery.trim().replace(/\s+/g, ' ');
  const [searchResult, setSearchResult] = useState(null);
  const navigate = useNavigate();
  const setShelfQuery = value => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('find', value); else params.delete('find');
    setSearchParams(params, { replace: true });
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || Boolean(shelfQuery);
  const [contextByNote, setContextByNote] = useState({});
  const [contextPortal, setContextPortal] = useState(null);
  const [alternativesPortal, setAlternativesPortal] = useState(null);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [partnerTrial, setPartnerTrial] = useState(null);
  const registerPartnerTrial = useCallback((handler) => setPartnerTrial(() => handler), []);
  const [compactContext, setCompactContext] = useState(false);
  const [authoredWork, setAuthoredWork] = useState([]);
  const [authoredError, setAuthoredError] = useState('');
  const [lastMark, setLastMark] = useState(null);
  const arriving = useMemo(() => takeFirstPaint('think-notes'), []);
  const openKey = openTarget ? `${openTarget.kind}:${openTarget.id}` : '';
  const openKeyRef = useRef(openKey);
  openKeyRef.current = openKey;
  const activeContext = contextByNote[openKey] || null;
  const { ask, adoptThread } = useAgentRail();
  const openContext = useCallback((mode) => {
    if (mode === 'partner') {
      window.dispatchEvent(new Event('noeis:open-agent'));
      return;
    }
    if (!openKey) return;
    if (room.current?.getBoundingClientRect().width <= 1040) setNotesCollapsed(true);
    setContextByNote(current => ({ ...current, [openKey]: mode }));
  }, [openKey]);
  const closeContext = useCallback(() => {
    if (!openKey) return;
    setContextByNote(current => ({ ...current, [openKey]: null }));
  }, [openKey]);
  const queuePartner = useCallback((queued) => {
    if (queued?.prompt) ask(queued.prompt);
  }, [ask]);
  useEffect(() => {
    const element = room.current;
    if (!element) return undefined;
    const sync = () => setCompactContext(element.getBoundingClientRect().width <= 760);
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(element);
    window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, []);
  const focusAlternatives = useCallback(() => {
    closeContext();
    if (room.current?.getBoundingClientRect().width <= 1040) setNotesCollapsed(true);
  }, [closeContext]);
  const contextTakesFocus = Boolean(activeContext && compactContext);
  useEffect(() => {
    if (!activeContext) return undefined;
    const frame = contextTakesFocus ? window.requestAnimationFrame(() => drawer.current?.querySelector('[aria-selected="true"]')?.focus()) : null;
    const onKeyDown = (event) => {
      if (contextTakesFocus && event.key === 'Tab') {
        const buttons = [...(drawer.current?.querySelectorAll('button, input, textarea, a[href], [tabindex="0"]') || [])].filter(item => !item.disabled && item.getClientRects().length);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      const closedMode = activeContext;
      closeContext();
      window.requestAnimationFrame?.(() => noteSurface.current?.querySelector(`[data-context-trigger="${closedMode}"]`)?.focus?.());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); if (frame != null) window.cancelAnimationFrame(frame); };
  }, [activeContext, closeContext, contextTakesFocus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await getNotebookShelf();
        if (cancelled) return;
        const list = Array.isArray(summaries) ? summaries : [];
        setNotes(list);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open your notes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // The shelf is read once; opening a note is handled below without refetching it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* An empty notebook opens on the reader's last mark, if there is one: the
     passage they just highlighted, and the thought they left on it. With no
     mark there is nothing to show and the page stays quiet. */
  useEffect(() => {
    if (loading || notes.length) return undefined;
    let cancelled = false;
    getHighlights({ limit: 1 })
      .then(([mark]) => { if (!cancelled && mark?.text) setLastMark(mark); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loading, notes.length]);

  // Concepts and questions join the list when they arrive; a note never waits for them.
  useEffect(() => {
    let cancelled = false;
    getConcepts().then(rows => { if (!cancelled) setConcepts(Array.isArray(rows) ? rows : []); }).catch(() => {});
    getQuestions().then(rows => { if (!cancelled) setQuestions(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* A conversation with the Partner opens beside the page it belongs with. */
  useEffect(() => {
    if (!threadId) return undefined;
    let cancelled = false;
    getAgentThread(threadId).then(result => {
      if (cancelled || !result?.thread?.threadId) return;
      adoptThread(result.thread);
      window.dispatchEvent(new Event('noeis:open-agent'));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [adoptThread, threadId]);

  // Private continuations load independently: neither notes nor the partner
  // wait for them, and their words never enter automatic agent context.
  useEffect(() => {
    let cancelled = false;
    authoredExplorations.list().then(rows => {
      if (!cancelled) setAuthoredWork(buildAuthoredShelf(rows));
    }).catch(() => {
      if (!cancelled) setAuthoredError('Your saved writing could not be loaded. Reload to try again.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!openId || String(entry?._id || '') === openId) return undefined;
    let cancelled = false;
    setLoadingEntry(true);
    setError('');
    (async () => {
      try {
        const res = await api.get(`/api/notebook/${openId}`, getAuthHeaders());
        if (!cancelled) setEntry(res.data || null);
      } catch (loadError) {
        if (!cancelled) {
          setEntry(null);
          setError(loadError?.response?.data?.error || 'Could not open that note.');
        }
      } finally {
        if (!cancelled) setLoadingEntry(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Router transitions may commit after the new entry. Consume the writing
    // intent only when leaving that entry, never before its route has arrived.
    if (previousOpenId.current === freshId && openId !== freshId) setFreshId('');
    previousOpenId.current = openId;
  }, [freshId, openId]);

  /* ⌘K "Pull reference into current surface" lands here: the flag is
     consumed and the open page offers its passages. */
  const [pullKey, setPullKey] = useState('');
  useEffect(() => {
    if (!pulling || !openKey) return;
    setPullKey(openKey);
    const params = new URLSearchParams(searchParams);
    params.delete('pull');
    setSearchParams(params, { replace: true });
  }, [pulling, openKey, searchParams, setSearchParams]);

  useEffect(() => {
    setSearchResult(null);
    if (phrase.length < 2 || phrase.length > 160) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      authoredExplorations.search(phrase, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setSearchResult({ phrase, ...result });
      }).catch(() => {
        if (!controller.signal.aborted) setSearchResult({ phrase, error: 'Your writing could not be searched. Change the phrase or clear it to return to recent work.' });
      });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [phrase]);

  const found = searchResult?.phrase === phrase ? searchResult : null;
  const writingResults = buildWritingResults(found?.results, shelfQuery);
  const searchMessage = phrase.length > 160 ? 'Keep the phrase under 161 characters.'
    : phrase.length < 2 ? 'Add one more character to look through your writing.'
    : !found ? 'Looking through your writing…'
    : found.error || (!writingResults.length
      ? (found.limited ? 'No available matches in this batch. Try a more specific phrase.' : 'No saved writing matches these words.')
      : `${writingResults.length} ${writingResults.length === 1 ? 'match' : 'matches'} · most recently edited first`);

  const entryMatchesRoute = Boolean(
    entry?._id
    && openId
    && String(entry._id) === String(openId)
  );

  const saveEntry = useCallback(async (payload) => {
    if (!payload?.id) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/api/notebook/${payload.id}`, payload, getAuthHeaders());
      if (activeId.current === String(payload.id)) setEntry(res.data || null);
      setNotes(current => current.map(item => (
        String(item?._id) === String(payload.id) ? { ...item, ...res.data } : item
      )));
      clearNotebookCache();
      return res.data;
    } catch (saveError) {
      if (activeId.current === String(payload.id)) setError(saveError?.response?.data?.error || 'That did not save.');
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, []);

  const registerSave = useCallback(save => { saveCurrent.current = save; }, []);

  const openEntry = async (item) => {
    if (await saveCurrent.current?.() === false) return;
    setSearchParams(targetParams(item));
  };

  const openView = async (key) => {
    if (await saveCurrent.current?.() === false) return;
    setSearchOpen(false);
    setSearchParams(key === 'home' ? {} : { view: key });
  };

  const showSearch = (open) => {
    setSearchOpen(open);
    if (!open) setShelfQuery('');
  };

  /* Moving a piece lands at once and is put back if the server refuses it. */
  const moveStage = async (id, stage, became) => {
    const note = notes.find(item => String(item?._id) === String(id));
    const before = note?.board || null;
    const change = stageChange(before, stage, became);
    const place = board => {
      setNotes(current => current.map(item => (String(item?._id) === String(id) ? { ...item, board } : item)));
      setEntry(current => (String(current?._id) === String(id) ? { ...current, board } : current));
    };
    place(movedBoard(before, change));
    try {
      const saved = await moveNotebookEntry(id, change);
      if (saved) place(saved);
      clearNotebookCache();
    } catch (_error) {
      place(before);
      setError('That piece did not move. Try again.');
    }
  };

  const nameEntry = async (kind, words) => {
    if (await saveCurrent.current?.() === false) return;
    if (kind === 'concept') {
      const created = await updateConcept(words, {});
      setConcepts(current => [{ ...created, _id: String(created?._id || ''), name: created?.name || words, updatedAt: created?.updatedAt || new Date().toISOString() }, ...current]);
      setSearchParams(targetParams({ kind: 'concept', id: created?.name || words, recordId: String(created?._id || '') }));
    } else {
      const created = await createQuestion({ text: words });
      setQuestions(current => [created, ...current]);
      setSearchParams(targetParams({ kind: 'question', id: String(created._id) }));
    }
  };

  /* A concept or question saved in the page keeps its place in the list. */
  const entrySaved = useCallback(({ kind, record }) => {
    if (!record) return;
    const stamp = { updatedAt: record.updatedAt || new Date().toISOString() };
    if (kind === 'question') setQuestions(current => current.map(row => String(row._id) === String(record._id) ? { ...row, ...record, ...stamp } : row));
    else setConcepts(current => current.map(row => row.name?.toLowerCase() === String(record.name || '').toLowerCase() ? { ...row, _id: String(record._id || row._id), ...stamp } : row));
  }, []);

  /* A renamed concept is the same open page under its new name: the editor
     keeps the key it was opened with, and the URL and list follow the name. */
  const editorKeys = useRef({});
  const editorKey = editorKeys.current[openKey] || openKey;
  const conceptRenamed = useCallback(({ previousName, name }) => {
    const key = `concept:${name}`;
    editorKeys.current[key] = editorKeys.current[`concept:${previousName}`] || `concept:${previousName}`;
    setConcepts(current => current.map(row => (row.name?.toLowerCase() === previousName.toLowerCase() ? { ...row, name } : row)));
    setOpenRecord(current => (current ? { ...current, key, title: name } : current));
    setSearchParams(current => {
      const params = new URLSearchParams(current);
      params.set('concept', name);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const startNote = async ({ mark = null, title = '' } = {}) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setCreationError('');
    try {
      if (await saveCurrent.current?.() === false) return;
      let { data: created } = await api.post('/api/notebook', {
        title, content: '', blocks: [], type: 'note', source: 'think'
      }, getAuthHeaders());
      if (!created?._id) throw new Error('Missing note identity');
      if (mark?._id) {
        // The note exists now; a passage that cannot be quoted into it must not
        // lose it, or the next try leaves a second blank note behind.
        const quoted = await api.post(
          `/api/notebook/${created._id}/append-highlight`, { highlightId: mark._id }, getAuthHeaders()
        ).then(({ data }) => data, () => null);
        if (quoted?._id) created = quoted;
        else setCreationError('The note is open, but the passage could not be quoted into it. Add it from Library.');
      }
      clearNotebookCache();
      setNotes(current => [created, ...current]);
      setEntry(created);
      setFreshId(String(created._id));
      setSearchParams({ tab: 'notebook', entryId: String(created._id) });
    } catch (_error) {
      // The server may have created the note before its reply was lost.
      // Never retry this POST automatically and risk a second blank note.
      clearNotebookCache();
      setCreationError('Could not confirm the new note. Reload Think to check your recent notes before trying again.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };


  const followWriting = async (event, href) => {
    // Preserve ordinary open-in-new-tab behavior. A same-tab departure saves
    // the active note before following either a match or a private return link.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (await saveCurrent.current?.() === false) return;
    navigate(href);
    if (href.startsWith('/think?')) noteSurface.current?.scrollIntoView?.({ block: 'start' });
  };

  /* The route can say only "Think". Once the note arrives, the persistent
     shell can carry the exact object without owning or remounting the editor.
     Other rooms will adopt the same declaration as they are migrated. */
  const partner = openTarget?.kind === 'note'
    ? {
      contextType: 'notebook',
      contextId: entryMatchesRoute ? openId : '',
      contextTitle: entryMatchesRoute ? entry?.title || 'Note' : 'Think'
    }
    : {
      contextType: openTarget?.kind || '',
      contextId: openRecord?.key === openKey && openRecord.record?._id ? String(openRecord.record._id) : '',
      contextTitle: (openRecord?.key === openKey && openRecord.title) || 'Think'
    };

  useDocumentTitle(partner.contextTitle === 'Think' ? '' : partner.contextTitle, 'Think');

  const askPartner = useCallback((selectedText) => {
    const passage = String(selectedText || '').trim();
    if (!passage) return;
    queuePartner({
      id: `${partner.contextType}-selection-${partner.contextId}-${Date.now()}`,
      mode: 'draft',
      prompt: `Work with this exact passage from “${partner.contextTitle}”:\n\n“${passage}”\n\nHelp me sharpen, challenge, or extend it. Ask a clarifying question if my intent is ambiguous.`,
      contextType: partner.contextType,
      contextId: partner.contextId,
      contextTitle: partner.contextTitle
    });
  }, [partner.contextId, partner.contextTitle, partner.contextType, queuePartner]);

  useNoeisAgentSurface('agent-surface.think', {
    room: 'think',
    objectType: partner.contextType || 'notebook',
    objectId: partner.contextId,
    title: partner.contextTitle === 'Think' ? '' : partner.contextTitle,
    orientation: openTarget
      ? 'Unfinished writing. The Partner may retrieve; only you can add what it finds.'
      : 'Open a note and keep the thought moving.'
  }, {
    askPlaceholder: `Ask about this ${openTarget?.kind || 'note'} or selected words`
  }, { onTryWording: partnerTrial });

  const foundInWriting = phrase ? (
    <RoomShelfSection label="Found in your writing">
      <p className="room-shelf__description">Notes and private explorations</p>
      <p role="status" className="room-shelf__description">{searchMessage}</p>
      <RoomShelfList>
        {writingResults.map(item => (
          <li key={`${item.kind}:${item.id}`}>
            <Link to={item.href} title={item.title} onClick={event => followWriting(event, item.href)} className={roomShelfItemClass({ nested: true, className: 'think-notes__continuation' })} data-noeis-item>
              <span className="think-notes__note-title">{item.excerpt === item.title ? <WritingMatch item={item} /> : item.title}</span>
              <span className="think-notes__writing-origin">{item.kind === 'notebook' ? 'Note' : `Private writing · ${item.label}`}{item.pageTitle ? ` · ${item.pageTitle}` : ''}{item.sourceUnavailable ? ' · Recorded context' : item.originMissing ? ' · Earlier passage' : ''}</span>
              {item.excerpt !== item.title ? <span className="think-notes__match-excerpt"><WritingMatch item={item} /></span> : null}
            </Link>
          </li>
        ))}
      </RoomShelfList>
      {found?.limited ? <p className="room-shelf__description">More matches may be available. Add a few words to narrow them.</p> : null}
      <button type="button" className="think-notes__shelf-more" onClick={() => showSearch(false)}>Back to recent work</button>
    </RoomShelfSection>
  ) : null;

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'think-notes__return');

  return (
    <div ref={room} className={`think-notes${activeContext ? ' has-context' : ''}${alternativesOpen ? ' has-alternatives' : ''}${notesCollapsed ? ' notes-collapsed' : ''}`}>
      <div className="think-notes__toggles">
        <button type="button" className="think-notes__shelf-toggle" aria-expanded={!notesCollapsed} aria-controls="think-notes-shelf" onClick={() => setNotesCollapsed(value => !value)}>{notesCollapsed ? 'Show sidebar' : 'Hide sidebar'}</button>
      </div>
      <aside id="think-notes-shelf" hidden={notesCollapsed} className={`think-notes__shelf ${step(1)}`} data-writing-rail="left" inert={contextTakesFocus ? '' : undefined} aria-hidden={contextTakesFocus || undefined}>
        <ThinkBar
          view={view}
          views={views}
          working={working}
          isOpen={item => isTarget(item, openTarget)}
          onView={openView}
          onOpen={openEntry}
          onNew={() => startNote()}
          creating={creating || loading}
          searching={searching}
          query={shelfQuery}
          onQuery={setShelfQuery}
          onSearch={showSearch}
          found={foundInWriting}
        >
          {authoredError ? <p role="status" className="room-shelf__description">{authoredError}</p> : null}
          {authoredWork.length ? (
            <RoomShelfSection label="Your writing" className="think-notes__writing">
              <RoomShelfList>
                {authoredWork.map(item => (
                  <li key={item.id}>
                    <Link to={item.href} title={item.title} onClick={event => followWriting(event, item.href)} className={roomShelfItemClass({ nested: true, className: 'think-notes__continuation' })} data-noeis-item>
                      <span className="think-notes__note-title">{item.title}</span>
                      {item.returnNote ? <span className="think-notes__return-note">{item.returnNote}</span> : null}
                      {item.pageTitle ? <span className="think-notes__writing-origin">From {item.pageTitle}{item.sourceUnavailable ? ' · Recorded context' : item.originMissing ? ' · Earlier passage' : ''}</span> : null}
                    </Link>
                  </li>
                ))}
              </RoomShelfList>
            </RoomShelfSection>
          ) : null}
        </ThinkBar>
        {creationError ? <p role="status" className="room-shelf__description">{creationError}</p> : null}
        <FocusMode inRail />
      </aside>

      <aside className="think-notes__alternatives" hidden={!alternativesOpen || Boolean(activeContext)} aria-label="Wording alternatives">
        <div ref={setAlternativesPortal} />
      </aside>

      <main
        ref={noteSurface}
        className={`think-notes__note${loadingEntry ? ' is-loading' : ''}`}
        aria-labelledby={openTarget ? 'think-note-title' : undefined}
        aria-busy={loadingEntry ? 'true' : undefined}
        inert={contextTakesFocus ? '' : undefined}
        aria-hidden={contextTakesFocus || undefined}
      >
        {openTarget && openTarget.kind !== 'note' ? (
          <div className={step(2)}>
            <ThinkEntryEditor
              key={editorKey}
              target={openTarget}
              startPull={pullKey === openKey}
              onAsk={askPartner}
              onLoaded={loaded => setOpenRecord({ ...loaded, key: openKey })}
              onSaved={entrySaved}
              onRenamed={conceptRenamed}
              onRegisterSave={registerSave}
            />
          </div>
        ) : entryMatchesRoute ? (
          <div className={step(2)}>
            <NotebookEditor
              entry={entry}
              stage={stageOf(entry.board)}
              stageControl={<NoteStage board={entry.board} onMove={(stage, became) => moveStage(entry._id, stage, became)} />}
              metaId="think-note-title"
              startPull={pullKey === openKey}
              saving={saving}
              error={error}
              onSave={saveEntry}
              onRegisterSave={registerSave}
              startWriting={freshId === openId}
              onInvokeAgentSkill={queuePartner}
              agentContextType="notebook"
              agentContextId={openId}
              agentContextTitle={entry.title || 'Note'}
              activeContext={activeContext}
              onOpenContext={openContext}
              contextPortal={contextPortal}
              alternativesPortal={alternativesPortal}
              onAlternativesOpenChange={setAlternativesOpen}
              onFocusAlternatives={focusAlternatives}
              onWorkingStateChange={(workingState) => {
                setEntry(current => current ? { ...current, workingState } : current);
                setNotes(current => current.map(item => String(item?._id) === openId ? { ...item, workingState } : item));
              }}
              onRegisterPartnerTrial={registerPartnerTrial}
              onSourceCorrectionSettled={(result) => {
                if (result?.entry) setEntry(result.entry);
                else if (result?.sourceCorrection) {
                  setEntry((current) => (current ? { ...current, sourceCorrection: result.sourceCorrection } : current));
                }
              }}
            />
          </div>
        ) : openTarget ? (
          <p className="think-notes__quiet" role="status">{error || 'Opening the note…'}</p>
        ) : loading || error ? (
          <p className="think-notes__quiet" role="status">{error || 'Opening Think…'}</p>
        ) : view === 'cuttings' ? (
          <div className={step(2)}><NotebookCuttings onOpen={id => openEntry({ kind: 'note', id })} /></div>
        ) : view !== 'home' ? (
          <div className={step(2)}><ThinkIndex key={view} view={thinkView(view)} items={viewEntries} onOpen={openEntry} onName={nameEntry} /></div>
        ) : (
          <div className={step(2)}>
            <ThinkDesk
              working={working}
              ideas={piecesIn('ideas')}
              closed={piecesIn('closed')}
              onOpen={openEntry}
              onView={openView}
              onStart={title => startNote({ title })}
              creating={creating}
            >
              {!notes.length && lastMark ? (
                <section className="think-notes__last-mark" aria-label="Your last mark">
                  <p className="think-notes__quiet">Your last mark{lastMark.articleTitle ? `, from ${lastMark.articleTitle}` : ''}</p>
                  <blockquote>{lastMark.text}</blockquote>
                  {lastMark.note ? <p className="think-notes__last-thought">You wrote: {lastMark.note}</p> : null}
                  <Button variant="primary" onClick={() => startNote({ mark: lastMark })} disabled={creating}>Think with it</Button>
                </section>
              ) : null}
            </ThinkDesk>
          </div>
        )}
      </main>

      <aside
        ref={drawer}
        role={contextTakesFocus ? 'dialog' : undefined}
        aria-modal={contextTakesFocus || undefined}
        className="think-notes__partner"
        aria-label="Note context"
        hidden={!activeContext}
      >
        <div className="think-notes__context-head">
          <div role="tablist" aria-label="Note context">
            <button type="button" role="tab" aria-selected={activeContext === 'scratchpad'} onClick={() => openContext('scratchpad')}>Scratchpad</button>
            <button type="button" role="tab" aria-selected={activeContext === 'material'} onClick={() => openContext('material')}>Material</button>
          </div>
          <button type="button" className="think-notes__context-close" onClick={closeContext} aria-label="Close note context">Close</button>
        </div>
        <div ref={setContextPortal} hidden={!['material', 'scratchpad'].includes(activeContext)} />
      </aside>
    </div>
  );
};

export default ThinkNotes;
