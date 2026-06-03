import React, { useEffect, useState } from 'react';
import { Button } from '../../ui';
import QuestionBlocksEditor from './QuestionBlocksEditor';
import InsertHighlightModal from '../notebook/InsertHighlightModal';
import ReturnLaterControl from '../../return-queue/ReturnLaterControl';
import useHighlights from '../../../hooks/useHighlights';
import AgentSkillDock from '../../agent/AgentSkillDock';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const normalizeBlocks = (blocks = []) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [{ id: createId(), type: 'paragraph', text: '' }];
  }
  return blocks.map(block => {
    const challenge = block.challenge || {};
    return {
      ...block,
      id: block.id || createId(),
      type: block.type || 'paragraph',
      text: block.text || '',
      highlightId: block.highlightId || null,
      challenge: challenge.enabled
      ? {
          ...challenge,
          enabled: true,
          createdAt: challenge.createdAt || new Date().toISOString(),
          note: challenge.note || ''
        }
      : { enabled: false, createdAt: null, note: '' }
    };
  });
};

const QuestionEditor = ({
  question,
  saving,
  error,
  onSave,
  onRegisterInsert,
  onSynthesize,
  variant = 'default',
  showTitleField = true,
  onInvokeAgentSkill = null,
  agentContextType = 'question',
  agentContextId = '',
  agentContextTitle = '',
  challengeEvidenceByBlockId = {}
}) => {
  const [titleDraft, setTitleDraft] = useState('');
  const [blocksDraft, setBlocksDraft] = useState([]);
  const [insertOpen, setInsertOpen] = useState(false);
  const { highlights, loading: highlightsLoading, error: highlightsError } = useHighlights({ enabled: insertOpen });

  useEffect(() => {
    setTitleDraft(question?.text || '');
    setBlocksDraft(normalizeBlocks(question?.blocks || []));
  }, [question?.blocks, question?.text]);

  useEffect(() => {
    if (!onRegisterInsert) return;
    const insert = (highlight) => {
      setBlocksDraft(prev => [
        ...prev,
        { id: createId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ]);
    };
    onRegisterInsert(insert);
    return () => onRegisterInsert(null);
  }, [onRegisterInsert]);

  const handleSave = () => {
    if (!question) return;
    onSave({
      ...question,
      text: titleDraft.trim() || 'Untitled question',
      blocks: blocksDraft
    });
  };

  const handleInsertHighlight = (highlight) => {
    setBlocksDraft(prev => [
      ...prev,
      { id: createId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
    ]);
  };

  if (!question) {
    return (
      <div className="think-question-editor think-question-editor--empty">
        <p className="muted small">Select a question to edit.</p>
      </div>
    );
  }

  return (
    <div className={`think-question-editor${variant === 'editorial' ? ' is-editorial' : ''}`}>
      <div className="think-question-editor-header">
        {showTitleField && (
          <input
            type="text"
            className="think-question-title-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            placeholder="Untitled question"
          />
        )}
        <div className="think-question-editor-actions">
          <ReturnLaterControl
            itemType="question"
            itemId={question?._id}
            defaultReason={titleDraft || question?.text || 'Question'}
          />
          {onSynthesize && (
            <Button variant="secondary" onClick={() => onSynthesize(question)}>Synthesize</Button>
          )}
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <AgentSkillDock
        surface="question"
        contextType="question"
        contextId={question?._id}
        targetContextType={agentContextType}
        targetContextId={agentContextId || question?._id}
        contextTitle={agentContextTitle || titleDraft || question?.text || 'Question'}
        subtitle="Use a draft-first move to clarify what this question should prove or unlock."
        className={`think-question-editor__skills${variant === 'editorial' ? ' agent-skill-dock--inline' : ''}`}
        maxVisible={variant === 'editorial' ? 4 : 6}
        onInvoke={onInvokeAgentSkill}
      />
      {error && <p className="status-message error-message">{error}</p>}
      <QuestionBlocksEditor
        blocks={blocksDraft}
        onChange={setBlocksDraft}
        onInsertHighlight={() => setInsertOpen(true)}
        challengeEvidenceByBlockId={challengeEvidenceByBlockId}
      />
      <InsertHighlightModal
        open={insertOpen}
        highlights={highlights}
        loading={highlightsLoading}
        error={highlightsError}
        onClose={() => setInsertOpen(false)}
        onSelect={(highlight) => {
          handleInsertHighlight(highlight);
          setInsertOpen(false);
        }}
      />
    </div>
  );
};

export default QuestionEditor;
