import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { clearNotebookCache, getNotebookSummaries } from '../api/notebook';
import { chatWithAgent } from '../api/agent';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import { useAgentRail, useAgentRailSurface } from '../agent/AgentRailContext';
import { takeFirstPaint } from '../motion/columnMotion';
import { oneSentence } from './judgmentModel';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { ask } = useAgentRail();
  const arriving = useMemo(() => takeFirstPaint('think-notes'), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summaries = await getNotebookSummaries();
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
    (async () => {
      try {
        const res = await api.get(`/api/notebook/${openId}`, getAuthHeaders());
        if (!cancelled) setEntry(res.data || null);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open that note.');
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

  const shelf = useMemo(() => buildNoteShelf({ notes, openId }), [notes, openId]);

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
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  }, []);

  /* Accepting a fetched line appends it to the note as a new block. It appends:
     nothing already written is rewritten by something the agent found. */
  const appendLine = useCallback(async (proposal) => {
    if (!entry?._id) return;
    const blocks = [
      ...(Array.isArray(entry.blocks) ? entry.blocks : []),
      { type: 'paragraph', text: proposal.body }
    ];
    await saveEntry({
      id: entry._id,
      title: entry.title || 'Untitled note',
      content: `${entry.content || ''}<p>${proposal.body}</p>`,
      blocks,
      type: entry.type || 'note',
      tags: entry.tags || [],
      claimId: entry.claimId || null,
      linkedArticleId: entry.linkedArticleId || null
    });
  }, [entry, saveEntry]);

  useAgentRailSurface(
    {
      id: openId ? `think:${openId}` : 'think',
      subject: entry?.title || (loading ? '' : 'Your notes.'),
      empty: 'Nothing to retrieve until you ask.'
    },
    {
      onAsk: async (question) => {
        const result = await chatWithAgent({
          message: question,
          context: { type: 'notebook', id: openId, title: entry?.title || 'Note' }
        });
        const sentence = oneSentence(String(result?.reply || result?.message || result?.answer || ''));
        if (!sentence) return null;
        return {
          id: `think-ask:${sentence.slice(0, 32)}`,
          sentence,
          body: sentence,
          origin: 'Asked of this note',
          fields: ['append']
        };
      },
      onAccept: appendLine
    }
  );

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'think-notes__return');

  return (
    <div className="think-notes">
      <aside className={`think-notes__shelf ${step(1)}`} aria-label="Your notes">
        {/* The lock points it back the way every other return does. */}
        <p className="think-notes__shelf-eyebrow">← All notes</p>
        <ul>
          {shelf.map(item => (
            <li key={item.id}>
              <button
                type="button"
                className={item.isOpen ? 'is-open' : ''}
                aria-current={item.isOpen ? 'true' : undefined}
                onClick={() => setOpenId(item.id)}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="think-notes__note" aria-labelledby="think-note-title">
        {entry ? (
          <div className={step(2)}>
            <p className="think-notes__edited" id="think-note-title">{editedLine(entry)}</p>
            <NotebookEditor
              entry={entry}
              saving={saving}
              error={error}
              onSave={saveEntry}
              showInlineAgentDock={false}
              agentContextType="notebook"
              agentContextId={openId}
              agentContextTitle={entry.title || 'Note'}
            />
            {/* The door is a line of text in the column; the fetching happens
                in the rail, and the note changes only on Accept. */}
            <button
              type="button"
              className="think-notes__door"
              onClick={() => ask?.(FETCH_QUESTION, { fields: ['append'], origin: 'Asked of this note' })}
            >
              Ask the agent to fetch a source into this note
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
    </div>
  );
};

export default ThinkNotes;
