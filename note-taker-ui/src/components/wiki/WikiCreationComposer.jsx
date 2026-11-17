import React, { useState } from 'react';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiCompanyDossierComposer from './WikiCompanyDossierComposer';
import WikiRepoCreateComposer from './WikiRepoCreateComposer';
import '../../styles/wiki-creation.css';

const CREATION_MODES = [
  {
    id: 'wiki',
    label: 'Wiki',
    description: 'A page on anything you have read about, written from your Library with every source cited.'
  },
  {
    id: 'repository',
    label: 'Repo wiki',
    description: 'Maintain a developer reference from a public GitHub repository.'
  },
  {
    id: 'dossier',
    label: 'Investment dossier',
    description: 'Track a public company from its SEC filings, checked figure by figure.'
  }
];

/* `kinds` narrows the choice: an empty Wiki offers only a page, since a
   repository reference or a company dossier is not where anyone starts. */
const WikiCreationComposer = ({ className = '', initialMode = 'wiki', kinds }) => {
  const [mode, setMode] = useState(initialMode);
  const modes = kinds ? CREATION_MODES.filter(item => kinds.includes(item.id)) : CREATION_MODES;
  const [busyMode, setBusyMode] = useState('');
  const selected = CREATION_MODES.find(item => item.id === mode) || CREATION_MODES[0];

  const handleBusyChange = (modeId, busy) => {
    setBusyMode(current => busy ? modeId : current === modeId ? '' : current);
  };

  return (
    <section className={`wiki-creation${className ? ` ${className}` : ''}`} aria-label="Create a wiki">
      {modes.length > 1 ? (
        <div className="wiki-creation__modes" role="group" aria-label="Wiki type">
          {modes.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              disabled={Boolean(busyMode) && mode !== item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="wiki-creation__description">{selected.description}</p>
      <div className="wiki-creation__panel">
        <div hidden={mode !== 'wiki'}>
          <WikiBuildPageComposer
            compact
            className="wiki-front-page__builder"
            onBusyChange={busy => handleBusyChange('wiki', busy)}
          />
        </div>
        <div hidden={mode !== 'repository'}>
          <WikiRepoCreateComposer
            compact
            className="wiki-front-page__repo-builder"
            onBusyChange={busy => handleBusyChange('repository', busy)}
          />
        </div>
        <div hidden={mode !== 'dossier'}>
          <WikiCompanyDossierComposer
            embedded
            className="wiki-front-page__company-builder"
            onBusyChange={busy => handleBusyChange('dossier', busy)}
          />
        </div>
      </div>
    </section>
  );
};

export default WikiCreationComposer;
