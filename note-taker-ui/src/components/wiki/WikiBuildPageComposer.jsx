import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRepoWikiFromGitHub, createWikiPage } from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import { buildWikiCreatePayload } from '../../utils/wikiCreate';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { parseGitHubRepoInput } from '../../utils/githubRepoInput';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { Button } from '../ui';
import AgentTicker from '../agent/AgentTicker';
import { repoWikiReceiptTitle, repoWikiSystemReceipt, displayWikiPageTitle } from './wikiRepoDossierModel';
import { buildRepoWikiTitle } from '../../utils/githubRepoInput';

const WikiBuildPageComposer = ({ className = '', compact = false, onBuilt }) => {
  const navigate = useNavigate();
  const systemStatus = useSystemStatusControls();
  const [prompt, setPrompt] = useState('');
  const [creationMode, setCreationMode] = useState('page');
  const [governingQuestion, setGoverningQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [tickerLines, setTickerLines] = useState([]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const topic = prompt.trim();
    const livingThesis = creationMode === 'living_thesis';
    const question = governingQuestion.trim();
    if (!topic || busy || (livingThesis && !question)) return;
    setBusy(true);
    setStatus('');
    setError('');
    const repo = livingThesis ? null : parseGitHubRepoInput(topic);
    setTickerLines(repo
      ? [
        `recognized repo · ${repo.fullName}`,
        'creating project wiki scaffold',
        'attaching repository docs and releases'
      ]
      : livingThesis ? [
        `opening living thesis · ${topic}`,
        'creating the empty judgment contract',
        'leaving conclusions and claims to you'
      ] : [
        `capturing topic · ${topic}`,
        'creating overview scaffold'
    ]);
    try {
      const repoResult = repo ? await createRepoWikiFromGitHub(topic) : null;
      const page = repoResult?.page || await createWikiPage(livingThesis ? {
        ...buildWikiCreatePayload({ type: 'idea', title: topic, text: topic, pageType: 'overview' }),
        preset: 'living_thesis',
        governingQuestion: question
      } : buildWikiCreatePayload({
          type: 'idea',
          title: topic,
          text: topic,
          pageType: 'overview'
        }));
      const pageId = page?._id || page?.id;
      if (!pageId) throw new Error('Missing created page id');
      if (repo) {
        const action = repoResult?.action || 'created';
        const displayPage = {
          ...page,
          externalWatches: page.externalWatches || { githubRepo: repo }
        };
        const label = displayWikiPageTitle(displayPage, buildRepoWikiTitle(repo.repo));
        systemStatus.setLatestReceipt(repoWikiSystemReceipt({ pageId, action, label }));
      }
      const repoReceiptTitle = repo ? repoWikiReceiptTitle(repoResult?.action || 'created') : '';
      const repoDisplayTitle = repo
        ? displayWikiPageTitle(
          { ...page, externalWatches: page.externalWatches || { githubRepo: repo } },
          buildRepoWikiTitle(repo.repo)
        )
        : '';
      setTickerLines([
        repo
          ? `${repoReceiptTitle.replace(/\.$/, '')} · ${repoDisplayTitle || repo.fullName}`
          : `captured topic · ${page.title || topic}`,
        `opening @wiki:${pageId}`,
        repo ? 'agent drafting from repository sources' : 'agent drafting from your library'
      ]);
      setStatus(repo ? repoReceiptTitle : `Building "${page.title || topic}"...`);
      navigate(livingThesis ? wikiPagePath(pageId) : `${wikiPagePath(pageId)}&build=1`, { replace: false });
      setPrompt('');
      if (livingThesis) setGoverningQuestion('');
      onBuilt?.(page);
      setStatus(repo
        ? repoReceiptTitle
        : `Opened the workspace. ${AGENT_DISPLAY_NAME} is drafting the page there.`);
    } catch (_error) {
      setTickerLines([
        repo ? `repo wiki failed · ${repo.fullName}` : `build failed · ${topic}`,
        'waiting for a retry'
      ]);
      setError(repo ? 'Failed to build this repo wiki.' : 'Failed to build this wiki page.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={`wiki-build-page${compact ? ' wiki-build-page--compact' : ''}${className ? ` ${className}` : ''}`}
      onSubmit={handleSubmit}
      aria-label={`Ask ${AGENT_DISPLAY_NAME.toLowerCase()} to build a page`}
    >
      {!compact ? (
        <div>
          <p className="wiki-index__eyebrow">Build with agent</p>
          <h2>Ask for a wiki page</h2>
        </div>
      ) : null}
      {!compact ? (
        <div className="wiki-build-page__mode" role="group" aria-label="Page creation type">
          <button type="button" className={creationMode === 'page' ? 'is-active' : ''} onClick={() => setCreationMode('page')}>Page</button>
          <button type="button" className={creationMode === 'living_thesis' ? 'is-active' : ''} onClick={() => setCreationMode('living_thesis')}>Living thesis</button>
        </div>
      ) : null}
      <div className="wiki-build-page__row">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={creationMode === 'living_thesis' ? 'Living thesis title' : `Ask ${AGENT_DISPLAY_NAME.toLowerCase()} to build a wiki page...`}
          aria-label={creationMode === 'living_thesis' ? 'Living thesis title' : 'Wiki page to build'}
        />
        <Button type="submit" disabled={busy || !prompt.trim() || (creationMode === 'living_thesis' && !governingQuestion.trim())}>
          {busy ? 'Building...' : creationMode === 'living_thesis' ? 'Create thesis' : 'Build page'}
        </Button>
      </div>
      {!compact && creationMode === 'living_thesis' ? (
        <div className="wiki-build-page__thesis-question">
          <label htmlFor="wiki-living-thesis-question">Governing question</label>
          <textarea id="wiki-living-thesis-question" value={governingQuestion} onChange={event => setGoverningQuestion(event.target.value)} placeholder="What consequential question will this thesis maintain?" />
          <p>No conclusion or claims will be drafted for you.</p>
        </div>
      ) : null}
      {(busy || tickerLines.length > 0) ? (
        <AgentTicker
          label="Wiki build trace"
          className="wiki-build-page__ticker"
          state={busy ? 'working' : 'idle'}
          lines={tickerLines}
        />
      ) : null}
      {status ? <p className="wiki-build-page__status" role="status">{status}</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
    </form>
  );
};

export default WikiBuildPageComposer;
