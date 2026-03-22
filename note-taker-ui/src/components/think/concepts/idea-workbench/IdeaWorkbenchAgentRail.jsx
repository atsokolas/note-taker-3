import React, { useMemo, useState } from 'react';
import { Button, QuietButton, SectionHeader, SurfaceCard, TagChip } from '../../../../components/ui';

const EVENT_LABELS = {
  workspace_card_added: 'Workspace note added',
  material_imported: 'Material imported',
  card_moved: 'Card reclassified',
  card_inserted_into_textbox: 'Material inserted into text',
  hypothesis_version_saved: 'Hypothesis version saved',
  quick_action_requested: 'Quick action requested',
  agent_scout_completed: 'Scout completed',
  agent_reasoning_completed: 'Reasoning completed',
  chat_user_message: 'Question sent',
  chat_agent_reply: 'Agent replied',
  chat_agent_fallback: 'Fallback reply',
  conflict_resolved: 'Conflict resolved',
  agent_suggestion_accepted: 'Agent suggestion accepted',
  agent_suggestion_dismissed: 'Agent suggestion dismissed'
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
    return 'Cleared the proposal without changing the hypothesis.';
  }
  if (event?.type === 'card_inserted_into_textbox') {
    return payload.target === 'hypothesis'
      ? 'Wove evidence directly into the draft.'
      : 'Inserted dropped material into text.';
  }
  return event?.summary || 'Workbench updated.';
};

const IdeaWorkbenchAgentRail = ({ model }) => {
  const [chatDraft, setChatDraft] = useState('');
  const recentMessages = useMemo(
    () => model.state.agent.messages.slice(-4),
    [model.state.agent.messages]
  );
  const recentActivity = useMemo(
    () => model.eventLog
      .filter((event) => ['agent', 'user'].includes(event.actor))
      .slice(-5)
      .reverse(),
    [model.eventLog]
  );
  const pendingSuggestionCount = useMemo(
    () => model.state.agent.comments.filter((comment) => comment.kind === 'hypothesis-suggestion').length,
    [model.state.agent.comments]
  );

  return (
    <div className="idea-workbench-rail">
      <SurfaceCard className="idea-workbench-rail__card idea-workbench-rail__card--desk">
        <SectionHeader
          title="Agent desk"
          subtitle="Chat, status, and the latest workbench moves in one place."
        />

        <div className="idea-workbench-rail__status-row">
          <div className="idea-workbench-rail__status-pill">
            <span>State</span>
            <strong>{model.agentModeLabel || (model.agentBusy ? 'Working' : 'Ready')}</strong>
          </div>
          <div className="idea-workbench-rail__status-pill">
            <span>Pending proposals</span>
            <strong>{pendingSuggestionCount}</strong>
          </div>
          {model.serverRevision > 0 && (
            <div className="idea-workbench-rail__status-pill">
              <span>Revision</span>
              <strong>{model.serverRevision}</strong>
            </div>
          )}
        </div>

        {model.syncError && <p className="status-message error-message">{model.syncError}</p>}
        {model.agentError && <p className="status-message error-message">{model.agentError}</p>}

        <div className="idea-workbench-rail__section">
          <div className="idea-workbench-rail__section-header">
            <h3>Conversation</h3>
            <span>Context-aware chat</span>
          </div>

          <div className="idea-workbench-rail__thread">
            {recentMessages.map((message) => (
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
                    {message.suggestedCards.slice(0, 2).map((card) => (
                      <div key={card.id} className="idea-workbench-rail__suggestion">
                        <div>
                          <strong>{card.title}</strong>
                          <p>{card.content}</p>
                        </div>
                        <div className="idea-workbench-rail__suggestion-actions">
                          <QuietButton type="button" onClick={() => model.actions.addSuggestedCard(card, 'workspace')}>
                            Add to material
                          </QuietButton>
                          <QuietButton type="button" onClick={() => model.actions.addSuggestedCard(card, 'supports')}>
                            Support
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
              placeholder="Ask what changed, what is weak, or what the draft should answer next."
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
        </div>

        <div className="idea-workbench-rail__divider" />

        <div className="idea-workbench-rail__section">
          <div className="idea-workbench-rail__section-header">
            <h3>Recent moves</h3>
            <span>What the agent and workbench just did</span>
          </div>

          <div className="idea-workbench-rail__activity idea-workbench-rail__activity--compact">
            {recentActivity.length === 0 && (
              <div className="idea-workbench-rail__event idea-workbench-rail__event--empty">
                <p>No activity recorded yet.</p>
              </div>
            )}

            {recentActivity.map((event) => (
              <div key={event.id} className={`idea-workbench-rail__event idea-workbench-rail__event--${event.actor || 'system'}`}>
                <div className="idea-workbench-rail__event-header">
                  <div className="idea-workbench-rail__event-titles">
                    <h4>{EVENT_LABELS[event.type] || 'Workbench update'}</h4>
                    <p>{describeEventDetail(event)}</p>
                  </div>
                  <TagChip>{event.actor || 'system'}</TagChip>
                </div>
                <div className="idea-workbench-rail__event-meta">
                  <span>{formatEventTime(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
};

export default IdeaWorkbenchAgentRail;
