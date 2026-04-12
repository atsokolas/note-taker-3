import { useCallback, useEffect, useState } from 'react';
import { getAgentProtocolPolicy, updateAgentProtocolPolicy } from '../../api/agent';

const useAgentProtocolPolicy = () => {
  const [protocolPolicy, setProtocolPolicy] = useState({
    routingMode: 'balanced',
    defaultByoAgentId: '',
    allowByoForResearch: true,
    allowByoForSynthesis: true,
    preferByoSpecialists: true,
    hooks: {
      beforeThreadOps: 'off',
      afterThreadOps: 'off',
      beforeHandoffOps: 'observe',
      afterHandoffOps: 'observe'
    }
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
        allowByoForSynthesis: policy.allowByoForSynthesis !== false,
        preferByoSpecialists: policy.preferByoSpecialists !== false,
        hooks: {
          beforeThreadOps: String(policy?.hooks?.beforeThreadOps || 'off'),
          afterThreadOps: String(policy?.hooks?.afterThreadOps || 'off'),
          beforeHandoffOps: String(policy?.hooks?.beforeHandoffOps || 'observe'),
          afterHandoffOps: String(policy?.hooks?.afterHandoffOps || 'observe')
        }
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
        allowByoForSynthesis: Boolean(protocolPolicy.allowByoForSynthesis),
        preferByoSpecialists: Boolean(protocolPolicy.preferByoSpecialists),
        hooks: {
          beforeThreadOps: String(protocolPolicy?.hooks?.beforeThreadOps || 'off'),
          afterThreadOps: String(protocolPolicy?.hooks?.afterThreadOps || 'off'),
          beforeHandoffOps: String(protocolPolicy?.hooks?.beforeHandoffOps || 'observe'),
          afterHandoffOps: String(protocolPolicy?.hooks?.afterHandoffOps || 'observe')
        }
      });
      const policy = response?.policy || {};
      setProtocolPolicy({
        routingMode: String(policy.routingMode || 'balanced'),
        defaultByoAgentId: String(policy.defaultByoAgentId || ''),
        allowByoForResearch: policy.allowByoForResearch !== false,
        allowByoForSynthesis: policy.allowByoForSynthesis !== false,
        preferByoSpecialists: policy.preferByoSpecialists !== false,
        hooks: {
          beforeThreadOps: String(policy?.hooks?.beforeThreadOps || 'off'),
          afterThreadOps: String(policy?.hooks?.afterThreadOps || 'off'),
          beforeHandoffOps: String(policy?.hooks?.beforeHandoffOps || 'observe'),
          afterHandoffOps: String(policy?.hooks?.afterHandoffOps || 'observe')
        }
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
