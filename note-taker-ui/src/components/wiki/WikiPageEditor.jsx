import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { draftWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';
import WikiAiSourcePanel from './WikiAiSourcePanel';
import WikiPageMetaBar from './WikiPageMetaBar';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const WikiPageEditor = ({ pageId }) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  const latestPageRef = useRef(null);

  const savePage = async (updates) => {
    setSaving(true);
    setError('');
    try {
      const saved = await updateWikiPage(pageId, updates);
      latestPageRef.current = saved;
      setPage(saved);
    } catch (_error) {
      setError('Failed to save Wiki page.');
    } finally {
      setSaving(false);
    }
  };

  const scheduleSave = (updates) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
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
        {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
      </div>
      <div className="wiki-editor__layout">
        <section className="wiki-editor__main" aria-label="Wiki page editor">
          <input
            className="wiki-editor__title"
            value={page.title || ''}
            onChange={handleTitleChange}
            placeholder="Untitled Wiki Page"
            aria-label="Wiki page title"
          />
          <WikiPageMetaBar page={page} onChange={handleMetaChange} saving={saving} />
          <EditorContent editor={editor} />
        </section>
        <WikiAiSourcePanel page={page} drafting={drafting} onDraft={handleDraft} />
      </div>
    </main>
  );
};

export default WikiPageEditor;
