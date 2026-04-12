import React, { useMemo } from 'react';
import { Button, QuietButton, TagChip } from '../../../../components/ui';

const describeEventDetail = (event) => {
  const payload = event?.payload || {};
  if (event?.type === 'agent_scout_completed') {
    return `Surfaced ${payload.count || 0} candidate item${payload.count === 1 ? '' : 's'} from the library.`;
  }
  if (event?.type === 'agent_reasoning_completed') {
    return typeof payload.relatedCount === 'number' && payload.relatedCount > 0
      ? `Reasoning pass returned ${payload.relatedCount} related suggestion${payload.relatedCount === 1 ? '' : 's'}.`
      : 'Completed a reasoning pass for the current idea.';
  }
  if (event?.type === 'agent_suggestion_accepted') {
    return 'Folded the proposal into the working draft.';
  }
  if (event?.type === 'agent_suggestion_dismissed') {
    return 'Cleared the proposal without changing the draft.';
  }
  if (event?.type === 'card_inserted_into_textbox') {
    return payload.target === 'hypothesis'
      ? 'Wove evidence directly into the draft.'
      : 'Inserted dropped material into text.';
  }
  return event?.summary || 'Workbench updated.';
};

const sortCardsByNewest = (cards = []) => [...cards].sort((left, right) => (
  new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
));

const IdeaWorkbenchAgentRail = ({ model }) => {
  const hypothesisComments = useMemo(
    () => model.state.agent.comments.filter((comment) => comment.target === 'hypothesis'),
    [model.state.agent.comments]
  );
  const recentActivity = useMemo(
    () => model.eventLog
      .filter((event) => ['agent', 'user'].includes(event.actor))
      .slice(-6)
      .reverse(),
    [model.eventLog]
  );
  const latestHypothesisComment = hypothesisComments[0] || null;
  const latestSupport = useMemo(
    () => sortCardsByNewest(model.state.cards.filter((card) => card.zone === 'supports'))[0] || null,
    [model.state.cards]
  );
  const latestAgentEvent = recentActivity.find((event) => event.actor === 'agent') || recentActivity[0] || null;
  const railTitle = model.agentModeLabel || (model.agentBusy ? 'Working' : 'Ready');
  const railSummary = latestHypothesisComment?.caption
    || latestHypothesisComment?.body
    || describeEventDetail(latestAgentEvent)
    || 'Use the lens to surface pressure, strengthen a sentence, or widen the evidence base.';
  const unresolvedQuestions = model.state.cards.filter((card) => card.zone === 'questions').slice(0, 3);
  const tensions = model.state.cards.filter((card) => card.zone === 'contradictions').slice(0, 3);
  const contextTabs = [
    { id: 'context', label: 'Context', active: Boolean(latestSupport) },
    { id: 'refinement', label: 'Refinement', active: false },
    { id: 'sources', label: 'Sources', active: false },
    { id: 'synthesis', label: 'Synthesis', active: !latestSupport }
  ];

  return (
    <div className="idea-workbench-rail">
      <header className="idea-workbench-rail__header">
        <span className="idea-workbench-rail__eyebrow">Intelligence</span>
        <h2>Marginalia layer</h2>
      </header>

      <nav className="idea-workbench-rail__nav" aria-label="Intelligence sections">
        {contextTabs.map((tab) => (
          <button key={tab.id} type="button" className={`idea-workbench-rail__nav-item ${tab.active ? 'is-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </nav>

      {model.syncError && <p className="status-message error-message">{model.syncError}</p>}
      {model.agentError && <p className="status-message error-message">{model.agentError}</p>}

      <section className="idea-workbench-rail__section">
        <div className="idea-workbench-rail__section-heading">
          <h3>Synthesis</h3>
          <span>{railTitle}</span>
        </div>
        <div className="idea-workbench-rail__comment">
          <div className="idea-workbench-rail__comment-header">
            <strong>{latestHypothesisComment?.title || 'Current pass'}</strong>
            <div className="idea-workbench-rail__comment-badges">
              {latestHypothesisComment?.tone && <TagChip>{latestHypothesisComment.tone}</TagChip>}
            </div>
          </div>
          <p>{railSummary}</p>
        </div>
      </section>

      <section className="idea-workbench-rail__section">
        <div className="idea-workbench-rail__section-heading">
          <h3>Semantic source</h3>
          <span>Supporting material</span>
        </div>
        <div className="idea-workbench-rail__focus-list">
          <div>
            <span>{latestSupport?.title || 'No source elevated yet.'}</span>
            <strong>{latestSupport?.content || 'Pull support into the draft to attach evidence to a sentence.'}</strong>
          </div>
        </div>
      </section>

      <section className="idea-workbench-rail__section">
        <div className="idea-workbench-rail__section-heading">
          <h3>Active tensions</h3>
          <span>Pressure still visible</span>
        </div>
        <div className="idea-workbench-rail__events">
          {tensions.length === 0 ? (
            <div className="idea-workbench-rail__event idea-workbench-rail__event--empty">
              <p>No contradiction is staged.</p>
            </div>
          ) : (
            tensions.map((card) => (
              <div key={card.id} className="idea-workbench-rail__event idea-workbench-rail__event--agent">
                <div className="idea-workbench-rail__event-head">
                  <strong>{card.title}</strong>
                  <TagChip>Conflict</TagChip>
                </div>
                <p>{card.content}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="idea-workbench-rail__section">
        <div className="idea-workbench-rail__section-heading">
          <h3>Unresolved questions</h3>
          <span>What still needs an answer</span>
        </div>
        <div className="idea-workbench-rail__events">
          {unresolvedQuestions.length === 0 ? (
            <div className="idea-workbench-rail__event idea-workbench-rail__event--empty">
              <p>No open question is staged.</p>
            </div>
          ) : (
            unresolvedQuestions.map((card) => (
              <div key={card.id} className="idea-workbench-rail__event idea-workbench-rail__event--user">
                <div className="idea-workbench-rail__event-head">
                  <strong>{card.title}</strong>
                </div>
                <p>{card.content}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {latestHypothesisComment?.kind === 'hypothesis-suggestion' && (
        <section className="idea-workbench-rail__section">
          <div className="idea-workbench-rail__section-heading">
            <h3>Suggested revision</h3>
            <span>Most recent proposal</span>
          </div>
          <div className="idea-workbench-rail__comment">
            {latestHypothesisComment.anchorText && (
              <p className="idea-workbench-rail__comment-anchor">On: “{latestHypothesisComment.anchorText}”</p>
            )}
            <p>{latestHypothesisComment.body}</p>
            <div className="idea-workbench-rail__suggestion-actions">
              <Button type="button" variant="secondary" onClick={() => model.actions.acceptAgentComment(latestHypothesisComment.id)}>
                Blend into draft
              </Button>
              <QuietButton type="button" onClick={() => model.actions.dismissAgentComment(latestHypothesisComment.id)}>
                Dismiss
              </QuietButton>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default IdeaWorkbenchAgentRail;
