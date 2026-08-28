import React, { useState } from 'react';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import WikiCompanyDossierComposer from './WikiCompanyDossierComposer';
import WikiRepoCreateComposer from './WikiRepoCreateComposer';

const CREATION_MODES = [
  {
    id: 'wiki',
    label: 'Wiki',
    description: 'Build a general reference from your Library.'
  },
  {
    id: 'repository',
    label: 'Repo wiki',
    description: 'Maintain a developer reference from a public GitHub repository.'
  },
  {
    id: 'dossier',
    label: 'Investment dossier',
    description: 'Start company research from free SEC filings and your judgment.'
  }
];

const WikiCreationComposer = ({ className = '' }) => {
  const [mode, setMode] = useState('wiki');
  const [busyMode, setBusyMode] = useState('');
  const selected = CREATION_MODES.find(item => item.id === mode) || CREATION_MODES[0];

  const handleBusyChange = (modeId, busy) => {
    setBusyMode(current => busy ? modeId : current === modeId ? '' : current);
  };

  return (
    <section className={`wiki-creation${className ? ` ${className}` : ''}`} aria-label="Create a wiki">
      <div className="wiki-creation__modes" role="group" aria-label="Wiki type">
        {CREATION_MODES.map(item => (
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
