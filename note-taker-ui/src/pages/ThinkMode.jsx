import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useHandoffs from '../hooks/useHandoffs';
import useProtocolApprovals from '../hooks/useProtocolApprovals';
import useProtocolHookRuns from '../hooks/useProtocolHookRuns';
import HandoffsSidebar from '../components/think/handoffs/HandoffsSidebar';
import HandoffsMainPanel from '../components/think/handoffs/HandoffsMainPanel';
import ConceptPathWorkspace from '../components/paths/ConceptPathWorkspace';

// Think's two remaining ledgers: work handed to an agent, and learning paths.
// Neither is writing, so neither lives in the editor; a thread opened from
// here goes to the partner beside the page it belongs with.

const Handoffs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedHandoffId = searchParams.get('handoffId') || searchParams.get('handoff') || '';
  const openHandoff = useCallback((handoffId) => {
    if (handoffId) setSearchParams({ tab: 'handoffs', handoffId: String(handoffId) });
  }, [setSearchParams]);
  const openThread = useCallback((threadId) => {
    if (threadId) setSearchParams({ threadId: String(threadId) });
  }, [setSearchParams]);
  const approvals = useProtocolApprovals({ initialStatus: 'pending', limit: 20, autoLoad: true });
  const handoffsModel = useHandoffs({
    enabled: true,
    selectedHandoffId,
    onOpenHandoff: openHandoff,
    onOpenThread: openThread,
    onProtocolApprovalQueued: async () => { await approvals.loadProtocolApprovals?.(); }
  });
  const handoffId = handoffsModel.activeHandoffData?.handoffId || '';
  const history = useProtocolApprovals({ initialStatus: 'all', limit: 8, handoffId, autoLoad: Boolean(handoffId) });
  const hookRuns = useProtocolHookRuns({ handoffId, limit: 8, autoLoad: Boolean(handoffId) });
  return (
    <div className="think-ledger">
      <HandoffsSidebar handoffsModel={handoffsModel} onOpenHandoff={openHandoff} />
      <HandoffsMainPanel
        handoffsModel={handoffsModel}
        relatedApprovalsModel={history}
        hookRunsModel={hookRuns}
        onOpenThread={openThread}
        onOpenHandoff={openHandoff}
      />
    </div>
  );
};

const Paths = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <div className="think-ledger think-ledger--single">
      <ConceptPathWorkspace
        selectedPathId={searchParams.get('pathId') || ''}
        onSelectPath={(pathId) => setSearchParams(pathId ? { tab: 'paths', pathId } : { tab: 'paths' })}
      />
    </div>
  );
};

const ThinkMode = () => {
  const [searchParams] = useSearchParams();
  return searchParams.get('tab') === 'paths' ? <Paths /> : <Handoffs />;
};

export default ThinkMode;
