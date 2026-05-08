import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, SurfaceCard } from '../ui';
import {
  acceptWikiProposal,
  dismissWikiProposal,
  listWikiPages,
  listWikiProposals,
  mergeWikiProposal,
  watchWikiProposal
} from '../../api/wiki';

const labelForType = (type) => (type === 'bridge_idea' ? 'Bridge idea' : 'Recurring theme');

const confidenceLabel = (value) => {
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  return `${pct}% confidence`;
};

const WikiEmergingProposals = () => {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState([]);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [result, pageResult] = await Promise.all([
        listWikiProposals(),
        listWikiPages()
      ]);
      setProposals(result.proposals || []);
      setPages(Array.isArray(pageResult) ? pageResult : []);
    } catch (_error) {
      setError('Failed to load emerging wiki proposals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const removeProposal = (proposalId) => {
    setProposals(current => current.filter(proposal => proposal._id !== proposalId));
  };

  const handleCreate = async (proposal) => {
    setBusyId(proposal._id);
    setError('');
    try {
      const result = await acceptWikiProposal(proposal._id);
      const pageId = result?.page?._id;
      if (pageId) navigate(`/wiki/${pageId}`);
    } catch (_error) {
      setError('Failed to create wiki from proposal.');
    } finally {
      setBusyId('');
    }
  };

  const handleWatch = async (proposal) => {
    setBusyId(proposal._id);
    setError('');
    try {
      const updated = await watchWikiProposal(proposal._id);
      setProposals(current => current.map(item => item._id === proposal._id ? updated : item));
    } catch (_error) {
      setError('Failed to watch proposal.');
    } finally {
      setBusyId('');
    }
  };

  const handleDismiss = async (proposal) => {
    setBusyId(proposal._id);
    setError('');
    try {
      await dismissWikiProposal(proposal._id, '');
      removeProposal(proposal._id);
    } catch (_error) {
      setError('Failed to dismiss proposal.');
    } finally {
      setBusyId('');
    }
  };

  const handleMerge = async (proposal) => {
    const pageId = proposal.mergeTargetId || '';
    if (!pageId) return;
    setBusyId(proposal._id);
    setError('');
    try {
      await mergeWikiProposal(proposal._id, pageId);
      removeProposal(proposal._id);
    } catch (_error) {
      setError('Failed to merge proposal.');
    } finally {
      setBusyId('');
    }
  };

  const setMergeTarget = (proposalId, pageId) => {
    setProposals(current => current.map(proposal => (
      proposal._id === proposalId ? { ...proposal, mergeTargetId: pageId } : proposal
    )));
  };

  if (loading) {
    return (
      <section className="wiki-emerging wiki-emerging--loading" aria-label="Emerging Wikis">
        <header className="wiki-emerging__head">
          <span className="wiki-emerging__eyebrow">Emerging Wikis</span>
          <h2>Finding latent pages in your archive...</h2>
        </header>
      </section>
    );
  }

  if (!proposals.length && !error) return null;

  return (
    <section className="wiki-emerging" aria-label="Emerging Wikis" data-testid="wiki-emerging-proposals">
      <header className="wiki-emerging__head">
        <span className="wiki-emerging__eyebrow">Emerging Wikis</span>
        <h2>Noeis noticed ideas that may deserve pages</h2>
      </header>
      {error ? <div className="wiki-index__error" role="alert">{error}</div> : null}
      <div className="wiki-emerging__grid">
        {proposals.map(proposal => (
          <SurfaceCard key={proposal._id} className="wiki-emerging__card">
            <div className="wiki-emerging__meta">
              <span>{labelForType(proposal.proposalType)}</span>
              <span>{confidenceLabel(proposal.confidence)}</span>
            </div>
            <h3>{proposal.title}</h3>
            <p>{proposal.whyNow || proposal.summary}</p>
            <div className="wiki-emerging__signals">
              <span>{(proposal.sourceRefs || []).length} sources</span>
              <span>{((proposal.connectedPageRefs || []).length + (proposal.connectedConceptRefs || []).length)} connections</span>
            </div>
            {(proposal.starterClaims || []).length ? (
              <ul className="wiki-emerging__claims">
                {(proposal.starterClaims || []).slice(0, 2).map((claim, index) => (
                  <li key={`${proposal._id}-claim-${index}`}>{claim}</li>
                ))}
              </ul>
            ) : null}
            <div className="wiki-emerging__actions">
              <Button type="button" onClick={() => handleCreate(proposal)} disabled={busyId === proposal._id}>
                {busyId === proposal._id ? 'Creating...' : 'Create'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => handleWatch(proposal)} disabled={busyId === proposal._id}>
                Watch
              </Button>
              <select
                className="wiki-emerging__merge-select"
                value={proposal.mergeTargetId || ''}
                onChange={(event) => setMergeTarget(proposal._id, event.target.value)}
                aria-label={`Merge target for ${proposal.title}`}
              >
                <option value="">Merge into...</option>
                {pages.map(page => (
                  <option key={page._id} value={page._id}>{page.title || 'Untitled Wiki Page'}</option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={() => handleMerge(proposal)} disabled={busyId === proposal._id || !proposal.mergeTargetId}>
                Merge
              </Button>
              <Button type="button" variant="secondary" onClick={() => handleDismiss(proposal)} disabled={busyId === proposal._id}>
                Dismiss
              </Button>
            </div>
          </SurfaceCard>
        ))}
      </div>
    </section>
  );
};

export default WikiEmergingProposals;
