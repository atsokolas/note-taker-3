import React, { useState } from 'react';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import { mandateBudgetLine } from '../components/think/thinkShareFixture';
import { buildSharedQuestionCompanion } from './sharedQuestionCompanion';

const asLine = (value) => String(value || '').trim();

const SharedQuestionCompanion = ({
  slug,
  page,
  signedIn = false,
  defaultOpen = false
}) => {
  const partner = buildSharedQuestionCompanion({ slug, page });
  const [open, setOpen] = useState(Boolean(defaultOpen));
  if (!signedIn || !partner) return null;
  const mandate = page?.mandate && typeof page.mandate === 'object' ? page.mandate : null;
  const pause = asLine(mandate?.pause) || (mandate?.status === 'paused' ? 'The agent is paused.' : '');
  if (pause) {
    return (
      <aside className="shared-question-companion" data-testid="shared-question-companion">
        <p className="shared-question-companion__pause" role="status">
          {pause}
        </p>
      </aside>
    );
  }
  const remaining = mandate?.status === 'live' ? mandateBudgetLine(mandate) : '';

  return (
    <aside className="shared-question-companion" data-testid="shared-question-companion">
      {open ? (
        <>
          <ThoughtPartnerPanel
            contextType={partner.contextType}
            contextId={partner.contextId}
            contextTitle={partner.contextTitle}
            subtitle={partner.subtitle}
            placeholder={partner.placeholder}
            emptyStateText={partner.emptyStateText}
            promptTemplates={partner.promptTemplates}
            title="Ask about this reading"
            submitLabel="Ask"
          />
          {remaining ? (
            <p className="shared-question-companion__budget muted small">{remaining}</p>
          ) : null}
          <button
            type="button"
            className="shared-question-companion__away"
            onClick={() => setOpen(false)}
          >
            Put this away
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="shared-question-companion__ask"
            onClick={() => setOpen(true)}
          >
            Ask about this reading
          </button>
          {remaining ? (
            <p className="shared-question-companion__budget muted small">{remaining}</p>
          ) : null}
        </>
      )}
    </aside>
  );
};

export default SharedQuestionCompanion;
