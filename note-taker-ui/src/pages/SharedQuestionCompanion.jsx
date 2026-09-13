import React, { useState } from 'react';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import { buildSharedQuestionCompanion } from './sharedQuestionCompanion';

const SharedQuestionCompanion = ({
  slug,
  page,
  signedIn = false,
  defaultOpen = false
}) => {
  const partner = buildSharedQuestionCompanion({ slug, page });
  const [open, setOpen] = useState(Boolean(defaultOpen));
  if (!signedIn || !partner) return null;

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
          <button
            type="button"
            className="shared-question-companion__away"
            onClick={() => setOpen(false)}
          >
            Put this away
          </button>
        </>
      ) : (
        <button
          type="button"
          className="shared-question-companion__ask"
          onClick={() => setOpen(true)}
        >
          Ask about this reading
        </button>
      )}
    </aside>
  );
};

export default SharedQuestionCompanion;
