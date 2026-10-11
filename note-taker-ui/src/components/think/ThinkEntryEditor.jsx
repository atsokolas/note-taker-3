import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import EditorDraftShell from './editor/EditorDraftShell';
import useSlashCommands from './editor/useSlashCommands';
import { passageSlashItems } from './editor/slashCommands';
import { BlockIdExtension, EntryBar, HighlightRefNode, passageContent } from './editor/writingParts';
import InsertHighlightModal from './notebook/InsertHighlightModal';
import ConceptShareModal from './concepts/ConceptShareModal';
import QuestionShareModal from './questions/QuestionShareModal';
import { QuietButton } from '../ui';
import useHighlights from '../../hooks/useHighlights';
import { getConcept, getConceptIdeaWorkbench, updateConcept, updateConceptIdeaWorkbench } from '../../api/concepts';
import { getConceptQuestions, getQuestion, updateQuestion } from '../../api/questions';
import { buildDocFromBlocks } from '../../utils/notebookBlocks';
import { buildCanonicalArticlePath } from '../../utils/sourceRoutes';
import { begunLine, countWords, questionBlocksFromDoc } from '../../pages/thinkNotesModel';
import '../../styles/think-writing.css';

// A concept or a question, open in the same shell as a note: title, writing,
// and the few facts that belong to its kind in the margin. The records stay
// what they are on the server — a concept's writing is its working draft, a
// question's writing is its blocks — only the page is shared.

const SAVE_DELAY_MS = 850;

const loadConcept = async (id) => {
  const concept = await getConcept(id);
  const [workbench, questions] = await Promise.all([
    concept?._id ? getConceptIdeaWorkbench(concept._id).catch(() => null) : null,
    getConceptQuestions(concept?.name || id).catch(() => [])
  ]);
  return {
    kind: 'concept',
    record: concept,
    workbench: workbench?.ideaWorkbench || null,
    revision: Number(workbench?.revision || 0),
    questions,
    title: concept?.name || id,
    body: workbench?.ideaWorkbench?.hypothesis?.html || '<p></p>'
  };
};

const loadQuestion = async (id) => {
  const question = await getQuestion(id);
  return {
    kind: 'question',
    record: question,
    title: question?.text || '',
    body: question?.blocks?.length ? buildDocFromBlocks(question.blocks) : '<p></p>'
  };
};

const ConceptFacts = ({ entry }) => {
  const passages = entry.record?.pinnedHighlights || [];
  const description = String(entry.record?.description || '').trim();
  return (description || passages.length || entry.questions?.length) ? (
    <dl className="think-entry-facts">
      {description ? <div><dt>What it explains</dt><dd>{description}</dd></div> : null}
      {passages.length ? (
        <div>
          <dt>Passages</dt>
          {passages.slice(0, 5).map(passage => (
            <dd key={passage._id}>
              <Link to={buildCanonicalArticlePath(passage.articleId)}>{passage.articleTitle || 'Source'}</Link>
            </dd>
          ))}
        </div>
      ) : null}
      {entry.questions?.length ? (
        <div>
          <dt>Open questions</dt>
          {entry.questions.slice(0, 4).map(question => (
            <dd key={question._id}><Link to={`/think?tab=questions&questionId=${encodeURIComponent(question._id)}`}>{question.text}</Link></dd>
          ))}
        </div>
      ) : null}
    </dl>
  ) : null;
};

const QuestionFacts = ({ entry, onSettle }) => {
  const question = entry.record || {};
  const concept = question.conceptName || question.linkedTagName;
  const settled = question.status === 'answered';
  return (
    <dl className="think-entry-facts">
      <div>
        <dt>{settled ? 'Settled' : 'Open'}</dt>
        <dd><button type="button" className="think-entry-facts__act" onClick={() => onSettle(settled ? 'open' : 'answered')}>{settled ? 'Reopen' : 'Mark settled'}</button></dd>
      </div>
      {question.settledBy ? <div><dt>Settled by</dt><dd>{question.settledBy}</dd></div> : null}
      {concept ? <div><dt>Concept</dt><dd><Link to={`/think?tab=concepts&concept=${encodeURIComponent(concept)}`}>{concept}</Link></dd></div> : null}
    </dl>
  );
};

const ThinkEntryEditor = ({
  target,
  startPull = false,
  partnerOpen = false,
  onPartner,
  onAsk,
  onLoaded,
  onSaved,
  onRegisterSave
}) => {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [savedAt, setSavedAt] = useState(null);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tick, setTick] = useState(0);
  const surfaceRef = useRef(null);
  const timerRef = useRef(null);
  const dirtyRef = useRef(false);
  const entryRef = useRef(null);
  const titleRef = useRef('');
  entryRef.current = entry;
  titleRef.current = title;
  const { highlights, highlightMap } = useHighlights();
  const lookupRef = useRef(() => null);
  const slashKeyRef = useRef(() => false);
  lookupRef.current = (id) => highlightMap.get(String(id));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start writing…', showOnlyWhenEditable: false }),
      BlockIdExtension,
      HighlightRefNode.configure({ getHighlightById: (id) => lookupRef.current(id) })
    ],
    content: '<p></p>',
    editorProps: {
      attributes: { class: 'think-notebook-editor-body', 'aria-label': 'Writing' },
      handleKeyDown: (view, event) => slashKeyRef.current(view, event) || false
    }
  });

  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setError('');
    (target.kind === 'concept' ? loadConcept(target.id) : loadQuestion(target.id)).then(loaded => {
      if (cancelled) return;
      setEntry(loaded);
      setTitle(loaded.title);
      setSavedAt(loaded.record?.updatedAt || null);
      setSaveState('saved');
      dirtyRef.current = false;
      onLoaded?.(loaded);
    }).catch(loadError => {
      if (!cancelled) setError(loadError?.response?.data?.error || `Could not open that ${target.kind}.`);
    });
    return () => { cancelled = true; };
  }, [target.kind, target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editor && entry) editor.commands.setContent(entry.body, false);
  }, [editor, entry?.record?._id, entry?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    const current = entryRef.current;
    if (!dirtyRef.current || !current || !editor) return true;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      if (current.kind === 'question') {
        const record = await updateQuestion(current.record._id, {
          text: titleRef.current.trim() || current.record.text,
          blocks: questionBlocksFromDoc(editor.getJSON(), current.record.blocks)
        });
        setEntry(previous => ({ ...previous, record: { ...previous.record, ...record } }));
        setSavedAt(record?.updatedAt || new Date().toISOString());
        onSaved?.({ kind: 'question', record });
      } else {
        let { record, revision, workbench } = current;
        if (!record?._id) record = { ...record, ...(await updateConcept(record?.name || current.title, {})) };
        const saved = await updateConceptIdeaWorkbench(record._id, {
          ...(workbench || {}),
          hypothesis: { ...(workbench?.hypothesis || {}), html: editor.getHTML() }
        }, { baseRevision: revision });
        setEntry(previous => ({ ...previous, record, revision: saved.revision, workbench: saved.ideaWorkbench }));
        setSavedAt(new Date().toISOString());
        onSaved?.({ kind: 'concept', record });
      }
      setSaveState('saved');
      return true;
    } catch (saveError) {
      dirtyRef.current = true;
      setSaveState('error');
      setError(saveError?.response?.status === 409
        ? 'This concept changed in another window. Reload to see the newer draft before writing more.'
        : saveError?.response?.data?.error || 'That did not save.');
      return false;
    }
  }, [editor, onSaved]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('saving');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(save, SAVE_DELAY_MS);
  }, [save]);

  useEffect(() => {
    if (!editor) return undefined;
    const onUpdate = ({ transaction }) => {
      setTick(value => value + 1);
      if (transaction?.docChanged && entryRef.current) schedule();
    };
    editor.on('update', onUpdate);
    return () => editor.off('update', onUpdate);
  }, [editor, schedule]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    onRegisterSave?.(() => saveRef.current());
    return () => onRegisterSave?.(null);
  }, [onRegisterSave]);
  useEffect(() => () => { saveRef.current(); }, []);

  useEffect(() => {
    if (startPull && entry) setPicking(true);
  }, [startPull, entry]);

  const insertPassage = useCallback((highlight) => {
    editor?.chain().focus().insertContent(passageContent(highlight)).run();
  }, [editor]);

  const slashCommands = useSlashCommands({
    editor,
    variant: 'full',
    containerRef: surfaceRef,
    queryItems: (query) => passageSlashItems(highlights, query, insertPassage)
  });
  slashKeyRef.current = slashCommands.onKeyDown;

  const words = useMemo(() => countWords(editor?.getText?.() || ''), [editor, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = async (status) => {
    const record = await updateQuestion(entry.record._id, { status });
    setEntry(previous => ({ ...previous, record: { ...previous.record, ...record } }));
    onSaved?.({ kind: 'question', record });
  };

  if (!entry) {
    return <p className="think-notes__quiet" role="status">{error || `Opening this ${target.kind}…`}</p>;
  }

  const isQuestion = entry.kind === 'question';
  return (
    <div className="think-notebook-editor think-entry-editor">
      <div className="think-notebook-editor-header">
        <EntryBar
          kind={entry.kind}
          saveState={saveState}
          savedAt={savedAt}
          onRetry={save}
          partnerOpen={partnerOpen}
          onPartner={onPartner}
        >
          <QuietButton onClick={() => setPicking(true)}>Pull a passage in</QuietButton>
          <QuietButton onClick={() => setSharing(true)}>Share</QuietButton>
        </EntryBar>
        <div className="think-notebook-title-block">
          <h1 className="sr-only">{title || entry.title}</h1>
          <textarea
            rows={1}
            className="think-notebook-title-input"
            value={title}
            readOnly={!isQuestion}
            aria-label={isQuestion ? 'Question' : 'Concept'}
            title={isQuestion ? undefined : 'A concept is named by the tag on its passages.'}
            onChange={(event) => { setTitle(event.target.value); schedule(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                editor?.commands.focus('start');
              }
            }}
            ref={(node) => {
              if (!node) return;
              node.style.height = 'auto';
              node.style.height = `${node.scrollHeight}px`;
            }}
            placeholder="Title"
          />
          <p className="think-notebook-title-meta" id="think-note-title">{begunLine(entry.record?.createdAt, words)}</p>
        </div>
        {isQuestion ? <QuestionFacts entry={entry} onSettle={settle} /> : <ConceptFacts entry={entry} />}
      </div>
      {error ? <p className="status-message error-message">{error}</p> : null}
      <div className="think-notebook-editor__body is-editing" ref={surfaceRef} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) save();
      }}>
        <EditorDraftShell
          editor={editor}
          surfaceRef={surfaceRef}
          toolbarVariant="full"
          toolbarClassName="think-notebook-editor-formatting"
          hideBlockControls
          slashCommands={slashCommands}
          contextualToolbar
          onAskSelection={onAsk}
        />
      </div>
      <InsertHighlightModal
        open={picking}
        highlights={highlights}
        onClose={() => setPicking(false)}
        onSelect={(highlight) => { insertPassage(highlight); setPicking(false); }}
      />
      {isQuestion ? (
        <QuestionShareModal open={sharing} questionId={entry.record._id} questionText={entry.record.text} onClose={() => setSharing(false)} />
      ) : (
        <ConceptShareModal open={sharing} conceptName={entry.record?.name || entry.title} onClose={() => setSharing(false)} />
      )}
    </div>
  );
};

export default ThinkEntryEditor;
