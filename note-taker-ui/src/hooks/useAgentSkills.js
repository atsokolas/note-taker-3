import { useEffect, useState } from 'react';
import { listAgentSkills } from '../api/agent';

const clean = (value) => String(value || '').trim();

const useAgentSkills = ({
  surface = '',
  contextType = '',
  category = '',
  enabled = true
} = {}) => {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setSkills([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await listAgentSkills({
          surface: clean(surface),
          contextType: clean(contextType),
          category: clean(category)
        });
        if (cancelled) return;
        setSkills(Array.isArray(result?.skills) ? result.skills : []);
      } catch (nextError) {
        if (cancelled) return;
        setSkills([]);
        setError(nextError.response?.data?.error || 'Failed to load agent skills.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [category, contextType, enabled, surface]);

  return {
    skills,
    loading,
    error
  };
};

export default useAgentSkills;
