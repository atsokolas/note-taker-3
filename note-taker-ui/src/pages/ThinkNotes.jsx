import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import authoredExplorations from '../api/authoredExplorations';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearNotebookCache, getNotebookShelf } from '../api/notebook';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
  roomShelfItemClass
} from '../components/collection/RoomShelf';
import { takeFirstPaint } from '../motion/columnMotion';
import { useNoeisSurface } from '../surface/NoeisSurfaceContext';
import {
  buildNoteShelf,
  buildWritingResults,
  buildAuthoredShelf,
  editedLine,
  readRecentNoteIds,
  resolveOpenNoteId
} from './thinkNotesModel';
import '../styles/think-notes.css';
import { plainTextFrom } from '../utils/editorialText';

// Think.
//
// Opening Think opens the note you were last in. Not a home of Concepts,
// Questions and Notebook with the writing behind them — the writing, with the
// other notes faint beside it. The agent fetches into the note from the rail;
// the note only changes when the human accepts what came back.

const FETCH_QUESTION = 'Find a source in my library worth pulling into this note. Answer in one sentence.';

const WritingMatch = ({ item }) => {
  const text = item.excerpt || '';
  const start = Math.max(0, Math.min(text.length, item.matchStart || 0));
  const end = Math.min(text.length, start + (item.matchLength || 0));
  return <>{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</>;
};

const ThinkNotes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('entryId') || '';
  const [notes, setNotes] = useState([]);
  const [initialId, setInitialId] = useState('');
  const openId = requestedId || initialId;
  const activeId = useRef(openId);
  activeId.current = openId;
  const saveCurrent = useRef(null);
  const searchInput = useRef(null);
  const noteSurface = useRef(null);
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
  const [shelfExpanded, setShelfExpanded] = useState(false);
  const [queuedPrompt, setQueuedPrompt] = useState(null);
  const [authoredWork, setAuthoredWork] = useState([]);
  const [authoredError, setAuthoredError] = useState('');
  const arriving = useMemo(() => takeFirstPaint('think-notes'), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await getNotebookShelf();
        if (cancelled) return;
        const list = Array.isArray(summaries) ? summaries : [];
        setNotes(list);
        setInitialId(resolveOpenNoteId({ notes: list, recentIds: readRecentNoteIds() }));
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open your notes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // The shelf is read once; opening a note is handled below without refetching it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The open note is reflected in the URL so a reload, a share, or a back
  // button all land on the same note the human is looking at.
  useEffect(() => {
    if (!openId || requestedId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'notebook');
    params.set('entryId', openId);
    setSearchParams(params, { replace: true });
  }, [openId, requestedId, searchParams, setSearchParams]);

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

  const shelf = useMemo(() => buildNoteShelf({
    notes,
    openId,
    expanded: shelfExpanded
  }), [notes, openId, shelfExpanded]);
  const hasMoreNotes = !shelfExpanded && notes.length > shelf.length;
  const entryMatchesRoute = Boolean(
    entry?._id
    && openId
    && String(entry._id) === String(openId)
  );
  const noteContextText = useMemo(() => {
    const blocks = Array.isArray(entry?.blocks)
      ? entry.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return blocks || plainTextFrom(entry?.content);
  }, [entry]);

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

  const openNote = async (id) => {
    if (await saveCurrent.current?.() === false) return;
    setSearchParams({ tab: 'notebook', entryId: id });
  };

  const startNote = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setCreationError('');
    try {
      if (await saveCurrent.current?.() === false) return;
      const { data: created } = await api.post('/api/notebook', {
        title: '', content: '', blocks: [], type: 'note', source: 'think'
      }, getAuthHeaders());
      if (!created?._id) throw new Error('Missing note identity');
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

  const openThinkView = async (tab) => {
    if (await saveCurrent.current?.() === false) return;
    setSearchParams({ tab });
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
  useNoeisSurface({
    room: 'think',
    objectType: 'notebook',
    objectId: openId,
    title: entry?.title || '',
    orientation: entry
      ? 'An unfinished note. The agent may retrieve; only you can add what it finds.'
      : 'Open a note and keep the thought moving.'
  });

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'think-notes__return');

  return (
    <div className="think-notes">
      <RoomShelf
        className={`think-notes__shelf ${step(1)}`}
        aria-label="Think navigation"
        data-writing-rail="left"
        data-writing-rail-label="Notes"
        label="Think"
        count={loading ? undefined : notes.length}
        search={shelfQuery}
        searchLabel="Find your writing"
        searchPlaceholder="A phrase you remember…"
        searchMaxLength={160}
        searchInputRef={searchInput}
        onSearchKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setShelfQuery(''); } }}
        onSearchChange={setShelfQuery}
      >
        <RoomShelfList className="think-notes__spaces">
          <li>
            <RoomShelfButton active onClick={() => openThinkView('notebook')}>
              <span>Notebook</span>
              {!loading ? <RoomShelfMeta>{notes.length}</RoomShelfMeta> : null}
            </RoomShelfButton>
          </li>
          <li><RoomShelfButton onClick={() => openThinkView('concepts')}><span>Concepts</span></RoomShelfButton></li>
          <li><RoomShelfButton onClick={() => openThinkView('questions')}><span>Questions</span></RoomShelfButton></li>
        </RoomShelfList>
        {phrase ? (
          <RoomShelfSection label="Found in your writing">
            <p className="room-shelf__description">Notes and private explorations</p>
            <p role="status" className="room-shelf__description">{searchMessage}</p>
            <RoomShelfList>
              {writingResults.map(item => (
                <li key={`${item.kind}:${item.id}`}>
                  <Link to={item.href} onClick={event => followWriting(event, item.href)} className={roomShelfItemClass({ nested: true, className: 'think-notes__continuation' })}>
                    <span>{item.excerpt === item.title ? <WritingMatch item={item} /> : item.title}</span>
                    <span className="think-notes__writing-origin">{item.kind === 'notebook' ? 'Note' : `Private writing · ${item.label}`}{item.pageTitle ? ` · ${item.pageTitle}` : ''}{item.sourceUnavailable ? ' · Recorded context' : item.originMissing ? ' · Earlier passage' : ''}</span>
                    {item.excerpt !== item.title ? <span className="think-notes__match-excerpt"><WritingMatch item={item} /></span> : null}
                  </Link>
                </li>
              ))}
            </RoomShelfList>
            {found?.limited ? <p className="room-shelf__description">More matches may be available. Add a few words to narrow them.</p> : null}
            <button type="button" className="think-notes__shelf-more" onClick={() => setShelfQuery('')}>Back to recent work</button>
          </RoomShelfSection>
        ) : <>
        {authoredError ? <p role="status" className="room-shelf__description">{authoredError}</p> : null}
        {authoredWork.length ? (
          <RoomShelfSection label="Your writing" className="think-notes__writing">
            <RoomShelfList>
              {authoredWork.map(item => (
                <li key={item.id}>
                  <Link to={item.href} onClick={event => followWriting(event, item.href)} className={roomShelfItemClass({ nested: true, className: 'think-notes__continuation' })}>
                    <span>{item.title}</span>
                    {item.returnNote ? <span className="think-notes__return-note">{item.returnNote}</span> : null}
                    {item.pageTitle ? <span className="think-notes__writing-origin">From {item.pageTitle}{item.sourceUnavailable ? ' · Recorded context' : item.originMissing ? ' · Earlier passage' : ''}</span> : null}
                  </Link>
                </li>
              ))}
            </RoomShelfList>
          </RoomShelfSection>
        ) : null}
        <RoomShelfSection label="Recent notes">
          <RoomShelfList>
            {shelf.map(item => (
              <li key={item.id}>
                <RoomShelfButton
                  active={item.isOpen}
                  nested
                  onClick={() => openNote(item.id)}
                >
                  <span>{item.title}</span>
                </RoomShelfButton>
              </li>
            ))}
          </RoomShelfList>
          {hasMoreNotes ? (
            <button
              type="button"
              className="think-notes__shelf-more"
              onClick={() => setShelfExpanded(true)}
            >
              Show all recent notes
            </button>
          ) : null}
        </RoomShelfSection>
        </>}
      </RoomShelf>

      <main
        ref={noteSurface}
        className={`think-notes__note${loadingEntry ? ' is-loading' : ''}`}
        aria-labelledby="think-note-title"
        aria-busy={loadingEntry ? 'true' : undefined}
      >
        <div className="think-notes__start">
          <button type="button" onClick={startNote} disabled={creating || loading || loadingEntry}>
            {creating ? 'Opening a new note…' : 'Start a note'}
          </button>
          <button type="button" className="think-notes__find" onClick={() => {
            searchInput.current?.focus({ preventScroll: true });
            searchInput.current?.scrollIntoView?.({ block: 'center' });
          }}>Find writing</button>
          {creationError ? <p role="status">{creationError}</p> : null}
        </div>
        {entryMatchesRoute ? (
          <div className={step(2)}>
            <NotebookEditor
              entry={entry}
              metaLine={editedLine(entry)}
              metaId="think-note-title"
              saving={saving}
              error={error}
              onSave={saveEntry}
              onRegisterSave={registerSave}
              startWriting={freshId === openId}
              onInvokeAgentSkill={setQueuedPrompt}
              showInlineAgentDock={false}
              agentContextType="notebook"
              agentContextId={openId}
              agentContextTitle={entry.title || 'Note'}
            />
            {/* A quiet shortcut into the same partner beside the document. */}
            <button
              type="button"
              className="think-notes__door"
              onClick={() => setQueuedPrompt({
                id: `note-source:${openId}:${Date.now()}`,
                prompt: FETCH_QUESTION,
                contextType: 'notebook',
                contextId: openId
              })}
            >
              Ask the thought partner to find a source
            </button>
          </div>
        ) : (
          <p className={`think-notes__quiet ${step(2)}`} role="status">
            {loading
              ? 'Opening your last note…'
              : error || 'A thought does not need a source to begin. Start a note and see where it takes you.'}
          </p>
        )}
      </main>

      <aside
        className={`think-notes__partner ${step(3)}`}
        aria-label="Thought partner"
        data-writing-rail="right"
        data-writing-rail-label="Partner"
      >
        <ThoughtPartnerPanel
          variant="stream"
          contextType="notebook"
          contextId={entryMatchesRoute ? openId : ''}
          contextTitle={entryMatchesRoute ? entry?.title || 'Note' : 'Think'}
          contextMetadata={entryMatchesRoute ? { primaryText: noteContextText } : null}
          queuedPrompt={queuedPrompt}
          title="Thought partner"
          subtitle="Working beside this note"
          placeholder="Challenge, connect, or develop this thought…"
          promptTemplates={[
            'Find a source that changes this note.',
            'What is still unresolved on this page?',
            'Challenge the weakest assumption on this page.'
          ]}
          passiveStatusText="Keep writing. I will stay quiet until you ask me to connect, challenge, or develop the page."
          emptyStateText="Ask when you want another mind in the room."
          submitLabel="↗"
        />
      </aside>
    </div>
  );
};

export default ThinkNotes;
