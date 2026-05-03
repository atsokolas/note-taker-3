import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui';
import {
  addWikiSource,
  draftWikiPage,
  getWikiPage,
  removeWikiSource,
  updateWikiPage
} from '../../api/wiki';
import WikiAiSourcePanel from './WikiAiSourcePanel';
import WikiPageMetaBar from './WikiPageMetaBar';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const WikiPageEditor = ({ pageId }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [drafting, setDrafting] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  const latestPageRef = useRef(null);
  const draftTriggeredRef = useRef(false);

  const savePage = async (updates) => {
    setSaveStatus('saving');
    setError('');
    try {
      const saved = await updateWikiPage(pageId, updates);
      latestPageRef.current = saved;
      setPage(saved);
      setSaveStatus('saved');
    } catch (_error) {
      setError('Failed to save Wiki page.');
      setSaveStatus('failed');
    } finally {
    }
  };

  const scheduleSave = (updates) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('dirty');
    saveTimer.current = setTimeout(() => {
      savePage(updates);
    }, 650);
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write the page. Use the AI/source panel for support.' })
    ],
    content: emptyDoc,
    editorProps: {
      attributes: {
        class: 'tiptap-editor wiki-editor__body'
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      scheduleSave({ body: activeEditor.getJSON() });
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
        editor?.commands?.setContent(loaded.body || emptyDoc, false);
      } catch (_error) {
        if (!cancelled) setError('Failed to load Wiki page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (editor) load();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editor, pageId]);

  const handleTitleChange = (event) => {
    const title = event.target.value;
    setPage(current => ({ ...(current || latestPageRef.current), title }));
    scheduleSave({ title });
  };

  const handleMetaChange = (updates) => {
    setPage(current => ({ ...(current || latestPageRef.current), ...updates }));
    savePage(updates);
  };

  const handleDraft = async () => {
      setDrafting(true);
      setError('');
      setPage(current => current ? ({
        ...current,
        aiState: {
          ...(current.aiState || {}),
          draftStatus: 'drafting',
          draftRequestedAt: new Date().toISOString()
        }
      }) : current);
      try {
        const drafted = await draftWikiPage(pageId);
        latestPageRef.current = drafted;
        setPage(drafted);
        editor?.commands?.setContent(drafted.body || emptyDoc, false);
    } catch (_error) {
      setError('Failed to draft Wiki page.');
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    if (!page || draftTriggeredRef.current || searchParams.get('draft') !== '1') return;
    draftTriggeredRef.current = true;
    handleDraft().finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('draft');
      setSearchParams(next, { replace: true });
    });
    // handleDraft intentionally omitted so the URL flag triggers once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchParams, setSearchParams]);

  const handleAddSource = async (source) => {
    setError('');
    try {
      const updated = await addWikiSource(pageId, source);
      latestPageRef.current = updated;
      setPage(updated);
    } catch (_error) {
      setError('Failed to attach source.');
    }
  };

  const handleRemoveSource = async (sourceRefId) => {
    setError('');
    try {
      const updated = await removeWikiSource(pageId, sourceRefId);
      latestPageRef.current = updated;
      setPage(updated);
    } catch (_error) {
      setError('Failed to remove source.');
    }
  };

  const handleApplySuggestion = (suggestion) => {
    const text = String(suggestion?.text || '').trim();
    if (!text || !editor) return;
    editor.commands?.insertContent?.({
      type: 'paragraph',
      content: [{ type: 'text', text }]
    });
    const body = editor.getJSON ? editor.getJSON() : null;
    if (body) savePage({ body });
  };

  if (loading) {
    return <main className="wiki-page"><p className="wiki-index__status">Loading Wiki page...</p></main>;
  }

  if (!page) {
    return (
      <main className="wiki-page">
        <div className="wiki-index__error" role="alert">{error || 'Wiki page not found.'}</div>
      </main>
    );
  }

  return (
    <main className="wiki-page wiki-editor">
      <div className="wiki-editor__topline">
        <Button type="button" variant="secondary" onClick={() => navigate('/wiki')}>Back to Wiki</Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSourcePanelOpen(open => !open)}
          aria-expanded={sourcePanelOpen}
          aria-controls="wiki-source-panel"
        >
          {sourcePanelOpen ? 'Hide AI/Sources' : 'Show AI/Sources'}
        </Button>
        {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
      </div>
      <div className={`wiki-editor__layout ${sourcePanelOpen ? '' : 'wiki-editor__layout--panel-collapsed'}`}>
        <section className="wiki-editor__main" aria-label="Wiki page editor">
          <input
            className="wiki-editor__title"
            value={page.title || ''}
            onChange={handleTitleChange}
            placeholder="Untitled Wiki Page"
            aria-label="Wiki page title"
          />
          <WikiPageMetaBar page={page} onChange={handleMetaChange} saveStatus={saveStatus} />
          <EditorContent editor={editor} />
        </section>
        {sourcePanelOpen ? (
          <WikiAiSourcePanel
            id="wiki-source-panel"
            page={page}
            drafting={drafting}
            onDraft={handleDraft}
            onAddSource={handleAddSource}
            onRemoveSource={handleRemoveSource}
            onApplySuggestion={handleApplySuggestion}
          />
        ) : null}
      </div>
    </main>
  );
};

export default WikiPageEditor;
