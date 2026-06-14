import React, { useCallback, useState } from 'react';
import { Card, Page } from '../components/ui';
import AgentQuickStartCard from '../components/integrations/AgentQuickStartCard';
import AgentLaunchLinkCard from '../components/integrations/AgentLaunchLinkCard';
import ExternalBridgeCard from '../components/integrations/ExternalBridgeCard';
import HandoffQueueCard from '../components/integrations/HandoffQueueCard';
import OrchestrationPolicyCard from '../components/integrations/OrchestrationPolicyCard';
import PersonalAgentsCard from '../components/integrations/PersonalAgentsCard';
import WikiMcpConnectCard from '../components/integrations/WikiMcpConnectCard';
import useHandoffs from '../hooks/useHandoffs';
import useAgentBridge from '../hooks/integrations/useAgentBridge';
import useAgentEntitlements from '../hooks/integrations/useAgentEntitlements';
import useAgentProtocolPolicy from '../hooks/integrations/useAgentProtocolPolicy';
import usePersonalAgents from '../hooks/integrations/usePersonalAgents';
import DataIntegrations from './DataIntegrations';

const Integrations = () => {
  const [showAdvancedAgentSettings, setShowAdvancedAgentSettings] = useState(false);
  const [showTaskLinkBuilder, setShowTaskLinkBuilder] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState('');

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

  const handleCopySetupCommand = useCallback(async (id, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCommand(id);
      window.setTimeout(() => setCopiedCommand(current => (current === id ? '' : current)), 1800);
    } catch (error) {
      setCopiedCommand(`${id}:error`);
    }
  }, []);

  const renderCommandBlock = useCallback((id, value) => {
    const isCopied = copiedCommand === id;
    const isError = copiedCommand === `${id}:error`;
    return (
      <div className="agent-connect-simple-card__command">
        <pre>{value}</pre>
        <button
          type="button"
          className="agent-connect-simple-card__copy-button"
          onClick={() => handleCopySetupCommand(id, value)}
          aria-label={`Copy ${id.replace(/-/g, ' ')}`}
        >
          {isCopied ? 'Copied' : 'Copy'}
        </button>
        {isError ? <span role="status">Select and copy manually</span> : null}
      </div>
    );
  }, [copiedCommand, handleCopySetupCommand]);

  const handoffsModel = useHandoffs({
    enabled: true,
    personalAgentsOverride: personalAgentsModel.sortedAgents,
    initialStatusFilter: 'all'
  });

  return (
    <Page className="settings-page integrations-page">
      <div className="page-header integrations-page__header">
        <p className="muted-label">Connections</p>
        <h1>Connect sources and agents</h1>
        <p className="muted">One center for reading sources, trusted agents, and advanced bridge settings.</p>
      </div>

      <section id="sources" className="connections-section" aria-labelledby="connections-sources-heading">
        <Card className="settings-card connections-section__intro">
          <p className="muted-label">Sources</p>
          <h2 id="connections-sources-heading">Bring in your reading layer</h2>
          <p className="muted">
            Readwise browser OAuth is the primary path. Notion, Evernote, and file import stay on the same surface — API tokens live under Advanced.
          </p>
        </Card>
        <DataIntegrations embedded />
      </section>

      <section id="agents" className="connections-section" aria-labelledby="connections-agents-heading">
        <Card className="settings-card agent-connect-simple-card">
          <div className="agent-connect-simple-card__copy">
            <p className="muted-label">Agents</p>
            <h2 id="connections-agents-heading">Connect an agent to Noeis</h2>
            <p className="muted">
              Point OpenClaw, Hermes, Codex, Claude Code, or a custom worker at Noeis. The browser approval step grants access and the CLI writes the local config.
            </p>
            <ol className="agent-connect-simple-card__steps">
              <li><span>01</span> Point your agent to <a href="/skill.md">skill.md</a></li>
              <li><span>02</span> Authenticate and grant access</li>
            </ol>
          </div>

          <div className="agent-connect-simple-card__terminal" aria-label="Agent setup commands">
            <div className="agent-connect-simple-card__terminal-bar">Get started</div>
            <div className="agent-connect-simple-card__terminal-body">
              <p>Tell your agent to:</p>
              {renderCommandBlock('agent-instruction', 'Read https://www.noeis.io/skill.md and get me set up with Noeis')}
              <p>Or run:</p>
              {renderCommandBlock('npm-install', 'npm install -g @noeis/noeis-cli')}
              {renderCommandBlock('connect-openclaw', 'noeis connect openclaw')}
            </div>
            <div className="agent-connect-simple-card__runtime-row">
              <span>Works with:</span>
              <strong>OpenClaw</strong>
              <strong>Hermes</strong>
              <strong>Codex</strong>
              <strong>Claude Code</strong>
            </div>
          </div>
        </Card>

        <Card className="settings-card integrations-compact-actions">
          <button
            type="button"
            className="integrations-compact-actions__button"
            onClick={() => setShowTaskLinkBuilder((previous) => !previous)}
          >
            <span>
              <strong>Create an agent task link</strong>
              <em>Make a shareable /a/run link for a review, research pass, or wiki task.</em>
            </span>
            <b>{showTaskLinkBuilder ? 'Hide' : 'Open'}</b>
          </button>
          {showTaskLinkBuilder ? <AgentLaunchLinkCard compact /> : null}
        </Card>
      </section>

      <section id="advanced" className="connections-section" aria-labelledby="connections-advanced-heading">
        <details
          className="integrations-advanced-details"
          open={showConnectionDetails}
          onToggle={(event) => setShowConnectionDetails(event.currentTarget.open)}
        >
          <summary>
            <span>
              <strong id="connections-advanced-heading">Advanced</strong>
              <em>MCP snippets, bridge tokens, handoff queues, specialist routing, and API fallbacks.</em>
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

              <AgentQuickStartCard
                agentModel={personalAgentsModel}
                showAdvanced={showAdvancedAgentSettings}
                onToggleAdvanced={() => setShowAdvancedAgentSettings((previous) => !previous)}
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
                </>
              )}
            </>
          ) : null}
        </details>
      </section>
    </Page>
  );
};

export default Integrations;
