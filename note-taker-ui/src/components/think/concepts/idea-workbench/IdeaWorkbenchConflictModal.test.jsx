import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import IdeaWorkbenchConflictModal from './IdeaWorkbenchConflictModal';

const buildModel = () => ({
  conflict: {
    localState: {
      header: { title: 'Local title', prompt: 'Local prompt', stage: 'Forming' },
      cards: [{ id: 'local-card', zone: 'workspace', title: 'Local card' }],
      hypothesis: { html: '<p>Local hypothesis</p>', versions: [{ id: 'local-v1', label: 'v1' }] },
      agent: { comments: [{ id: 'local-comment' }], messages: [{ id: 'local-message' }] }
    },
    remoteState: {
      header: { title: 'Server title', prompt: 'Server prompt', stage: 'Gathering' },
      cards: [{ id: 'remote-card', zone: 'supports', title: 'Remote card' }],
      hypothesis: { html: '<p>Server hypothesis</p>', versions: [{ id: 'remote-v1', label: 'v1' }] },
      agent: { comments: [{ id: 'remote-comment' }], messages: [{ id: 'remote-message' }] }
    },
    remoteRevision: 3,
    choices: {
      header: 'local',
      cards: 'merge',
      hypothesis: 'local',
      agent: 'merge'
    },
    saving: false,
    error: ''
  },
  actions: {
    setConflictChoice: jest.fn(),
    applyConflictResolution: jest.fn(),
    dismissConflict: jest.fn()
  }
});

describe('IdeaWorkbenchConflictModal', () => {
  it('wires section choices and resolution actions', () => {
    const model = buildModel();
    render(<IdeaWorkbenchConflictModal model={model} />);

    expect(screen.getByText('Resolve workbench conflict')).toBeInTheDocument();
    expect(screen.getByText('Server rev 3')).toBeInTheDocument();

    const headerSection = screen.getByText('Idea framing').closest('.idea-workbench-conflict__section');
    fireEvent.click(within(headerSection).getByRole('button', { name: 'Use server' }));
    expect(model.actions.setConflictChoice).toHaveBeenCalledWith('header', 'remote');

    const cardsSection = screen.getByText('Workspace and evidence').closest('.idea-workbench-conflict__section');
    fireEvent.click(within(cardsSection).getByRole('button', { name: 'Use mine' }));
    expect(model.actions.setConflictChoice).toHaveBeenCalledWith('cards', 'local');

    fireEvent.click(screen.getByRole('button', { name: 'Load server version' }));
    expect(model.actions.dismissConflict).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save my version' }));
    expect(model.actions.applyConflictResolution).toHaveBeenCalledWith('local');

    fireEvent.click(screen.getByRole('button', { name: 'Save resolved version' }));
    expect(model.actions.applyConflictResolution).toHaveBeenCalledWith('merge');
  });
});
