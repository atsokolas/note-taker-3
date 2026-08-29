import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearNotebookCache, getNotebookShelf } from '../api/notebook';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection
} from '../components/collection/RoomShelf';
import { takeFirstPaint } from '../motion/columnMotion';
import { useNoeisSurface } from '../surface/NoeisSurfaceContext';
import {
  buildNoteShelf,
  editedLine,
  readRecentNoteIds,
  resolveOpenNoteId
} from './thinkNotesModel';
import '../styles/think-notes.css';

// Think.
//
// Opening Think opens the note you were last in. Not a home of Concepts,
// Questions and Notebook with the writing behind them — the writing, with the
// other notes faint beside it. The agent fetches into the note from the rail;
// the note only changes when the human accepts what came back.

const FETCH_QUESTION = 'Find a source in my library worth pulling into this note. Answer in one sentence.';

const ThinkNotes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('entryId') || '';
  const [notes, setNotes] = useState([]);
  const [openId, setOpenId] = useState('');
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shelfQuery, setShelfQuery] = useState('');
  const [shelfExpanded, setShelfExpanded] = useState(false);
  const [queuedPrompt, setQueuedPrompt] = useState(null);
  const arriving = useMemo(() => takeFirstPaint('think-notes'), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await getNotebookShelf();
        if (cancelled) return;
        const list = Array.isArray(summaries) ? summaries : [];
        setNotes(list);
        setOpenId(resolveOpenNoteId({ requestedId, notes: list, recentIds: readRecentNoteIds() }));
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open your notes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // The shelf is read once; opening a note is handled below without refetching it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // An explicit ?entryId is a request, and it wins whenever it changes.
  useEffect(() => {
    if (!requestedId || requestedId === openId) return;
    setOpenId(requestedId);
  }, [openId, requestedId]);

  useEffect(() => {
    if (!openId) return undefined;
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
  }, [openId]);

  // The open note is reflected in the URL so a reload, a share, or a back
  // button all land on the same note the human is looking at.
  useEffect(() => {
    if (!openId || searchParams.get('entryId') === openId) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'notebook');
    params.set('entryId', openId);
    setSearchParams(params, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const shelf = useMemo(() => buildNoteShelf({
    notes,
    openId,
    query: shelfQuery,
    expanded: shelfExpanded
  }), [notes, openId, shelfExpanded, shelfQuery]);
  const hasMoreNotes = !shelfExpanded && !shelfQuery.trim() && notes.length > shelf.length;
  const entryMatchesRoute = Boolean(
    entry?._id
    && openId
    && String(entry._id) === String(openId)
  );
  const noteContextText = useMemo(() => {
    const blocks = Array.isArray(entry?.blocks)
      ? entry.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return blocks || String(entry?.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }, [entry]);

  const saveEntry = useCallback(async (payload) => {
    if (!payload?.id) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/api/notebook/${payload.id}`, payload, getAuthHeaders());
      setEntry(res.data || null);
      setNotes(current => current.map(item => (
        String(item?._id) === String(payload.id) ? { ...item, ...res.data } : item
      )));
      clearNotebookCache();
      return res.data;
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'Failed to save note.');
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, []);

  const openThinkView = useCallback((tab) => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    setSearchParams(params);
  }, [setSearchParams]);

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
        count={notes.length}
        search={shelfQuery}
        searchLabel="Find a note"
        searchPlaceholder="Find a note"
        onSearchChange={setShelfQuery}
      >
        <RoomShelfList className="think-notes__spaces">
          <li>
            <RoomShelfButton active onClick={() => openThinkView('notebook')}>
              <span>Notebook</span>
              <RoomShelfMeta>{notes.length}</RoomShelfMeta>
            </RoomShelfButton>
          </li>
          <li><RoomShelfButton onClick={() => openThinkView('concepts')}><span>Concepts</span></RoomShelfButton></li>
          <li><RoomShelfButton onClick={() => openThinkView('questions')}><span>Questions</span></RoomShelfButton></li>
        </RoomShelfList>
        <RoomShelfSection label="Recent notes">
          <RoomShelfList>
            {shelf.map(item => (
              <li key={item.id}>
                <RoomShelfButton
                  active={item.isOpen}
                  nested
                  onClick={() => setOpenId(item.id)}
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
      </RoomShelf>

      <main
        className={`think-notes__note${loadingEntry ? ' is-loading' : ''}`}
        aria-labelledby="think-note-title"
        aria-busy={loadingEntry ? 'true' : undefined}
      >
        {entryMatchesRoute ? (
          <div className={step(2)}>
            <NotebookEditor
              entry={entry}
              metaLine={editedLine(entry)}
              metaId="think-note-title"
              saving={saving}
              error={error}
              onSave={saveEntry}
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
              : error || 'No notes yet. The first one starts the moment you write a line.'}
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
