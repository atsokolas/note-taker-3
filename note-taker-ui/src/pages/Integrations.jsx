import React, { useCallback, useState } from 'react';
import api from '../api';
import { Card, Page } from '../components/ui';
import AgentQuickStartCard from '../components/integrations/AgentQuickStartCard';
import ExternalBridgeCard from '../components/integrations/ExternalBridgeCard';
import HandoffQueueCard from '../components/integrations/HandoffQueueCard';
import OrchestrationPolicyCard from '../components/integrations/OrchestrationPolicyCard';
import PersonalAgentsCard from '../components/integrations/PersonalAgentsCard';
import ReadwiseImportCard from '../components/integrations/ReadwiseImportCard';
import useHandoffs from '../hooks/useHandoffs';
import useAgentBridge from '../hooks/integrations/useAgentBridge';
import useAgentEntitlements from '../hooks/integrations/useAgentEntitlements';
import useAgentProtocolPolicy from '../hooks/integrations/useAgentProtocolPolicy';
import usePersonalAgents from '../hooks/integrations/usePersonalAgents';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const Integrations = () => {
  const [importStatus, setImportStatus] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [importing, setImporting] = useState(false);
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

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/import/readwise', formData, getAuthConfig());
      setImportStats({
        importedArticles: res.data.importedArticles || 0,
        importedHighlights: res.data.importedHighlights || 0,
        skippedRows: res.data.skippedRows || 0,
        parseErrors: res.data.parseErrors || 0
      });
      setImportStatus('Readwise import complete.');
    } catch (error) {
      console.error('Readwise import failed:', error);
      setImportStatus(error.response?.data?.error || 'Failed to import Readwise CSV.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

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

      <ReadwiseImportCard
        importing={importing}
        importStatus={importStatus}
        importStats={importStats}
        onReadwiseImport={handleReadwiseImport}
      />

      <Card className="settings-card">
        <h2>Export</h2>
        <p className="muted">
          Export notebooks or concepts as markdown directly from Think → Notebook or Think → Concepts.
        </p>
      </Card>

      <Card className="settings-card">
        <h2>Sharing</h2>
        <p className="muted">Make a concept public and share a read-only link.</p>
      </Card>
    </Page>
  );
};

export default Integrations;
