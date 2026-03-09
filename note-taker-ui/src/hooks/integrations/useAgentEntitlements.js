import { useCallback, useEffect, useState } from 'react';
import { getAgentEntitlements, updateAgentEntitlementsDev } from '../../api/agent';

const useAgentEntitlements = () => {
  const [entitlements, setEntitlements] = useState({
    premiumTier: 'free',
    webResearchEnabled: false,
    webResearchBetaEnabled: false,
    premiumWebResearchAvailable: false
  });
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsSaving, setEntitlementsSaving] = useState(false);
  const [entitlementsError, setEntitlementsError] = useState('');

  const loadEntitlements = useCallback(async () => {
    setEntitlementsLoading(true);
    setEntitlementsError('');
    try {
      const response = await getAgentEntitlements();
      setEntitlements({
        premiumTier: String(response?.entitlements?.premiumTier || 'free'),
        webResearchEnabled: Boolean(response?.entitlements?.webResearchEnabled),
        webResearchBetaEnabled: Boolean(response?.entitlements?.webResearchBetaEnabled),
        premiumWebResearchAvailable: Boolean(response?.entitlements?.premiumWebResearchAvailable)
      });
    } catch (error) {
      setEntitlementsError(error.response?.data?.error || 'Failed to load agent entitlements.');
    } finally {
      setEntitlementsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  const handleSetEntitlementsDev = useCallback(async (profile) => {
    setEntitlementsSaving(true);
    setEntitlementsError('');
    try {
      const response = await updateAgentEntitlementsDev(profile);
      setEntitlements({
        premiumTier: String(response?.entitlements?.premiumTier || 'free'),
        webResearchEnabled: Boolean(response?.entitlements?.webResearchEnabled),
        webResearchBetaEnabled: Boolean(response?.entitlements?.webResearchBetaEnabled),
        premiumWebResearchAvailable: Boolean(response?.entitlements?.premiumWebResearchAvailable)
      });
    } catch (error) {
      setEntitlementsError(error.response?.data?.error || 'Failed to update entitlements.');
    } finally {
      setEntitlementsSaving(false);
    }
  }, []);

  return {
    entitlements,
    entitlementsLoading,
    entitlementsSaving,
    entitlementsError,
    handleSetEntitlementsDev
  };
};

export default useAgentEntitlements;
