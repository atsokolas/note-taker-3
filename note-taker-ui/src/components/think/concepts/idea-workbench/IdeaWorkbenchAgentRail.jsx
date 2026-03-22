import React, { useMemo, useState } from 'react';
import { Button, QuietButton, SectionHeader, SurfaceCard, TagChip } from '../../../../components/ui';

const QUICK_ACTIONS = [
  { id: 'find-supports', label: 'Find Supports' },
  { id: 'find-contradictions', label: 'Find Contradictions' },
  { id: 'analyze-patterns', label: 'Analyze Patterns' },
  { id: 'propose-hypothesis', label: 'Propose Hypothesis' },
  { id: 'challenge-hypothesis', label: 'Challenge Hypothesis' }
];

const EVENT_LABELS = {
  workspace_card_added: 'Workspace note added',
  material_imported: 'Material imported',
  card_moved: 'Card reclassified',
  hypothesis_version_saved: 'Hypothesis version saved',
  quick_action_requested: 'Quick action requested',
  agent_scout_completed: 'Scout completed',
  agent_reasoning_completed: 'Reasoning completed',
  chat_user_message: 'Question sent',
  chat_agent_reply: 'Agent replied',
  chat_agent_fallback: 'Fallback reply',
  conflict_resolved: 'Conflict resolved'
};

const formatEventTime = (value) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '';
  const deltaMinutes = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 60000));
  if (deltaMinutes < 1) return 'Just now';
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  if (deltaMinutes < 1440) return `${Math.round(deltaMinutes / 60)}h ago`;
  return timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const describeEventFocus = (event) => {
  const payload = event?.payload || {};
  if (payload.action) return payload.action.replace(/-/g, ' ');
  if (payload.zone) return payload.zone;
  if (payload.kind) return payload.kind;
  if (typeof payload.count === 'number') return `${payload.count} items`;
  if (typeof payload.relatedCount === 'number') return `${payload.relatedCount} related`;
  if (typeof payload.suggestedCount === 'number') return `${payload.suggestedCount} suggestions`;
  return '';
};

const describeEventDetail = (event) => {
  const payload = event?.payload || {};
  if (event?.type === 'agent_scout_completed') {
    return `Scoped the library${typeof payload.count === 'number' ? ` and surfaced ${payload.count} candidate ${payload.count === 1 ? 'item' : 'items'}` : ''}.`;
  }
  if (event?.type === 'agent_reasoning_completed') {
    return `Completed a reasoning pass${typeof payload.relatedCount === 'number' && payload.relatedCount > 0 ? ` with ${payload.relatedCount} related card suggestion${payload.relatedCount === 1 ? '' : 's'}` : ''}.`;
  }
  if (event?.type === 'chat_agent_reply' || event?.type === 'chat_agent_fallback') {
    return typeof payload.suggestedCount === 'number' && payload.suggestedCount > 0
      ? `Returned ${payload.suggestedCount} suggested card${payload.suggestedCount === 1 ? '' : 's'} with the reply.`
      : 'Returned a reply without suggested cards.';
  }
  if (event?.type === 'card_moved' && payload.zone) {
    return `Reclassified material into ${payload.zone}.`;
  }
  if (event?.type === 'material_imported' && payload.kind) {
    return `Pulled a saved ${payload.kind} into the active workspace.`;
  }
  if (event?.type === 'conflict_resolved' && payload.mode) {
    return payload.mode === 'merge'
      ? 'Saved a merged workbench after reconciling local and server changes.'
      : payload.mode === 'local'
        ? 'Saved the local draft over the newer server copy.'
        : 'Accepted the newer server copy.';
  }
  return '';
};

const IdeaWorkbenchAgentRail = ({ model }) => {
  const [chatDraft, setChatDraft] = useState('');
  const comments = useMemo(
    () => model.state.agent.comments.slice(0, 6),
    [model.state.agent.comments]
  );
  const activity = useMemo(
    () => model.eventLog.slice(-10).reverse(),
    [model.eventLog]
  );

  return (
    <div className="idea-workbench-rail">
      <SurfaceCard className="idea-workbench-rail__card">
        <SectionHeader
          title="AI agent"
          subtitle="A collaborator focused on the current idea page."
        />
        {model.agentModeLabel && <p className="muted small">{model.agentModeLabel}…</p>}
        {model.syncError && <p className="status-message error-message">{model.syncError}</p>}

        <div className="idea-workbench-rail__quick-actions">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="secondary"
              onClick={() => model.actions.runQuickAction(action.id)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="idea-workbench-rail__card">
        <SectionHeader
          title="Chat"
          subtitle="Ask freely in the context of this idea."
        />

        <div className="idea-workbench-rail__thread">
          {model.state.agent.messages.map((message) => (
            <div
              key={message.id}
              className={`idea-workbench-rail__message ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`}
            >
              <span className="idea-workbench-rail__message-role">
                {message.role === 'assistant' ? 'Agent' : 'You'}
              </span>
              <p>{message.text}</p>
              {Array.isArray(message.suggestedCards) && message.suggestedCards.length > 0 && (
                <div className="idea-workbench-rail__message-actions">
                  {message.suggestedCards.map((card) => (
                    <div key={card.id} className="idea-workbench-rail__suggestion">
                      <div>
                        <strong>{card.title}</strong>
                        <p>{card.content}</p>
                      </div>
                      <div className="idea-workbench-rail__suggestion-actions">
                        <QuietButton type="button" onClick={() => model.actions.addSuggestedCard(card, 'workspace')}>
                          Add to workspace
                        </QuietButton>
                        <QuietButton type="button" onClick={() => model.actions.addSuggestedCard(card, 'supports')}>
                          Add to supports
                        </QuietButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="idea-workbench-rail__composer">
          <textarea
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            placeholder="Ask what is weak, what is missing, what pattern is emerging, or how the hypothesis should change."
            rows={4}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={model.agentBusy || !chatDraft.trim()}
            onClick={async () => {
              const nextMessage = chatDraft;
              setChatDraft('');
              await model.actions.sendAgentMessage(nextMessage);
            }}
          >
            {model.agentBusy ? 'Thinking…' : 'Send'}
          </Button>
        </div>
        {model.agentError && <p className="status-message error-message">{model.agentError}</p>}
      </SurfaceCard>

      <SurfaceCard className="idea-workbench-rail__card">
        <SectionHeader
          title="Agent comments"
          subtitle="Comments about weak points, missing evidence, and contradictions."
        />

        <div className="idea-workbench-rail__comments">
          {comments.map((comment) => (
            <div key={comment.id} className={`idea-workbench-rail__comment idea-workbench-rail__comment--${comment.tone}`}>
              <div className="idea-workbench-rail__comment-header">
                <h4>{comment.title}</h4>
                <TagChip>{comment.target}</TagChip>
              </div>
              {comment.anchorText && <p className="idea-workbench-rail__comment-anchor">“{comment.anchorText}”</p>}
              <p>{comment.body}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="idea-workbench-rail__card">
        <SectionHeader
          title="Activity"
          subtitle="A live trace of how the idea, evidence, and agent interaction evolved."
        />
        {model.serverRevision > 0 && (
          <p className="idea-workbench-rail__activity-status">Server revision {model.serverRevision}</p>
        )}

        <div className="idea-workbench-rail__activity">
          {activity.length === 0 && (
            <div className="idea-workbench-rail__event idea-workbench-rail__event--empty">
              <p>No activity recorded yet.</p>
            </div>
          )}

          {activity.map((event) => {
            const focus = describeEventFocus(event);
            const detail = describeEventDetail(event);
            return (
              <div key={event.id} className={`idea-workbench-rail__event idea-workbench-rail__event--${event.actor || 'system'}`}>
                <div className="idea-workbench-rail__event-header">
                  <div className="idea-workbench-rail__event-titles">
                    <h4>{EVENT_LABELS[event.type] || 'Workbench update'}</h4>
                    <p>{event.summary || 'Activity recorded.'}</p>
                  </div>
                  <TagChip>{event.actor || 'system'}</TagChip>
                </div>
                {detail && <p className="idea-workbench-rail__event-detail">{detail}</p>}
                <div className="idea-workbench-rail__event-meta">
                  {focus && <span>{focus}</span>}
                  <span>{formatEventTime(event.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </SurfaceCard>
    </div>
  );
};

export default IdeaWorkbenchAgentRail;
