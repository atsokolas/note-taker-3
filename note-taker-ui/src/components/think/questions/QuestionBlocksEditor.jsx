import React, { useMemo } from 'react';
import { Button, QuietButton } from '../../ui';
import HighlightBlock from '../../blocks/HighlightBlock';
import useHighlights from '../../../hooks/useHighlights';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const SUPPORT_SIGNALS = new Set(['support', 'supports', 'supported', 'evidence', 'pro']);
const COUNTER_SIGNALS = new Set(['counter', 'counterpoint', 'contradicts', 'contradiction', 'against', 'con']);

export const getChallengeEvidenceBalance = (block = {}) => {
  const challenge = block.challenge || {};
  const evidenceRows = [
    ...(Array.isArray(challenge.support) ? challenge.support.map(item => ({ ...item, stance: item?.stance || 'support' })) : []),
    ...(Array.isArray(challenge.supports) ? challenge.supports.map(item => ({ ...item, stance: item?.stance || 'support' })) : []),
    ...(Array.isArray(challenge.counter) ? challenge.counter.map(item => ({ ...item, stance: item?.stance || 'counter' })) : []),
    ...(Array.isArray(challenge.counters) ? challenge.counters.map(item => ({ ...item, stance: item?.stance || 'counter' })) : []),
    ...(Array.isArray(challenge.evidence) ? challenge.evidence : []),
    ...(Array.isArray(block.evidence) ? block.evidence : [])
  ];
  const counts = evidenceRows.reduce((acc, item) => {
    const stance = String(item?.stance || item?.relationType || item?.support || item?.type || '').trim().toLowerCase();
    if (SUPPORT_SIGNALS.has(stance)) acc.support += 1;
    else if (COUNTER_SIGNALS.has(stance)) acc.counter += 1;
    return acc;
  }, { support: 0, counter: 0 });
  const total = counts.support + counts.counter;
  const supportLean = total ? Math.round((counts.support / total) * 100) : 50;
  return {
    support: counts.support,
    counter: counts.counter,
    total,
    supportLean,
    counterLean: total ? 100 - supportLean : 50,
    label: total
      ? `${counts.support} support / ${counts.counter} counter`
      : 'waiting for support and counter evidence'
  };
};

const QuestionBlocksEditor = ({
  blocks,
  onChange,
  onInsertHighlight,
  challengeEvidenceByBlockId = {}
}) => {
  const { highlightMap } = useHighlights({ enabled: true });

  const handleTextChange = (index, text) => {
    const next = blocks.map((block, idx) => (
      idx === index ? { ...block, text } : block
    ));
    onChange(next);
  };

  const handleAddParagraph = () => {
    onChange([
      ...blocks,
      { id: createId(), type: 'paragraph', text: '' }
    ]);
  };

  const handleRemoveBlock = (index) => {
    const next = blocks.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [{ id: createId(), type: 'paragraph', text: '' }]);
  };

  const handleToggleChallenge = (index) => {
    const next = blocks.map((block, idx) => {
      if (idx !== index) return block;
      const enabled = !block.challenge?.enabled;
      return {
        ...block,
        challenge: enabled
          ? {
              enabled: true,
              createdAt: block.challenge?.createdAt || new Date().toISOString(),
              note: block.challenge?.note || 'Challenge this claim with support and counter-evidence.'
            }
          : { enabled: false, createdAt: null, note: '' }
      };
    });
    onChange(next);
  };

  const resolvedBlocks = useMemo(
    () => blocks.map(block => {
      if (block.type !== 'highlight-ref') return { block, highlight: null };
      const highlight = highlightMap.get(String(block.highlightId)) || {
        id: block.highlightId,
        text: block.text || 'Highlight',
        tags: [],
        articleTitle: ''
      };
      return { block, highlight };
    }),
    [blocks, highlightMap]
  );

  const getBlockWithEvidenceSignals = (block) => {
    const challengeEvidence = challengeEvidenceByBlockId?.[block.id] || {};
    const challenge = block.challenge || {};
    return {
      ...block,
      challenge: {
        ...challenge,
        support: [
          ...(Array.isArray(challenge.support) ? challenge.support : []),
          ...(Array.isArray(challengeEvidence.support) ? challengeEvidence.support : [])
        ],
        counter: [
          ...(Array.isArray(challenge.counter) ? challenge.counter : []),
          ...(Array.isArray(challengeEvidence.counter) ? challengeEvidence.counter : [])
        ]
      }
    };
  };

  return (
    <div className="think-question-blocks">
      {resolvedBlocks.map(({ block, highlight }, index) => (
        <div
          key={block.id}
          id={`question-block-${block.id}`}
          className="think-question-block"
          role="group"
          aria-label={`Question block ${index + 1}`}
          data-question-block-id={block.id}
          data-question-block-type={block.type || 'paragraph'}
          data-challenge-active={block.challenge?.enabled ? 'true' : 'false'}
        >
          {block.type === 'paragraph' ? (
            <textarea
              className="think-question-paragraph"
              rows={3}
              placeholder="Write your thinking…"
              value={block.text}
              onChange={(event) => handleTextChange(index, event.target.value)}
            />
          ) : (
            <HighlightBlock highlight={highlight} compact />
          )}
          <div className="think-question-block-actions">
            <QuietButton
              className={block.challenge?.enabled ? 'is-active' : ''}
              onClick={() => handleToggleChallenge(index)}
            >
              {block.challenge?.enabled ? 'Challenged' : 'Challenge this'}
            </QuietButton>
            <QuietButton onClick={() => handleRemoveBlock(index)}>Remove</QuietButton>
          </div>
          {block.challenge?.enabled ? (
            <div className="think-question-block__challenge-panel">
              <p className="think-question-block__challenge-note">
                Challenge active: dock support and counter-evidence beside this line.
              </p>
              {(() => {
                const balance = getChallengeEvidenceBalance(getBlockWithEvidenceSignals(block));
                return (
                  <div
                    className="think-question-block__balance-gauge"
                    aria-label={`Claim evidence balance: ${balance.label}`}
                    data-support-count={balance.support}
                    data-counter-count={balance.counter}
                    data-evidence-total={balance.total}
                    style={{ '--question-block-support-lean': `${balance.supportLean}%` }}
                  >
                    <span>Counter {balance.counterLean}%</span>
                    <i aria-hidden="true" />
                    <span>Support {balance.supportLean}%</span>
                    <strong>{balance.label}</strong>
                  </div>
                );
              })()}
            </div>
          ) : null}
        </div>
      ))}
      <div className="think-question-block-toolbar">
        <Button variant="secondary" onClick={handleAddParagraph}>Add paragraph</Button>
        <Button variant="secondary" onClick={onInsertHighlight}>Add highlight</Button>
      </div>
    </div>
  );
};

export default QuestionBlocksEditor;
