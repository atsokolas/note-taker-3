import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AgentRail from './AgentRail';
import { AgentRailProvider, useAgentRailSurface } from './AgentRailContext';
import { hasAgentRail } from './agentRailRoutes';

// A stand-in for a page: it registers a surface with the rail and records what
// the rail hands back when the human accepts.
const Surface = ({ id, subject, empty, onAsk, accepted }) => {
  useAgentRailSurface(
    { id, subject, empty },
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

describe('AgentRail', () => {
  it('says what it is for without branding itself', () => {
    const { rail } = renderRail();

    expect(within(rail()).getByText('Agent')).toBeInTheDocument();
    expect(within(rail()).getByText('Retrieves. You accept.')).toBeInTheDocument();
    expect(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight')).toBeInTheDocument();
    expect(within(rail()).queryByText(/thought partner/i)).not.toBeInTheDocument();
  });

  it('says nothing is there in a sentence rather than an empty box', () => {
    const { rail } = renderRail();

    expect(within(rail()).getByText('Nothing to retrieve until you ask.')).toBeInTheDocument();
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

describe('hasAgentRail', () => {
  it('is present in the four rooms and the surfaces inside them', () => {
    ['/library', '/think', '/wiki', '/judgment', '/judgment/abc', '/wiki/workspace'].forEach((path) => {
      expect(hasAgentRail(path)).toBe(true);
    });
  });

  it('is absent where the agent does not work', () => {
    ['/settings', '/connections', '/paper', '/onboarding/wiki', '/wiki/activity/run-1', '/'].forEach((path) => {
      expect(hasAgentRail(path)).toBe(false);
    });
  });
});
