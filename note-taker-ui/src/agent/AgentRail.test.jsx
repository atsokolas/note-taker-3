import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AgentRail from './AgentRail';
import { AgentRailProvider, useContextualAgentSurface } from './AgentRailContext';
import { hasContextualAgentRail } from './contextualAgentContracts';

// A stand-in for a page: it registers a surface with the rail and records what
// the rail hands back when the human accepts.
const Surface = ({ id, subject, empty, onAsk, accepted }) => {
  useContextualAgentSurface(
    'agent-surface.judgment',
    { objectType: 'claim', objectId: id, subject, empty },
    {
      onAsk,
      onAccept: (proposal, field) => accepted.push({ text: proposal.body, field })
    }
  );
  return <p>column: {subject}</p>;
};

const Column = ({ accepted, onAsk }) => {
  const [surface, setSurface] = useState('a');
  return (
    <>
      <button type="button" onClick={() => setSurface(surface === 'a' ? 'b' : 'a')}>Navigate</button>
      {surface === 'a'
        ? <Surface id="a" subject="The first claim." empty="Nothing to retrieve until you ask." onAsk={onAsk} accepted={accepted} />
        : <Surface id="b" subject="The second claim." empty="Nothing to retrieve until you ask." onAsk={onAsk} accepted={accepted} />}
    </>
  );
};

const renderRail = ({ onAsk = jest.fn(), accepted = [] } = {}) => {
  const utils = render(
    <AgentRailProvider>
      <Column accepted={accepted} onAsk={onAsk} />
      <AgentRail />
    </AgentRailProvider>
  );
  return { ...utils, accepted, rail: () => screen.getByRole('complementary', { name: 'Agent' }) };
};

const ProjectionToggle = () => {
  const [embedded, setEmbedded] = useState(false);
  useContextualAgentSurface('agent-surface.wiki', {
    objectType: 'wiki_page',
    objectId: 'wiki-1',
    subject: 'A Wiki page.'
  }, {});
  return (
    <>
      <button type="button" onClick={() => setEmbedded(current => !current)}>Swap projection</button>
      {embedded ? <div data-testid="embedded-agent">Embedded Wiki agent</div> : <AgentRail />}
    </>
  );
};

describe('AgentRail', () => {
  it('says what it is for without branding itself', () => {
    const { rail } = renderRail();

    expect(rail()).toHaveAttribute('data-agent-contract', 'agent-surface.judgment');
    expect(rail()).toHaveAttribute('data-agent-presentation', 'rail');
    expect(rail()).toHaveAttribute('data-agent-actions', expect.stringContaining('accept.against'));
    expect(rail()).toHaveAttribute('data-agent-proposal-policy', 'human_acceptance');
    expect(within(rail()).getByText('Agent')).toBeInTheDocument();
    expect(within(rail()).getByText('Retrieves. You accept.')).toBeInTheDocument();
    expect(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight')).toBeInTheDocument();
    expect(within(rail()).queryByText(/thought partner/i)).not.toBeInTheDocument();
  });

  it('says nothing is there in a sentence rather than an empty box', () => {
    const { rail } = renderRail();

    expect(within(rail()).getByText('Nothing to retrieve until you ask.')).toBeInTheDocument();
  });

  it('explains when the current surface has no retrieval handler', async () => {
    render(
      <AgentRailProvider>
        <ProjectionToggle />
      </AgentRailProvider>
    );
    const rail = screen.getByRole('complementary', { name: 'Agent' });
    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'What changed?' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));
    expect(await within(rail).findByRole('alert')).toHaveTextContent('nothing to ask against');
  });

  it('survives a column change and follows the new subject', async () => {
    const { rail } = renderRail();

    expect(await within(rail()).findByText('The first claim.')).toBeInTheDocument();
    const input = within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight');

    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));

    // Same DOM node: the rail did not unmount and come back.
    expect(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight')).toBe(input);
    expect(await within(rail()).findByText('The second claim.')).toBeInTheDocument();
    expect(within(rail()).queryByText('The first claim.')).not.toBeInTheDocument();
  });

  it('keeps an unfinished rail draft while Wiki temporarily uses the embedded projection', () => {
    render(
      <AgentRailProvider>
        <ProjectionToggle />
      </AgentRailProvider>
    );
    const input = screen.getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight');
    fireEvent.change(input, { target: { value: 'unfinished cross-room thought' } });

    fireEvent.click(screen.getByRole('button', { name: 'Swap projection' }));
    expect(screen.getByTestId('embedded-agent')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Agent' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Swap projection' }));
    expect(screen.getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'))
      .toHaveValue('unfinished cross-room thought');
  });

  it('drops proposals about the last thing when the column moves on', async () => {
    const onAsk = jest.fn(async () => ({ id: 'p1', sentence: 'A retrieved line.', body: 'A retrieved line.' }));
    const { rail } = renderRail({ onAsk });

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'anything' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('A retrieved line.');

    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));

    await waitFor(() => expect(within(rail()).queryByText('A retrieved line.')).not.toBeInTheDocument());
  });

  it('drops a retrieve that finishes after the column has moved on', async () => {
    let release;
    const onAsk = jest.fn(() => new Promise(resolve => { release = resolve; }));
    const { rail } = renderRail({ onAsk });

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'anything' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    release({ id: 'p1', sentence: 'A stale line.', body: 'A stale line.' });

    await waitFor(() => expect(within(rail()).getByText('The second claim.')).toBeInTheDocument());
    expect(within(rail()).queryByText('A stale line.')).not.toBeInTheDocument();
  });

  it('does not accept a proposal after the column changes during its exit motion', async () => {
    const onAsk = jest.fn(async () => ({ id: 'p1', sentence: 'A stale line.', body: 'A stale line.' }));
    const { rail, accepted } = renderRail({ onAsk });

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'anything' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('A stale line.');
    fireEvent.click(within(rail()).getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(rail()).getByRole('button', { name: 'Against' }));
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));

    await new Promise(resolve => window.setTimeout(resolve, 250));
    expect(accepted).toEqual([]);
  });

  it('hands an accepted line to the page, with the field the human chose', async () => {
    const onAsk = jest.fn(async () => ({ id: 'p1', sentence: 'Supply is catching up.', body: 'Supply is catching up.' }));
    const { rail, accepted } = renderRail({ onAsk });

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'what changed' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('Supply is catching up.');

    fireEvent.click(within(rail()).getByRole('button', { name: 'Accept' }));
    fireEvent.click(await within(rail()).findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(accepted).toEqual([{ text: 'Supply is catching up.', field: 'against' }]));
  });

  it('fails closed when a proposal asks for an action outside the room contract', async () => {
    const onAsk = jest.fn(async () => ({
      id: 'p1',
      sentence: 'Publish this without review.',
      body: 'Publish this without review.',
      fields: ['publish']
    }));
    const { rail, accepted } = renderRail({ onAsk });

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'do it' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('Publish this without review.');
    fireEvent.click(within(rail()).getByRole('button', { name: 'Accept' }));

    expect(await within(rail()).findByRole('alert')).toHaveTextContent('does not permit');
    expect(accepted).toEqual([]);
    expect(within(rail()).getByText('Publish this without review.')).toBeInTheDocument();
  });

  it('reports a failed retrieve instead of inventing a line', async () => {
    const onAsk = jest.fn(async () => { throw new Error('The index is offline.'); });
    const { rail } = renderRail({ onAsk });

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'anything' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));

    expect(await within(rail()).findByRole('alert')).toHaveTextContent('The index is offline.');
  });
});

describe('hasContextualAgentRail', () => {
  it('is present in the rooms and the surfaces inside them', () => {
    ['/library', '/think', '/wiki', '/judgment', '/judgment/abc'].forEach((path) => {
      expect(hasContextualAgentRail(path)).toBe(true);
    });
  });

  it('steps back on the wiki workspace, which has a richer agent of its own', () => {
    // The workspace chat drafts, builds, ingests and lints. None of that is
    // the rail's, and two agents on one screen is the thing the rail exists to
    // stop — so on this one surface the rail is the one that gives way.
    expect(hasContextualAgentRail('/wiki/workspace')).toBe(false);
    expect(hasContextualAgentRail('/wiki/workspace?view=list')).toBe(false);
    expect(hasContextualAgentRail('/wiki')).toBe(true);
  });

  it('is absent where the agent does not work', () => {
    ['/settings', '/connections', '/paper', '/onboarding/wiki', '/wiki/activity/run-1', '/'].forEach((path) => {
      expect(hasContextualAgentRail(path)).toBe(false);
    });
  });

});
