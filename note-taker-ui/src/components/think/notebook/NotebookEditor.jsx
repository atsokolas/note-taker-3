import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Button, QuietButton } from '../../ui';
import HighlightBlock from '../../blocks/HighlightBlock';
import ReturnLaterControl from '../../return-queue/ReturnLaterControl';
import InsertHighlightModal from './InsertHighlightModal';
import InsertReferenceModal from './InsertReferenceModal';
import AgentSkillDock from '../../agent/AgentSkillDock';
import EvergreenToggle from '../../EvergreenToggle';
import EditorDraftShell from '../editor/EditorDraftShell';
import AuthoredWorkOrigin from '../AuthoredWorkOrigin';
import useSlashCommands from '../editor/useSlashCommands';
import useThinkWritingActivity from '../editor/useThinkWritingActivity';
import { handleEditorStructureShortcut } from '../editor/editorShortcuts';
import { createNotebookClaimSlashItems } from './notebookClaimSlash';
import UseDistinctionHere from '../../wiki/open-sentence/UseDistinctionHere';
import SourceCorrectionReview from '../SourceCorrectionReview';
import { editorNodesFromDistinctionUse, eligibleDistinctions } from '../../../utils/distinctionUse';
import { exportNotebookMarkdown, getNotebookSummaries, disposeNotebookSourceCorrection } from '../../../api/notebook';
import useHighlights from '../../../hooks/useHighlights';
import useArticles from '../../../hooks/useArticles';
import useConcepts from '../../../hooks/useConcepts';
import useQuestions from '../../../hooks/useQuestions';
import { buildDocFromBlocks, ensureBlockIds, serializeBlocksFromDoc } from '../../../utils/notebookBlocks';
import {
  applyNotebookDoc,
  deletePieceInDocument,
  focusPieceInEditor,
  groupDocPieces,
  hydrateAsidePieces,
  movePieceInDocument,
  persistableAsidePiece,
  pieceIndexForSelection,
  restorePieceInDocument,
  setAsidePieceInDocument
} from '../../../utils/notebookArrangement';
import { getNotebookClaimEvidence, searchNotebookClaims } from '../../../api/organize';
import { listWikiPages } from '../../../api/wiki';
import { AGENT_DISPLAY_NAME } from '../../../constants/agentIdentity';
import { resolveNotebookSource } from './notebookSourceModel';
import useNotebookSourceEvergreen from './useNotebookSourceEvergreen';
import NotebookArrangementRail from './NotebookArrangementRail';
import '../../../styles/think-writing.css';

const AUTOSAVE_DELAY_MS = 850;

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const ITEM_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'claim', label: 'Claim' },
  { value: 'evidence', label: 'Evidence' }
];

const EMPTY_CLAIM_CANDIDATES = [];

const ListIndentExtension = Extension.create({
  name: 'listIndent',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList')) {
          return this.editor.commands.sinkListItem('listItem');
        }
        return false;
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList')) {
          return this.editor.commands.liftListItem('listItem');
        }
        return false;
      }
    };
  }
});

const BlockIdExtension = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock'],
        attributes: {
          blockId: {
            default: null,
            parseHTML: element => element.getAttribute('data-block-id'),
            renderHTML: attributes => (
              attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
            )
          },
          highlightId: {
            default: null,
            parseHTML: element => element.getAttribute('data-highlight-id'),
            renderHTML: attributes => (
              attributes.highlightId ? { 'data-highlight-id': attributes.highlightId } : {}
            )
          }
        }
      },
      {
        types: ['blockquote'],
        attributes: {
          sourcePath: {
            default: null,
            parseHTML: element => element.getAttribute('data-source-path'),
            renderHTML: attributes => (
              attributes.sourcePath ? { 'data-source-path': attributes.sourcePath } : {}
            )
          },
          articleId: {
            default: null,
            parseHTML: element => element.getAttribute('data-article-id'),
            renderHTML: attributes => (
              attributes.articleId ? { 'data-article-id': attributes.articleId } : {}
            )
          },
          articleTitle: {
            default: '',
            parseHTML: element => element.getAttribute('data-article-title') || '',
            renderHTML: attributes => (
              attributes.articleTitle ? { 'data-article-title': attributes.articleTitle } : {}
            )
          }
        }
      }
    ];
  }
});

const HighlightRefNode = Node.create({
  name: 'highlightRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      highlightId: {
        default: null,
        parseHTML: element => element.getAttribute('data-highlight-id'),
        renderHTML: attributes => (
          attributes.highlightId ? { 'data-highlight-id': attributes.highlightId } : {}
        )
      },
      highlightText: {
        default: '',
        parseHTML: element => element.getAttribute('data-highlight-text') || '',
        renderHTML: attributes => (
          attributes.highlightText ? { 'data-highlight-text': attributes.highlightText } : {}
        )
      },
      articleTitle: {
        default: '',
        parseHTML: element => element.getAttribute('data-article-title') || '',
        renderHTML: attributes => (
          attributes.articleTitle ? { 'data-article-title': attributes.articleTitle } : {}
        )
      },
      articleId: {
        default: '',
        parseHTML: element => element.getAttribute('data-article-id') || '',
        renderHTML: attributes => (
          attributes.articleId ? { 'data-article-id': attributes.articleId } : {}
        )
      },
      tags: {
        default: '',
        parseHTML: element => element.getAttribute('data-highlight-tags') || '',
        renderHTML: attributes => (
          attributes.tags ? { 'data-highlight-tags': attributes.tags } : {}
        )
      },
      sourcePath: {
        default: '',
        parseHTML: element => element.getAttribute('data-source-path') || '',
        renderHTML: attributes => (
          attributes.sourcePath ? { 'data-source-path': attributes.sourcePath } : {}
        )
      },
      blockId: {
        default: null,
        parseHTML: element => element.getAttribute('data-block-id'),
        renderHTML: attributes => (
          attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
        )
      }
    };
  },
  parseHTML() {
    return [
      { tag: 'blockquote[data-highlight-id]' }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node, extension }) => {
      const highlight = extension.options.getHighlightById(node.attrs.highlightId) || {
        id: node.attrs.highlightId,
        text: node.attrs.highlightText || 'Highlight',
        tags: node.attrs.tags ? node.attrs.tags.split(',').filter(Boolean) : [],
        articleTitle: node.attrs.articleTitle || '',
        articleId: node.attrs.articleId || ''
      };
      return (
        <NodeViewWrapper
          className="highlight-ref-node notebook-source-quote"
          contentEditable={false}
          aria-label={highlight.articleTitle ? `Source quotation from ${highlight.articleTitle}` : 'Source quotation'}
        >
          <HighlightBlock highlight={highlight} compact />
        </NodeViewWrapper>
      );
    });
  }
});

const ReferenceCard = ({ label, title, meta, href }) => (
  <div className="notebook-ref-card">
    <div className="notebook-ref-label">{label}</div>
    {href ? (
      <a className="notebook-ref-title" href={href}>{title}</a>
    ) : (
      <div className="notebook-ref-title">{title}</div>
    )}
    {meta ? <div className="notebook-ref-meta">{meta}</div> : null}
  </div>
);

const createReferenceNode = ({ name, label, idKey, titleKey, metaKey, buildHref }) => Node.create({
  name,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      [idKey]: {
        default: null,
        parseHTML: element => element.getAttribute(`data-${idKey}`),
        renderHTML: attributes => (
          attributes[idKey] ? { [`data-${idKey}`]: attributes[idKey] } : {}
        )
      },
      [titleKey]: {
        default: '',
        parseHTML: element => element.getAttribute(`data-${titleKey}`) || '',
        renderHTML: attributes => (
          attributes[titleKey] ? { [`data-${titleKey}`]: attributes[titleKey] } : {}
        )
      },
      [metaKey]: {
        default: '',
        parseHTML: element => element.getAttribute(`data-${metaKey}`) || '',
        renderHTML: attributes => (
          attributes[metaKey] ? { [`data-${metaKey}`]: attributes[metaKey] } : {}
        )
      },
      blockId: {
        default: null,
        parseHTML: element => element.getAttribute('data-block-id'),
        renderHTML: attributes => (
          attributes.blockId ? { 'data-block-id': attributes.blockId } : {}
        )
      }
    };
  },
  parseHTML() {
    return [
      { tag: `div[data-${idKey}]` }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node }) => {
      const title = node.attrs[titleKey] || 'Untitled';
      const meta = metaKey ? node.attrs[metaKey] : '';
      const href = buildHref ? buildHref(node.attrs) : '';
      return (
        <NodeViewWrapper className="notebook-ref-node" contentEditable={false}>
          <ReferenceCard label={label} title={title} meta={meta} href={href} />
        </NodeViewWrapper>
      );
    });
  }
});

const ArticleRefNode = createReferenceNode({
  name: 'articleRef',
  label: 'Article',
  idKey: 'articleId',
  titleKey: 'articleTitle',
  metaKey: 'articleMeta',
  buildHref: (attrs) => (attrs.articleId ? `/articles/${attrs.articleId}` : '')
});

const ConceptRefNode = createReferenceNode({
  name: 'conceptRef',
  label: 'Concept',
  idKey: 'conceptId',
  titleKey: 'conceptName',
  metaKey: 'conceptMeta',
  buildHref: (attrs) => (attrs.conceptName ? `/think?tab=concepts&concept=${encodeURIComponent(attrs.conceptName)}` : '')
});

const QuestionRefNode = createReferenceNode({
  name: 'questionRef',
  label: 'Question',
  idKey: 'questionId',
  titleKey: 'questionText',
  metaKey: 'questionMeta',
  buildHref: (attrs) => (attrs.questionId ? `/think?tab=questions&questionId=${attrs.questionId}` : '')
});

const WikiRefNode = createReferenceNode({
  name: 'wikiRef',
  label: 'Wiki',
  idKey: 'wikiId',
  titleKey: 'wikiTitle',
  metaKey: 'wikiMeta',
  buildHref: (attrs) => (attrs.wikiId ? `/wiki/workspace?page=${encodeURIComponent(attrs.wikiId)}` : '')
});

const NotebookEditor = ({
  entry,
  saving,
  error,
  onSave,
  onRegisterSave,
  startWriting = false,
  onDelete,
  onRegisterInsert,
  onCreate,
  onSynthesize,
  onDump,
  claimCandidates = EMPTY_CLAIM_CANDIDATES,
  // When it was last touched, shown under the title rather than above it: the
  // title is the first thing on the page and the timestamp is a footnote to it.
  metaLine = null,
  metaId = undefined,
  onInvokeAgentSkill = null,
  showInlineAgentDock = true,
  agentContextType = 'notebook',
  agentContextId = '',
  agentContextTitle = '',
  sourceEvergreen = null,
  onSourceCorrectionSettled = null
}) => {
  const liveSourceEvergreen = useNotebookSourceEvergreen(entry);
  const resolvedSourceEvergreen = sourceEvergreen || liveSourceEvergreen;
  const slashSurfaceRef = useRef(null);
  const slashKeyDownRef = useRef(() => false);
  const referenceTriggerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveSequenceRef = useRef(0);
  const saveInFlightRef = useRef(null);
  const dirtyRef = useRef(false);
  const hydratedEntryIdRef = useRef('');
  const titleDraftRef = useRef(entry?.title || '');
  const [titleDraft, setTitleDraft] = useState(entry?.title || '');
  const [saveState, setSaveState] = useState('idle');
  const [agentThreadPulse, setAgentThreadPulse] = useState(false);
  const [insertMode, setInsertMode] = useState('');
  const [wikiPages, setWikiPages] = useState([]);
  const [wikiPagesLoading, setWikiPagesLoading] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [savedDistinctions, setSavedDistinctions] = useState([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [entryType, setEntryType] = useState(entry?.type || 'note');
  const [entryTags, setEntryTags] = useState(entry?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [claimId, setClaimId] = useState(entry?.claimId ? String(entry.claimId) : '');
  const [claimQuery, setClaimQuery] = useState('');
  const [claimOptions, setClaimOptions] = useState([]);
  const [claimOptionsLoading, setClaimOptionsLoading] = useState(false);
  const [claimEvidenceOpen, setClaimEvidenceOpen] = useState(false);
  const [claimEvidenceItems, setClaimEvidenceItems] = useState([]);
  const [claimEvidenceLoading, setClaimEvidenceLoading] = useState(false);
  const [organizeError, setOrganizeError] = useState('');
  const [sourceCorrection, setSourceCorrection] = useState(entry?.sourceCorrection || null);
  const navigate = useNavigate();
  const { highlights, highlightMap, loading: highlightsLoading, error: highlightsError } = useHighlights();
  const { articles } = useArticles({ enabled: insertMode === 'article' });
  const { concepts } = useConcepts();
  const { questions } = useQuestions({ status: 'open', enabled: insertMode === 'question' });
  const applyDistinctionRef = useRef(() => {});
  const usableDistinctionsRef = useRef([]);
  const highlightLookupRef = useRef((id) => highlightMap.get(String(id)));
  const usableDistinctions = useMemo(
    () => savedDistinctions.filter((item) => item.sourceId !== String(entry?._id || '')),
    [entry?._id, savedDistinctions]
  );
  usableDistinctionsRef.current = usableDistinctions;
  const slashActionItems = useMemo(() => ([
    {
      id: 'insertHighlight',
      label: 'Insert highlight',
      description: 'Bring a saved highlight onto the page.',
      keywords: ['highlight', 'quote', 'evidence'],
      intent: 'artifact',
      artifactType: 'evidence',
      onSelect: () => setInsertMode('highlight')
    },
    {
      id: 'insertArticle',
      label: 'Insert article',
      description: 'Reference a saved article.',
      keywords: ['article', 'source', 'read'],
      intent: 'artifact',
      onSelect: () => setInsertMode('article')
    },
    {
      id: 'insertConcept',
      label: 'Insert concept',
      description: 'Link a concept into the draft.',
      keywords: ['concept', 'idea', 'topic'],
      intent: 'artifact',
      artifactType: 'concept',
      onSelect: () => setInsertMode('concept')
    },
    {
      id: 'insertQuestion',
      label: 'Insert question',
      description: 'Pull in an open question.',
      keywords: ['question', 'prompt', 'open'],
      intent: 'artifact',
      artifactType: 'question',
      onSelect: () => setInsertMode('question')
    },
    {
      id: 'useDistinction',
      label: 'Use this here',
      description: 'Keep the wording of a named distinction on this page.',
      keywords: ['use', 'distinction', 'instrument', 'definition'],
      onSelect: () => {
        const choices = usableDistinctionsRef.current;
        if (choices.length === 1) {
          applyDistinctionRef.current(choices[0]);
          return;
        }
        setInsertMenuOpen(true);
        setInsertMode('distinction');
      }
    },
    ...createNotebookClaimSlashItems({ claimId, navigate })
  ]), [claimId, navigate]);

  useEffect(() => {
    highlightLookupRef.current = (id) => highlightMap.get(String(id));
  }, [highlightMap]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const notes = typeof getNotebookSummaries === 'function'
          ? await getNotebookSummaries()
          : [];
        if (!cancelled) setSavedDistinctions(eligibleDistinctions(notes));
      } catch (_ignored) {
        if (!cancelled) setSavedDistinctions([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [entry?._id]);

  const highlightExtension = useMemo(
    () => HighlightRefNode.configure({
      getHighlightById: (id) => highlightLookupRef.current?.(id)
    }),
    []
  );

  /* A note opens as reading, not as a cursor already in your work.
     /think opens straight into whichever note you were last in, and the body
     was a live editor on first paint — so a keystroke aimed at the page (or a
     stray one on the way to the search field) landed in the note. Editing is
     now something you ask for: click the body, or press Edit. */
  const [editingBody, setEditingBody] = useState(false);
  const [asidePieces, setAsidePieces] = useState(() => hydrateAsidePieces(entry?.asidePieces));
  const asidePiecesRef = useRef(asidePieces);
  const writeAsidePieces = (next) => {
    const resolved = typeof next === 'function' ? next(asidePiecesRef.current) : next;
    asidePiecesRef.current = resolved;
    setAsidePieces(resolved);
  };
  const [arrangementReceipt, setArrangementReceipt] = useState(null);
  const [exportError, setExportError] = useState('');
  const [, setDocTick] = useState(0);

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Write freely… Type / for commands.' }),
      ListIndentExtension,
      BlockIdExtension,
      highlightExtension,
      ArticleRefNode,
      ConceptRefNode,
      QuestionRefNode,
      WikiRefNode
    ],
    content: entry?.blocks?.length ? buildDocFromBlocks(entry.blocks) : (entry?.content || '<p></p>'),
    editorProps: {
      attributes: {
        class: 'think-notebook-editor-body',
        'aria-label': 'Notebook page',
        'data-markdown-shortcuts': 'headings lists quotes divider code'
      },
      handleKeyDown: (view, event) => (
        slashKeyDownRef.current?.(view, event)
        || handleEditorStructureShortcut({ editor, event, allowTitle: true })
        || false
      ),
      handleTextInput: (view, from, to, text) => {
        const before = view.state.doc.textBetween(Math.max(0, from - 1), from, '', '');
        const atBoundary = !before || /\s/.test(before);
        if (text === '@' && atBoundary) {
          referenceTriggerRef.current = { from, to: to + 1 };
          window.requestAnimationFrame?.(() => setInsertMode('article'));
        } else if (text === '[' && before === '[') {
          referenceTriggerRef.current = { from: Math.max(0, from - 1), to: to + 1 };
          window.requestAnimationFrame?.(() => setInsertMode('concept'));
        }
        return false;
      }
    }
  });

  useLayoutEffect(() => {
    if (editor) editor.setEditable(editingBody);
  }, [editor, editingBody]);

  /* Opening a different note starts it closed again. Carrying the open state
     across would mean the second note you looked at was live before you had
     read a word of it. */
  useEffect(() => {
    setEditingBody(startWriting);
    const focusFrame = startWriting
      ? window.requestAnimationFrame?.(() => editor?.commands.focus('start'))
      : null;
    setSaveState('idle');
    saveSequenceRef.current += 1;
    dirtyRef.current = false;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    return () => { if (focusFrame != null) window.cancelAnimationFrame?.(focusFrame); };
  }, [entry?._id, startWriting, editor]);

  const startEditingBody = (event) => {
    if (editingBody) return;
    let pos = null;
    if (editor?.view?.posAtCoords && event && Number.isFinite(event.clientX)) {
      try {
        pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      } catch (_err) {
        pos = null;
      }
    }
    setEditingBody(true);
    window.requestAnimationFrame?.(() => {
      if (!editor) return;
      if (Number.isInteger(pos)) {
        editor.commands.setTextSelection?.(pos);
        editor.commands.focus?.();
        return;
      }
      editor.commands?.focus?.();
    });
  };

  /* A picker open is still writing — see the hook. */
  useThinkWritingActivity(editor, { enabled: editingBody, reaching: Boolean(insertMode) });

  const slashCommands = useSlashCommands({
    editor,
    variant: 'full',
    containerRef: slashSurfaceRef,
    extraItems: slashActionItems
  });

  useEffect(() => {
    slashKeyDownRef.current = slashCommands.onKeyDown;
  }, [slashCommands.onKeyDown]);

  useEffect(() => {
    if (!onRegisterInsert) return;
    const insert = (highlight) => {
      if (!editor) return;
      editor.commands.insertContent({
        type: 'highlightRef',
        attrs: {
          highlightId: highlight._id,
          highlightText: highlight.text || '',
          articleTitle: highlight.articleTitle || '',
          articleId: highlight.articleId || '',
          sourcePath: highlight.articleId
            ? `/library?articleId=${encodeURIComponent(highlight.articleId)}${highlight._id ? `&highlightId=${encodeURIComponent(highlight._id)}` : ''}`
            : '',
          tags: (highlight.tags || []).join(','),
          blockId: createId()
        }
      });
    };
    onRegisterInsert(insert);
    return () => onRegisterInsert(null);
  }, [editor, onRegisterInsert]);

  useEffect(() => {
    if (!entry?._id) return;
    const incomingEntryId = String(entry._id);
    if (hydratedEntryIdRef.current === incomingEntryId) return;
    hydratedEntryIdRef.current = incomingEntryId;
    setTitleDraft(entry.title || '');
    titleDraftRef.current = entry.title || '';
    setEntryType(entry.type || 'note');
    setEntryTags(Array.isArray(entry.tags) ? entry.tags : []);
    setClaimId(entry.claimId ? String(entry.claimId) : '');
    setOrganizeError('');
    setClaimEvidenceOpen(false);
    setClaimEvidenceItems([]);
    writeAsidePieces(hydrateAsidePieces(entry.asidePieces));
    setArrangementReceipt(null);
    if (editor) {
      const content = entry.blocks?.length ? buildDocFromBlocks(entry.blocks) : (entry.content || '<p></p>');
      editor.commands.setContent(content, false);
    }
  }, [entry, editor]);

  useEffect(() => {
    setSourceCorrection(entry?.sourceCorrection || null);
  }, [entry?._id, entry?.sourceCorrection]);

  useEffect(() => {
    if (insertMode !== 'concept') return undefined;
    let cancelled = false;
    setWikiPagesLoading(true);
    listWikiPages({ limit: 120, summary: 1, includeLowQuality: 1 })
      .then((pages) => {
        if (!cancelled) setWikiPages(Array.isArray(pages) ? pages : []);
      })
      .catch(() => {
        if (!cancelled) setWikiPages([]);
      })
      .finally(() => {
        if (!cancelled) setWikiPagesLoading(false);
      });
    return () => { cancelled = true; };
  }, [insertMode]);

  const conceptAndWikiTargets = useMemo(() => ([
    ...(concepts || []).map(item => ({ ...item, referenceKind: 'concept' })),
    ...(wikiPages || []).map(item => ({ ...item, referenceKind: 'wiki' }))
  ]), [concepts, wikiPages]);

  useEffect(() => {
    let cancelled = false;
    if (!organizeOpen || entryType !== 'evidence') {
      setClaimOptions([]);
      setClaimOptionsLoading(false);
      return;
    }
    const loadClaims = async () => {
      setClaimOptionsLoading(true);
      try {
        const claims = await searchNotebookClaims(claimQuery);
        if (cancelled) return;
        const localClaims = (claimCandidates || []).filter(item => item && String(item._id || item.id));
        const merged = new Map();
        [...localClaims, ...claims].forEach(item => {
          const key = String(item._id || item.id);
          if (!key || key === String(entry?._id)) return;
          merged.set(key, {
            _id: key,
            title: item.title || item.name || 'Untitled claim',
            tags: item.tags || []
          });
        });
        setClaimOptions(Array.from(merged.values()));
      } catch (err) {
        if (!cancelled) {
          setOrganizeError(err.response?.data?.error || 'Failed to load claim options.');
          const localClaims = (claimCandidates || []).filter(item => String(item?._id) !== String(entry?._id));
          setClaimOptions(localClaims.map(item => ({
            _id: item._id,
            title: item.title || 'Untitled claim',
            tags: item.tags || []
          })));
        }
      } finally {
        if (!cancelled) setClaimOptionsLoading(false);
      }
    };
    loadClaims();
    return () => {
      cancelled = true;
    };
  }, [organizeOpen, entryType, claimQuery, entry?._id, claimCandidates]);

  useEffect(() => {
    let cancelled = false;
    if (!organizeOpen || !claimEvidenceOpen || entryType !== 'claim' || !entry?._id || entry?.type !== 'claim') {
      setClaimEvidenceItems([]);
      setClaimEvidenceLoading(false);
      return;
    }
    const loadEvidence = async () => {
      setClaimEvidenceLoading(true);
      try {
        const data = await getNotebookClaimEvidence(entry._id);
        if (!cancelled) {
          setClaimEvidenceItems(Array.isArray(data?.evidence) ? data.evidence : []);
        }
      } catch (err) {
        if (!cancelled) {
          setOrganizeError(err.response?.data?.error || 'Failed to load evidence.');
        }
      } finally {
        if (!cancelled) setClaimEvidenceLoading(false);
      }
    };
    loadEvidence();
    return () => {
      cancelled = true;
    };
  }, [organizeOpen, claimEvidenceOpen, entryType, entry?._id, entry?.type]);

  const notebookSourceMeta = useMemo(() => resolveNotebookSource(entry), [entry]);

  const addTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag) return;
    if (entryTags.some(tag => tag.toLowerCase() === nextTag.toLowerCase())) {
      setTagInput('');
      return;
    }
    setEntryTags(prev => [...prev, nextTag]);
    setTagInput('');
  };

  const removeTag = (tagValue) => {
    setEntryTags(prev => prev.filter(tag => tag !== tagValue));
  };

  const buildSavePayload = useCallback(() => {
    if (!entry || !editor) return null;
    const currentDoc = editor.getJSON();
    const normalized = ensureBlockIds(currentDoc);
    if (normalized.changed) {
      editor.commands.setContent(normalized.node, false);
    }
    const blocks = serializeBlocksFromDoc(normalized.node);
    return {
      id: entry._id,
      title: titleDraftRef.current.trim() || 'Untitled note',
      content: editor.getHTML(),
      blocks,
      asidePieces: hydrateAsidePieces(asidePiecesRef.current),
      type: entryType,
      tags: entryTags,
      claimId: entryType === 'evidence' ? (claimId || null) : null,
      linkedArticleId: entry.linkedArticleId || null
    };
  }, [claimId, editor, entry, entryTags, entryType]);

  const commitDraft = useCallback(async () => {
    // A navigation flush waits for the pending save, then includes any words
    // typed while that request was in flight. Requests cannot overtake each other.
    while (saveInFlightRef.current) await saveInFlightRef.current;
    if (!dirtyRef.current) return true;
    const payload = buildSavePayload();
    if (!payload) return false;
    const sequence = ++saveSequenceRef.current;
    dirtyRef.current = false;
    setSaveState('saving');
    const attempt = (async () => {
      await Promise.resolve();
      try {
        await onSave(payload);
        if (sequence === saveSequenceRef.current) setSaveState(dirtyRef.current ? 'dirty' : 'saved');
        return true;
      } catch (_saveError) {
        if (sequence === saveSequenceRef.current) {
          dirtyRef.current = true;
          setSaveState('error');
        }
        return false;
      } finally { saveInFlightRef.current = null; }
    })();
    saveInFlightRef.current = attempt;
    return attempt;
  }, [buildSavePayload, onSave]);

  useEffect(() => {
    onRegisterSave?.(async () => {
      let saved;
      do { saved = await commitDraft(); } while (saved && dirtyRef.current);
      return saved;
    });
    return () => onRegisterSave?.(null);
  }, [commitDraft, onRegisterSave]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('dirty');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(commitDraft, AUTOSAVE_DELAY_MS);
  }, [commitDraft]);

  useEffect(() => {
    if (!editor || !editingBody) return undefined;
    const onUpdate = () => scheduleSave();
    editor.on('update', onUpdate);
    return () => editor.off('update', onUpdate);
  }, [editingBody, editor, scheduleSave]);

  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => setDocTick((value) => value + 1);
    editor.on('update', bump);
    editor.on('selectionUpdate', bump);
    return () => {
      editor.off('update', bump);
      editor.off('selectionUpdate', bump);
    };
  }, [editor]);

  const arrangementDoc = editor?.getJSON?.() || { type: 'doc', content: [] };
  const arrangementPieces = groupDocPieces(arrangementDoc);
  const currentPieceIndex = pieceIndexForSelection(
    arrangementDoc,
    editor?.state?.selection
  );

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  const insertTriggeredReference = (node) => {
    if (!editor) return;
    const range = referenceTriggerRef.current;
    referenceTriggerRef.current = null;
    if (range && editor.chain) {
      editor.chain().focus().deleteRange(range).insertContent(node).run();
      return;
    }
    editor.commands.insertContent(node);
  };

  const handleInsertHighlight = (highlight) => {
    if (!editor) return;
    editor.commands.insertContent({
      type: 'highlightRef',
      attrs: {
        highlightId: highlight._id,
        highlightText: highlight.text || '',
        articleTitle: highlight.articleTitle || '',
        articleId: highlight.articleId || '',
        sourcePath: highlight.articleId
          ? `/library?articleId=${encodeURIComponent(highlight.articleId)}${highlight._id ? `&highlightId=${encodeURIComponent(highlight._id)}` : ''}`
          : '',
        tags: (highlight.tags || []).join(','),
        blockId: createId()
      }
    });
  };

  const handleInsertArticle = (article) => {
    if (!editor) return;
    insertTriggeredReference({
      type: 'articleRef',
      attrs: {
        articleId: article._id,
        articleTitle: article.title || 'Untitled article',
        articleMeta: article.source || '',
        blockId: createId()
      }
    });
  };

  const handleInsertConcept = (concept) => {
    if (!editor) return;
    insertTriggeredReference({
      type: 'conceptRef',
      attrs: {
        conceptId: concept._id || '',
        conceptName: concept.name || 'Concept',
        conceptMeta: concept.description || '',
        blockId: createId()
      }
    });
  };

  const handleInsertQuestion = (question) => {
    if (!editor) return;
    editor.commands.insertContent({
      type: 'questionRef',
      attrs: {
        questionId: question._id,
        questionText: question.text || 'Question',
        questionMeta: question.linkedTagName || question.conceptName || '',
        blockId: createId()
      }
    });
  };

  const handleInsertWiki = (page) => {
    if (!editor) return;
    insertTriggeredReference({
      type: 'wikiRef',
      attrs: {
        wikiId: page._id,
        wikiTitle: page.title || 'Untitled wiki',
        wikiMeta: page.pageType === 'repo' ? 'Repository wiki' : page.pageType === 'company_dossier' ? 'Investment dossier' : 'Living wiki',
        blockId: createId()
      }
    });
  };

  const applyDistinction = (record) => {
    if (!editor) return;
    startEditingBody();
    const nodes = editorNodesFromDistinctionUse(record);
    if (!nodes.length) return;
    editor.chain().focus().insertContent(nodes).run();
    setInsertMode('');
  };
  applyDistinctionRef.current = applyDistinction;

  const handleSelectInsertMode = (mode) => {
    referenceTriggerRef.current = null;
    setInsertMenuOpen(false);
    setInsertMode(mode);
  };

  const handleAskSelection = (selectedText) => {
    const passage = String(selectedText || '').trim();
    if (!passage || !onInvokeAgentSkill) return;
    setAgentThreadPulse(true);
    window.setTimeout(() => setAgentThreadPulse(false), 720);
    onInvokeAgentSkill({
      id: `notebook-selection-${entry?._id || 'draft'}-${Date.now()}`,
      mode: 'draft',
      prompt: `Work with this exact passage from “${titleDraft || entry?.title || 'Untitled'}”:\n\n“${passage}”\n\nHelp me sharpen, challenge, or extend it. Ask a clarifying question if my intent is ambiguous.`,
      contextType: agentContextType || 'notebook',
      contextId: agentContextId || entry?._id || '',
      contextTitle: agentContextTitle || titleDraft || entry?.title || 'Notebook'
    });
  };

  const rememberArrangement = (restoreDoc, label, extra = {}) => {
    setArrangementReceipt({
      label,
      restoreDoc,
      ...extra
    });
    startEditingBody();
    scheduleSave();
  };

  const handleArrangeMove = (direction) => {
    if (!editor || !Number.isInteger(currentPieceIndex)) return;
    const previous = editor.getJSON();
    const result = movePieceInDocument(previous, currentPieceIndex, direction);
    if (!result?.moved) return;
    applyNotebookDoc(editor, result.doc);
    focusPieceInEditor(editor, result.toIndex);
    rememberArrangement(previous, `Undo moving “${result.label}”`);
  };

  const handleArrangeUndo = () => {
    if (!editor || !arrangementReceipt?.restoreDoc) return;
    applyNotebookDoc(editor, arrangementReceipt.restoreDoc);
    if (arrangementReceipt.restoreAside) writeAsidePieces(hydrateAsidePieces(arrangementReceipt.restoreAside));
    setArrangementReceipt(null);
    startEditingBody();
    scheduleSave();
  };

  const handleSetAside = (pieceIndex) => {
    if (!editor) return;
    const previous = editor.getJSON();
    const previousAside = asidePiecesRef.current;
    const { doc, aside } = setAsidePieceInDocument(previous, pieceIndex);
    if (!aside) return;
    writeAsidePieces((current) => ([...current, persistableAsidePiece(aside)]));
    applyNotebookDoc(editor, doc);
    rememberArrangement(previous, `Undo setting aside “${aside.label}”`, { restoreAside: previousAside });
  };

  const handleRestoreAside = (id) => {
    if (!editor) return;
    const piece = asidePiecesRef.current.find((item) => item.id === id);
    if (!piece) return;
    const previous = editor.getJSON();
    const previousAside = asidePiecesRef.current;
    const restored = restorePieceInDocument(previous, persistableAsidePiece(piece));
    writeAsidePieces((current) => current.filter((item) => item.id !== id));
    applyNotebookDoc(editor, restored.doc);
    rememberArrangement(previous, `Undo bringing back “${piece.label}”`, { restoreAside: previousAside });
  };

  const handleDeletePiece = (pieceIndex) => {
    if (!editor) return;
    const pieces = groupDocPieces(editor.getJSON());
    const piece = pieces[pieceIndex];
    if (!piece) return;
    if (!window.confirm(`Delete “${piece.label}”? It will not wait in Set aside.`)) return;
    const { doc, deleted } = deletePieceInDocument(editor.getJSON(), pieceIndex);
    if (!deleted) return;
    applyNotebookDoc(editor, doc);
    setArrangementReceipt(null);
    startEditingBody();
    scheduleSave();
  };

  const handleExport = async () => {
    if (!entry?._id) return;
    setExportError('');
    dirtyRef.current = true;
    const saved = await commitDraft();
    if (!saved) {
      setExportError('Could not save this draft, so export did not start.');
      return;
    }
    try {
      const data = await exportNotebookMarkdown(entry._id);
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/markdown;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${entry.title || 'notebook-entry'}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_err) {
      setExportError('Could not export this note.');
    }
  };

  if (!entry) {
    return (
      <div className="think-notebook-editor think-notebook-editor--empty">
        <p className="muted small">Select a note to start editing.</p>
        {onCreate && (
          <Button variant="secondary" onClick={onCreate}>
            New page
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="think-notebook-editor">
      <div className="think-notebook-editor-header">
        <div className="think-notebook-title-block">
          <h1 className="sr-only">{titleDraft || entry?.title || 'Untitled notebook page'}</h1>
          <span className="think-notebook-title-kicker">Document title</span>
          {/* A textarea, because a title is a sentence and an <input> cannot
              wrap one: a long title ran off the end of the field and the rest
              of it was simply not visible. It grows to its own content and
              still behaves like a single-line field — Enter moves on to the
              body rather than putting a newline in the title. */}
          <textarea
            rows={1}
            className="think-notebook-title-input"
            value={titleDraft}
            onFocus={() => setEditingBody(true)}
            onChange={(event) => {
              titleDraftRef.current = event.target.value;
              setTitleDraft(event.target.value);
              scheduleSave();
            }}
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
          {metaLine ? <p className="think-notebook-title-meta" id={metaId}>{metaLine}</p> : null}
          <p className="think-notebook-title-hint">
            Write naturally. Use ## for a heading, - for a list, &gt; for a quote, @ for a source, [[ for a concept, or / for anything else.
          </p>
        </div>
        {notebookSourceMeta && (
          <div className={`think-notebook-editor-provenance think-notebook-editor-provenance--${notebookSourceMeta.kind}`}>
            <span className="think-notebook-editor-provenance__eyebrow">
              {notebookSourceMeta.eyebrow}
            </span>
            <div className="think-notebook-editor-provenance__body">
              <div>
                <a href={notebookSourceMeta.href}>
                  {notebookSourceMeta.kind === 'library'
                    ? `Return to ${notebookSourceMeta.label}`
                    : notebookSourceMeta.label}
                </a>
                <p>
                  {notebookSourceMeta.kind === 'library' ? (
                    'This page keeps the exact passage that started the thought. Follow the thread back without losing your place.'
                  ) : (
                    <>
                      {notebookSourceMeta.draftTemplateLabel
                        ? `${notebookSourceMeta.draftTemplateLabel} spun out from the concept. `
                        : ''}
                      Keep drafting here. Return to the concept when the underlying idea shifts, new support appears, or the tension changes.
                      {notebookSourceMeta.importedAt ? ` Started here on ${notebookSourceMeta.importedAt}.` : ''}
                    </>
                  )}
                </p>
              </div>
              {notebookSourceMeta.kind === 'concept' ? (
                <a className="ui-quiet-button think-notebook-editor-provenance__link" href={notebookSourceMeta.href}>
                  {notebookSourceMeta.action}
                </a>
              ) : resolvedSourceEvergreen?.status === 'ready' ? (
                <EvergreenToggle
                  className="think-notebook-editor-provenance__keep"
                  evergreen={resolvedSourceEvergreen.evergreen}
                  label={resolvedSourceEvergreen.evergreen ? 'Kept in Library' : 'Keep source'}
                  onChange={resolvedSourceEvergreen.setEvergreen}
                />
              ) : null}
            </div>
          </div>
        )}
        <SourceCorrectionReview
          preview={sourceCorrection}
          onDispose={({ eventId, action }) => disposeNotebookSourceCorrection(entry._id, { eventId, action })}
          onSettled={(result) => {
            if (result?.sourceCorrection) setSourceCorrection(result.sourceCorrection);
            onSourceCorrectionSettled?.(result);
          }}
        />
        <div className="think-notebook-editor-actions">
          <div className="think-notebook-editor-actions-left">
            {onCreate && (
              <Button variant="secondary" onClick={onCreate}>
                New page
              </Button>
            )}
            <div className="notebook-insert-group">
              <div className="notebook-insert-labels">
                <span className="notebook-insert-label">Reuse actions</span>
                <span className="notebook-insert-hint">
                  Pull saved material onto the page only when it sharpens the draft.
                </span>
              </div>
              <div className="notebook-insert-menu">
                <QuietButton
                  className={insertMenuOpen ? 'is-active' : ''}
                  aria-expanded={insertMenuOpen}
                  aria-controls="notebook-insert-options"
                  onClick={() => setInsertMenuOpen((previous) => !previous)}
                >
                  Insert material
                </QuietButton>
                {insertMenuOpen && (
                  <div
                    id="notebook-insert-options"
                    className="notebook-insert-buttons"
                    role="group"
                    aria-label="Insert from library"
                  >
                    <QuietButton
                      className={insertMode === 'highlight' ? 'is-active' : ''}
                      onClick={() => handleSelectInsertMode('highlight')}
                    >
                      Highlight
                    </QuietButton>
                    <QuietButton
                      className={insertMode === 'article' ? 'is-active' : ''}
                      onClick={() => handleSelectInsertMode('article')}
                    >
                      Article
                    </QuietButton>
                    <QuietButton
                      className={insertMode === 'concept' ? 'is-active' : ''}
                      onClick={() => handleSelectInsertMode('concept')}
                    >
                      Concept
                    </QuietButton>
                    <QuietButton
                      className={insertMode === 'question' ? 'is-active' : ''}
                      onClick={() => handleSelectInsertMode('question')}
                    >
                      Question
                    </QuietButton>
                    {usableDistinctions.length ? (
                      <UseDistinctionHere
                        distinctions={usableDistinctions}
                        startOpen={insertMode === 'distinction'}
                        onUse={applyDistinction}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="think-notebook-editor-actions-right">
            <QuietButton data-notebook-finish="export" onClick={handleExport}>Export</QuietButton>
            <QuietButton onClick={() => setOrganizeOpen(prev => !prev)}>
              {organizeOpen ? 'Close structure' : 'Structure'}
            </QuietButton>
            <details className="think-notebook-editor-actions-overflow">
              <summary className="ui-quiet-button">More</summary>
              <div className="think-notebook-editor-actions-overflow__menu">
                {onDump && (
                  <QuietButton onClick={onDump}>Dump</QuietButton>
                )}
                {onSynthesize && (
                  <QuietButton onClick={() => onSynthesize(entry)}>Synthesize</QuietButton>
                )}
                <ReturnLaterControl
                  itemType="notebook"
                  itemId={entry?._id}
                  defaultReason={titleDraft || entry?.title || 'Notebook entry'}
                />
                <QuietButton onClick={() => onDelete(entry)} disabled={saving}>Delete</QuietButton>
              </div>
            </details>
            {editingBody ? (
              <span className={`think-notebook-save-state is-${saveState}`} role="status" aria-live="polite">
                {saving || saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Could not save · retrying on your next change' : saveState === 'saved' ? 'Saved' : 'Editing'}
              </span>
            ) : (
              <QuietButton onClick={startEditingBody}>Edit</QuietButton>
            )}
          </div>
        </div>
      </div>
      {showInlineAgentDock ? (
        <AgentSkillDock
          surface="notebook"
          contextType="notebook"
          contextId={entry?._id}
          targetContextType={agentContextType}
          targetContextId={agentContextId || entry?._id}
          contextTitle={agentContextTitle || titleDraft || entry?.title || 'Notebook note'}
          headline="Draft what this page can become"
          title={AGENT_DISPLAY_NAME}
          subtitle="Use the current page as raw material for a brief, critique, concept lead, or question."
          className="think-notebook-editor__skills agent-skill-dock--inline"
          onInvoke={onInvokeAgentSkill}
        />
      ) : null}
      {error && <p className="status-message error-message">{error}</p>}
      {exportError && <p className="status-message error-message">{exportError}</p>}
      {organizeOpen && (
        <div className="notebook-organize-panel">
          <div className="notebook-organize-row">
            <label htmlFor="notebook-type-select" className="notebook-organize-label">Type</label>
            <select
              id="notebook-type-select"
              className="notebook-organize-select"
              value={entryType}
              onChange={(event) => {
                const next = event.target.value;
                setEntryType(next);
                if (next !== 'evidence') setClaimId('');
                setOrganizeError('');
              }}
            >
              {ITEM_TYPES.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="notebook-organize-row">
            <span className="notebook-organize-label">Tags</span>
            <div className="notebook-organize-tags">
              {entryTags.map(tag => (
                <button
                  type="button"
                  key={`${entry?._id}-${tag}`}
                  className="notebook-tag-chip"
                  onClick={() => removeTag(tag)}
                  title="Remove tag"
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="notebook-tag-input-row">
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag"
              />
              <QuietButton onClick={addTag}>Add tag</QuietButton>
            </div>
          </div>

          {entryType === 'evidence' && (
            <div className="notebook-organize-row">
              <span className="notebook-organize-label">Link claim</span>
              <input
                type="text"
                value={claimQuery}
                onChange={(event) => setClaimQuery(event.target.value)}
                placeholder="Search claims"
              />
              <select
                className="notebook-organize-select"
                value={claimId}
                onChange={(event) => setClaimId(event.target.value)}
              >
                <option value="">Select claim</option>
                {claimOptions.map(option => (
                  <option key={option._id} value={option._id}>
                    {option.title || 'Untitled claim'}
                  </option>
                ))}
              </select>
              {claimOptionsLoading && <p className="muted small">Loading claim options…</p>}
            </div>
          )}

          {entryType === 'claim' && (
            <div className="notebook-organize-row">
              <div className="notebook-organize-inline">
                <span className="notebook-organize-label">Evidence</span>
                <QuietButton onClick={() => setClaimEvidenceOpen(prev => !prev)}>
                  {claimEvidenceOpen ? 'Hide' : 'Show'}
                </QuietButton>
              </div>
              {entry?.type !== 'claim' && (
                <p className="muted small">Save this note as Claim to load linked evidence.</p>
              )}
              {entry?.type === 'claim' && claimEvidenceOpen && (
                <div className="notebook-organize-evidence-list">
                  {claimEvidenceLoading && <p className="muted small">Loading evidence…</p>}
                  {!claimEvidenceLoading && claimEvidenceItems.length === 0 && (
                    <p className="muted small">No evidence linked yet.</p>
                  )}
                  {!claimEvidenceLoading && claimEvidenceItems.map(item => (
                    <div key={item._id} className="notebook-organize-evidence-item">
                      <div className="notebook-organize-evidence-title">{item.title || 'Untitled note'}</div>
                      <div className="muted small">{new Date(item.updatedAt || item.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {organizeError && <p className="status-message error-message">{organizeError}</p>}
        </div>
      )}
      {/* Clicking the note is the other way in, because that is what a reader
          reaches for. Reading it does nothing at all. */}
      <div
        className={`think-notebook-editor__body${editingBody ? ' is-editing' : ''}${agentThreadPulse ? ' is-connecting-agent' : ''}`}
        onClick={startEditingBody}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) commitDraft();
        }}
      >
      <EditorDraftShell
        editor={editor}
        surfaceRef={slashSurfaceRef}
        toolbarVariant="full"
        toolbarClassName="think-notebook-editor-formatting"
        helperCopy="Type / for commands. Use arrows to choose and Enter to apply."
        hideBlockControls
        slashCommands={slashCommands}
        contextualToolbar
        onAskSelection={onInvokeAgentSkill ? handleAskSelection : null}
      />
      <NotebookArrangementRail
        editor={editor}
        visible={editingBody}
        pieces={arrangementPieces}
        currentPieceIndex={currentPieceIndex}
        asidePieces={asidePieces}
        receipt={arrangementReceipt}
        enabled={Boolean(editor)}
        onMove={handleArrangeMove}
        onUndo={handleArrangeUndo}
        onSetAside={handleSetAside}
        onRestore={handleRestoreAside}
        onDeletePiece={handleDeletePiece}
      />
      </div>
      <AuthoredWorkOrigin importMeta={entry.importMeta} sourceBlocks={entry.blocks} />
      <InsertHighlightModal
        open={insertMode === 'highlight'}
        highlights={highlights}
        loading={highlightsLoading}
        error={highlightsError}
        onClose={() => {
          referenceTriggerRef.current = null;
          setInsertMode('');
        }}
        onSelect={(highlight) => {
          handleInsertHighlight(highlight);
          setInsertMode('');
        }}
      />
      <InsertReferenceModal
        open={insertMode === 'article'}
        title="Insert Article"
        subtitle="Search by title."
        items={articles}
        getLabel={(item) => item.title || 'Untitled article'}
        getMeta={(item) => item.source || ''}
        placeholder="Search articles..."
        onClose={() => {
          referenceTriggerRef.current = null;
          setInsertMode('');
        }}
        onSelect={(item) => {
          handleInsertArticle(item);
          setInsertMode('');
        }}
      />
      <InsertReferenceModal
        open={insertMode === 'concept'}
        title="Link Concept or Wiki"
        subtitle={wikiPagesLoading ? 'Opening your living wikis…' : 'Search your accepted concepts and living wiki pages.'}
        items={conceptAndWikiTargets}
        getLabel={(item) => item.referenceKind === 'wiki' ? item.title || 'Untitled wiki' : item.name || 'Concept'}
        getMeta={(item) => item.referenceKind === 'wiki' ? `Wiki · ${item.pageType || 'general'}` : `Concept · ${item.description || 'working idea'}`}
        placeholder="Search concepts and wikis..."
        onClose={() => {
          referenceTriggerRef.current = null;
          setInsertMode('');
        }}
        onSelect={(item) => {
          if (item.referenceKind === 'wiki') handleInsertWiki(item);
          else handleInsertConcept(item);
          setInsertMode('');
        }}
      />
      <InsertReferenceModal
        open={insertMode === 'question'}
        title="Insert Question"
        subtitle="Search open questions."
        items={questions}
        getLabel={(item) => item.text || 'Question'}
        getMeta={(item) => item.linkedTagName || item.conceptName || ''}
        placeholder="Search questions..."
        onClose={() => setInsertMode('')}
        onSelect={(item) => {
          handleInsertQuestion(item);
          setInsertMode('');
        }}
      />
    </div>
  );
};

export default NotebookEditor;
