import React, { useEffect, useState } from 'react';
import { Page } from '../components/ui';
import AgentLaunchLinkCard from '../components/integrations/AgentLaunchLinkCard';
import ConnectionsActivity from '../components/integrations/ConnectionsActivity';
import ConnectionsAgents from '../components/integrations/ConnectionsAgents';
import ExternalBridgeCard from '../components/integrations/ExternalBridgeCard';
import HandoffQueueCard from '../components/integrations/HandoffQueueCard';
import OrchestrationPolicyCard from '../components/integrations/OrchestrationPolicyCard';
import PersonalAgentsCard from '../components/integrations/PersonalAgentsCard';
import WikiMcpConnectCard from '../components/integrations/WikiMcpConnectCard';
import useHandoffs from '../hooks/useHandoffs';
import useAgentBridge from '../hooks/integrations/useAgentBridge';
import useAgentEntitlements from '../hooks/integrations/useAgentEntitlements';
import useAgentProtocolPolicy from '../hooks/integrations/useAgentProtocolPolicy';
import useAgentTokens from '../hooks/integrations/useAgentTokens';
import usePersonalAgents from '../hooks/integrations/usePersonalAgents';
import DataIntegrations from './DataIntegrations';
import ExtensionCaptureCard from '../onboarding/ExtensionCaptureCard';

const Integrations = () => {
  const [showTaskLinkBuilder, setShowTaskLinkBuilder] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const hash = String(window.location.hash || '').replace(/^#/, '');
    return ['agents', 'activity'].includes(hash) ? hash : 'sources';
  });

  const personalAgentsModel = usePersonalAgents();
  const entitlementsModel = useAgentEntitlements();
  const policyModel = useAgentProtocolPolicy();
  const bridgeModel = useAgentBridge();
  const agentTokensModel = useAgentTokens();

  const formatDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  };

  const handoffsModel = useHandoffs({
    enabled: true,
    personalAgentsOverride: personalAgentsModel.sortedAgents,
    initialStatusFilter: 'all'
  });

  useEffect(() => {
    const syncTabFromHash = () => {
      const hash = String(window.location.hash || '').replace(/^#/, '');
      if (['sources', 'agents', 'activity'].includes(hash)) setActiveTab(hash);
      else if (['readwise', 'notion', 'evernote', 'files', 'capture'].includes(hash)) setActiveTab('sources');
    };
    window.addEventListener('hashchange', syncTabFromHash);
    window.addEventListener('popstate', syncTabFromHash);
    return () => {
      window.removeEventListener('hashchange', syncTabFromHash);
      window.removeEventListener('popstate', syncTabFromHash);
    };
  }, []);

  const selectTab = (tab) => {
    setActiveTab(tab);
    const next = `${window.location.pathname}${window.location.search}#${tab}`;
    window.history.pushState({}, '', next);
  };

  return (
    <Page className="settings-page integrations-page connections-hub">
      <header className="connections-hub__header">
        <h1>Connections</h1>
        <p>Bring your reading in. Choose who can work with it.</p>
      </header>

      <div className="connections-tabs" role="tablist" aria-label="Connections views">
        {[
          ['sources', 'Sources', ''],
          ['agents', 'Agents', agentTokensModel.sortedTokens?.length || ''],
          ['activity', 'Activity', '']
        ].map(([id, label, count]) => (
          <button
            key={id}
            id={`connections-tab-${id}`}
            type="button"
            role="tab"
            aria-controls={`connections-panel-${id}`}
            aria-selected={activeTab === id}
            tabIndex={activeTab === id ? 0 : -1}
            className={activeTab === id ? 'is-active' : ''}
            onClick={() => selectTab(id)}
          >
            {label}{count !== '' ? <small>{count}</small> : null}
          </button>
        ))}
      </div>

      <div
        id={`connections-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`connections-tab-${activeTab}`}
        className="connections-tab-panel"
      >
        {activeTab === 'sources' ? (
          <section id="sources" aria-label="Sources">
            <DataIntegrations />
            <details id="capture" className="connections-fold connections-capture">
              <summary>
                <span>
                  <strong>Browser saver</strong>
                  <small>A page or passage, while you read.</small>
                </span>
                <em>Check setup →</em>
              </summary>
              <ExtensionCaptureCard heading="Browser saver" />
            </details>
          </section>
        ) : null}

        {activeTab === 'agents' ? (
          <section id="agents" aria-label="Agents">
            <ConnectionsAgents
              tokenModel={agentTokensModel}
              onOpenTaskLink={() => setShowTaskLinkBuilder(previous => !previous)}
            />
            {showTaskLinkBuilder ? (
              <div className="connections-nested-panel">
                <AgentLaunchLinkCard compact />
              </div>
            ) : null}

            <details
              id="advanced"
              className="integrations-advanced-details connections-advanced"
              open={showConnectionDetails}
              onToggle={(event) => setShowConnectionDetails(event.currentTarget.open)}
            >
              <summary>
                <span>
                  <strong>Advanced</strong>
                  <em>Bridge tokens, handoff queues, specialist routing, and MCP details.</em>
                </span>
                <b>{showConnectionDetails ? 'Hide' : 'Show'}</b>
              </summary>
              {showConnectionDetails ? (
                <>
                  <WikiMcpConnectCard />
                  <ExternalBridgeCard
                    bridgeModel={bridgeModel}
                    sortedAgents={personalAgentsModel.sortedAgents}
                  />
                  <HandoffQueueCard
                    handoffsModel={handoffsModel}
                    sortedAgents={personalAgentsModel.sortedAgents}
                    formatDate={formatDate}
                  />
                  <PersonalAgentsCard
                    agentModel={personalAgentsModel}
                    entitlementsModel={entitlementsModel}
                    formatDate={formatDate}
                  />
                  <OrchestrationPolicyCard
                    policyModel={policyModel}
                    sortedAgents={personalAgentsModel.sortedAgents}
                  />
                </>
              ) : null}
            </details>
          </section>
        ) : null}

        {activeTab === 'activity' ? (
          <ConnectionsActivity tokens={agentTokensModel.sortedTokens} />
        ) : null}
      </div>
    </Page>
  );
};

export default Integrations;
