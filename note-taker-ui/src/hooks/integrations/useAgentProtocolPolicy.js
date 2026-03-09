import { useCallback, useEffect, useState } from 'react';
import { getAgentProtocolPolicy, updateAgentProtocolPolicy } from '../../api/agent';

const useAgentProtocolPolicy = () => {
  const [protocolPolicy, setProtocolPolicy] = useState({
    routingMode: 'balanced',
    defaultByoAgentId: '',
    allowByoForResearch: true,
    allowByoForSynthesis: true
  });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState('');

  const loadProtocolPolicy = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyError('');
    try {
      const response = await getAgentProtocolPolicy();
      const policy = response?.policy || {};
      setProtocolPolicy({
        routingMode: String(policy.routingMode || 'balanced'),
        defaultByoAgentId: String(policy.defaultByoAgentId || ''),
        allowByoForResearch: policy.allowByoForResearch !== false,
        allowByoForSynthesis: policy.allowByoForSynthesis !== false
      });
    } catch (error) {
      setPolicyError(error.response?.data?.error || 'Failed to load orchestration policy.');
    } finally {
      setPolicyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProtocolPolicy();
  }, [loadProtocolPolicy]);

  const handleSaveProtocolPolicy = useCallback(async () => {
    setPolicySaving(true);
    setPolicyError('');
    try {
      const response = await updateAgentProtocolPolicy({
        routingMode: protocolPolicy.routingMode,
        defaultByoAgentId: protocolPolicy.defaultByoAgentId || '',
        allowByoForResearch: Boolean(protocolPolicy.allowByoForResearch),
        allowByoForSynthesis: Boolean(protocolPolicy.allowByoForSynthesis)
      });
      const policy = response?.policy || {};
      setProtocolPolicy({
        routingMode: String(policy.routingMode || 'balanced'),
        defaultByoAgentId: String(policy.defaultByoAgentId || ''),
        allowByoForResearch: policy.allowByoForResearch !== false,
        allowByoForSynthesis: policy.allowByoForSynthesis !== false
      });
    } catch (error) {
      setPolicyError(error.response?.data?.error || 'Failed to save orchestration policy.');
    } finally {
      setPolicySaving(false);
    }
  }, [protocolPolicy]);

  return {
    protocolPolicy,
    setProtocolPolicy,
    policyLoading,
    policySaving,
    policyError,
    handleSaveProtocolPolicy
  };
};

export default useAgentProtocolPolicy;
