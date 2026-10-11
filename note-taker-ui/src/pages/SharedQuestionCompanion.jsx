import React, { useState } from 'react';
import PartnerPanel from '../agent/PartnerPanel';
import { AgentRailProvider, useContextualAgentSurface } from '../agent/AgentRailContext';
import { buildSharedQuestionCompanion } from './sharedQuestionCompanion';

const asLine = (value) => String(value || '').trim();

/* The same Partner as inside Noeis, bound to this door and nothing else. */
const DoorPartner = ({ partner }) => {
  useContextualAgentSurface('agent-surface.shared-question', {
    objectType: partner.contextType,
    objectId: partner.contextId,
    subject: partner.contextTitle,
    caption: partner.subtitle,
    askPlaceholder: partner.placeholder
  });
  return <PartnerPanel />;
};

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

  return (
    <aside className="shared-question-companion" data-testid="shared-question-companion">
      {open ? (
        <>
          <AgentRailProvider>
            <DoorPartner partner={partner} />
          </AgentRailProvider>
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
          {partner.askLabel}
        </button>
      )}
    </aside>
  );
};

export default SharedQuestionCompanion;
