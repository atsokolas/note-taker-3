import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Page } from '../components/ui';
import AgentQuickStartCard from '../components/integrations/AgentQuickStartCard';
import ExternalBridgeCard from '../components/integrations/ExternalBridgeCard';
import HandoffQueueCard from '../components/integrations/HandoffQueueCard';
import OrchestrationPolicyCard from '../components/integrations/OrchestrationPolicyCard';
import PersonalAgentsCard from '../components/integrations/PersonalAgentsCard';
import useHandoffs from '../hooks/useHandoffs';
import useAgentBridge from '../hooks/integrations/useAgentBridge';
import useAgentEntitlements from '../hooks/integrations/useAgentEntitlements';
import useAgentProtocolPolicy from '../hooks/integrations/useAgentProtocolPolicy';
import usePersonalAgents from '../hooks/integrations/usePersonalAgents';

const Integrations = () => {
  const [showAdvancedAgentSettings, setShowAdvancedAgentSettings] = useState(false);

  const personalAgentsModel = usePersonalAgents();
  const entitlementsModel = useAgentEntitlements();
  const policyModel = useAgentProtocolPolicy();
  const bridgeModel = useAgentBridge();

  const formatDate = useCallback((value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  }, []);

  const handoffsModel = useHandoffs({
    enabled: true,
    personalAgentsOverride: personalAgentsModel.sortedAgents,
    initialStatusFilter: 'all'
  });

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Integrations</h1>
        <p className="muted">Set up agents fast, then unlock advanced BYO integrations when needed.</p>
      </div>

      <AgentQuickStartCard
        agentModel={personalAgentsModel}
        showAdvanced={showAdvancedAgentSettings}
        onToggleAdvanced={() => setShowAdvancedAgentSettings((previous) => !previous)}
      />

      <HandoffQueueCard
        handoffsModel={handoffsModel}
        sortedAgents={personalAgentsModel.sortedAgents}
        formatDate={formatDate}
      />

      {showAdvancedAgentSettings && (
        <>
          <PersonalAgentsCard
            agentModel={personalAgentsModel}
            entitlementsModel={entitlementsModel}
            formatDate={formatDate}
          />

          <OrchestrationPolicyCard
            policyModel={policyModel}
            sortedAgents={personalAgentsModel.sortedAgents}
          />

          <ExternalBridgeCard
            bridgeModel={bridgeModel}
            sortedAgents={personalAgentsModel.sortedAgents}
          />
        </>
      )}

      <Card className="settings-card">
        <h2>Data integrations</h2>
        <p className="muted">Manual notes, direct paste capture, and Readwise/markdown imports live on a dedicated page.</p>
        <Link to="/data-integrations" className="ui-button ui-button-secondary">
          Open data integrations
        </Link>
      </Card>
    </Page>
  );
};

export default Integrations;
