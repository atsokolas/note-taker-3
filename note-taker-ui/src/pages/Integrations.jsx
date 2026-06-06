import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
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

const Integrations = () => {
  const [showAdvancedAgentSettings, setShowAdvancedAgentSettings] = useState(false);
  const [showTaskLinkBuilder, setShowTaskLinkBuilder] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);

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
    <Page className="settings-page integrations-page">
      <div className="page-header integrations-page__header">
        <p className="muted-label">Agents</p>
        <h1>Integrations</h1>
        <p className="muted">Give an agent one instruction, or run one command yourself.</p>
      </div>

      <Card className="settings-card agent-connect-simple-card">
        <div className="agent-connect-simple-card__copy">
          <p className="muted-label">Get started</p>
          <h2>Connect an agent to Noeis</h2>
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
            <pre>{'Read https://www.noeis.io/skill.md and get me set up with Noeis'}</pre>
            <p>Current internal build:</p>
            <pre>{'cd ~/Documents/GitHub/note-taker-3-1\nnpm install -g ./packages/cli'}</pre>
            <pre>{'noeis connect openclaw'}</pre>
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

      <details
        className="integrations-advanced-details"
        open={showConnectionDetails}
        onToggle={(event) => setShowConnectionDetails(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>Advanced connection details</strong>
            <em>MCP snippets, bridge tokens, handoff queues, specialist routing, and data integrations.</em>
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

            <Card className="settings-card">
              <h2>Data integrations</h2>
              <p className="muted">Manual notes, direct paste capture, and Readwise/markdown imports live on a dedicated page.</p>
              <Link to="/data-integrations" className="ui-button ui-button-secondary">
                Open data integrations
              </Link>
            </Card>
          </>
        ) : null}
      </details>
    </Page>
  );
};

export default Integrations;
