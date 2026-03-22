import React from 'react';
import { Button, QuietButton, SectionHeader, SurfaceCard, TagChip } from '../../../../components/ui';

const stripHtml = (value = '') => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const truncate = (value = '', limit = 180) => {
  const safe = String(value || '').trim();
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const countByZone = (cards = [], zone) => cards.filter(card => card.zone === zone).length;

const ChoiceGroup = ({ title, value, onChange, options }) => (
  <div className="idea-workbench-conflict__choice-group">
    <span>{title}</span>
    <div className="idea-workbench-conflict__choices">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const ComparisonBlock = ({ label, local, remote }) => (
  <div className="idea-workbench-conflict__compare">
    <div>
      <div className="idea-workbench-conflict__compare-label">
        <span>{label}</span>
        <TagChip>Yours</TagChip>
      </div>
      {local}
    </div>
    <div>
      <div className="idea-workbench-conflict__compare-label">
        <span>{label}</span>
        <TagChip>Server</TagChip>
      </div>
      {remote}
    </div>
  </div>
);

const IdeaWorkbenchConflictModal = ({ model }) => {
  const conflict = model.conflict;

  if (!conflict) return null;

  const { localState, remoteState, remoteRevision, choices, saving, error } = conflict;
  const localHypothesis = truncate(stripHtml(localState?.hypothesis?.html), 280) || 'No explicit hypothesis yet.';
  const remoteHypothesis = truncate(stripHtml(remoteState?.hypothesis?.html), 280) || 'No explicit hypothesis yet.';

  return (
    <div className="idea-workbench-conflict" role="dialog" aria-modal="true" aria-labelledby="idea-workbench-conflict-title">
      <div className="idea-workbench-conflict__backdrop" />
      <SurfaceCard className="idea-workbench-conflict__dialog">
        <SectionHeader
          title={<span id="idea-workbench-conflict-title">Resolve workbench conflict</span>}
          subtitle="Another session changed this idea before your save completed. Choose what to keep, then save a resolved version."
          action={<TagChip>Server rev {remoteRevision}</TagChip>}
        />

        <div className="idea-workbench-conflict__sections">
          <section className="idea-workbench-conflict__section">
            <ChoiceGroup
              title="Idea framing"
              value={choices.header}
              onChange={(value) => model.actions.setConflictChoice('header', value)}
              options={[
                { value: 'local', label: 'Use mine' },
                { value: 'remote', label: 'Use server' }
              ]}
            />
            <ComparisonBlock
              label="Header"
              local={(
                <div className="idea-workbench-conflict__snapshot">
                  <strong>{localState.header.title}</strong>
                  <p>{localState.header.prompt}</p>
                  <span>{localState.header.stage}</span>
                </div>
              )}
              remote={(
                <div className="idea-workbench-conflict__snapshot">
                  <strong>{remoteState.header.title}</strong>
                  <p>{remoteState.header.prompt}</p>
                  <span>{remoteState.header.stage}</span>
                </div>
              )}
            />
          </section>

          <section className="idea-workbench-conflict__section">
            <ChoiceGroup
              title="Workspace and evidence"
              value={choices.cards}
              onChange={(value) => model.actions.setConflictChoice('cards', value)}
              options={[
                { value: 'local', label: 'Use mine' },
                { value: 'merge', label: 'Merge both' },
                { value: 'remote', label: 'Use server' }
              ]}
            />
            <ComparisonBlock
              label="Cards"
              local={(
                <div className="idea-workbench-conflict__snapshot">
                  <p>{localState.cards.length} total cards</p>
                  <span>
                    {countByZone(localState.cards, 'workspace')} workspace • {countByZone(localState.cards, 'supports')} supports • {countByZone(localState.cards, 'contradictions')} contradictions • {countByZone(localState.cards, 'questions')} questions
                  </span>
                </div>
              )}
              remote={(
                <div className="idea-workbench-conflict__snapshot">
                  <p>{remoteState.cards.length} total cards</p>
                  <span>
                    {countByZone(remoteState.cards, 'workspace')} workspace • {countByZone(remoteState.cards, 'supports')} supports • {countByZone(remoteState.cards, 'contradictions')} contradictions • {countByZone(remoteState.cards, 'questions')} questions
                  </span>
                </div>
              )}
            />
          </section>

          <section className="idea-workbench-conflict__section">
            <ChoiceGroup
              title="Current hypothesis"
              value={choices.hypothesis}
              onChange={(value) => model.actions.setConflictChoice('hypothesis', value)}
              options={[
                { value: 'local', label: 'Use mine' },
                { value: 'remote', label: 'Use server' }
              ]}
            />
            <ComparisonBlock
              label="Hypothesis"
              local={(
                <div className="idea-workbench-conflict__snapshot">
                  <p>{localHypothesis}</p>
                  <span>{localState.hypothesis.versions.length} saved versions</span>
                </div>
              )}
              remote={(
                <div className="idea-workbench-conflict__snapshot">
                  <p>{remoteHypothesis}</p>
                  <span>{remoteState.hypothesis.versions.length} saved versions</span>
                </div>
              )}
            />
          </section>

          <section className="idea-workbench-conflict__section">
            <ChoiceGroup
              title="Agent context"
              value={choices.agent}
              onChange={(value) => model.actions.setConflictChoice('agent', value)}
              options={[
                { value: 'local', label: 'Use mine' },
                { value: 'merge', label: 'Merge both' },
                { value: 'remote', label: 'Use server' }
              ]}
            />
            <ComparisonBlock
              label="Agent"
              local={(
                <div className="idea-workbench-conflict__snapshot">
                  <p>{localState.agent.messages.length} chat messages</p>
                  <span>{localState.agent.comments.length} comments</span>
                </div>
              )}
              remote={(
                <div className="idea-workbench-conflict__snapshot">
                  <p>{remoteState.agent.messages.length} chat messages</p>
                  <span>{remoteState.agent.comments.length} comments</span>
                </div>
              )}
            />
          </section>
        </div>

        <div className="idea-workbench-conflict__footer">
          <div className="idea-workbench-conflict__summary">
            <p>
              `Merge both` keeps distinct cards, agent history, and saved hypothesis versions where possible. For ambiguous text, your section choice wins.
            </p>
            {error && <p className="status-message error-message">{error}</p>}
          </div>
          <div className="idea-workbench-conflict__actions">
            <QuietButton type="button" onClick={model.actions.dismissConflict} disabled={saving}>
              Load server version
            </QuietButton>
            <Button type="button" variant="secondary" onClick={() => model.actions.applyConflictResolution('local')} disabled={saving}>
              {saving ? 'Saving…' : 'Save my version'}
            </Button>
            <Button type="button" onClick={() => model.actions.applyConflictResolution('merge')} disabled={saving}>
              {saving ? 'Saving…' : 'Save resolved version'}
            </Button>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
};

export default IdeaWorkbenchConflictModal;
