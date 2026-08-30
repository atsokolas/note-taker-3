import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AgentRail from './AgentRail';
import { AgentRailProvider, useContextualAgentSurface } from './AgentRailContext';
import { hasContextualAgentRail } from './contextualAgentContracts';
import { getAgentThread, streamChatWithAgent } from '../api/agent';

jest.mock('../api/agent', () => ({
  getAgentThread: jest.fn(),
  streamChatWithAgent: jest.fn()
}));

// A stand-in for a page: it registers a surface with the rail and records what
// the rail hands back when the human accepts.
const Surface = ({ id, subject, empty, accepted }) => {
  useContextualAgentSurface(
    'agent-surface.judgment',
    { objectType: 'claim', objectId: id, subject, empty },
    {
      onAccept: (proposal, field) => accepted.push({
        text: proposal.body,
        field,
        acceptedFrom: proposal.acceptedFrom
      })
    }
  );
  return <p>column: {subject}</p>;
};

const sourceReply = (reply, overrides = {}) => ({
  reply,
  relatedItems: [{
    type: 'article',
    id: 'article-1',
    title: 'Grid queues',
    snippet: reply
  }],
  ...overrides
});

const Column = ({ accepted }) => {
  const [surface, setSurface] = useState('a');
  return (
    <>
      <button type="button" onClick={() => setSurface(surface === 'a' ? 'b' : 'a')}>Navigate</button>
      {surface === 'a'
        ? <Surface id="a" subject="The first claim." empty="Nothing to retrieve until you ask." accepted={accepted} />
        : <Surface id="b" subject="The second claim." empty="Nothing to retrieve until you ask." accepted={accepted} />}
    </>
  );
};

const PresentationColumn = ({ accepted = [] }) => {
  const [subject, setSubject] = useState('Loading title…');
  return (
    <>
      <button type="button" onClick={() => setSubject('The resolved claim title.')}>Resolve title</button>
      <Surface id="stable-id" subject={subject} empty="Nothing to retrieve until you ask." accepted={accepted} />
    </>
  );
};

const renderRail = ({ accepted = [] } = {}) => {
  const utils = render(
    <AgentRailProvider>
      <Column accepted={accepted} />
      <AgentRail />
    </AgentRailProvider>
  );
  return { ...utils, accepted, rail: () => screen.getByRole('complementary', { name: 'Skeptical partner' }) };
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
  beforeEach(() => {
    window.localStorage.clear();
    getAgentThread.mockReset();
    streamChatWithAgent.mockReset();
    streamChatWithAgent.mockImplementation(async (payload) => ({ reply: `Reply to ${payload.message}` }));
  });

  it('says what it is for without branding itself', () => {
    const { rail } = renderRail();

    expect(rail()).toHaveAttribute('data-agent-contract', 'agent-surface.judgment');
    expect(rail()).toHaveAttribute('data-agent-presentation', 'rail');
    expect(rail()).toHaveAttribute('data-agent-actions', expect.stringContaining('accept.against'));
    expect(rail()).toHaveAttribute('data-agent-proposal-policy', 'human_acceptance');
    expect(within(rail()).getByText('Skeptical partner')).toBeInTheDocument();
    expect(within(rail()).getByText(/tests the live judgment/i)).toBeInTheDocument();
    expect(within(rail()).getByText('Retrieves. You accept.')).toBeInTheDocument();
    expect(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight')).toBeInTheDocument();
    expect(within(rail()).queryByText(/thought partner/i)).not.toBeInTheDocument();
  });

  it('says nothing is there in a sentence rather than an empty box', () => {
    const { rail } = renderRail();

    expect(within(rail()).getByText('Nothing to retrieve until you ask.')).toBeInTheDocument();
  });

  it('uses the durable conversation even when a page has no write adapter', async () => {
    streamChatWithAgent.mockResolvedValueOnce({ reply: 'The accepted page changed in two places.' });
    render(
      <AgentRailProvider>
        <ProjectionToggle />
      </AgentRailProvider>
    );
    const rail = screen.getByRole('complementary', { name: 'Wiki steward' });
    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'What changed?' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));
    expect(await within(rail).findByText('The accepted page changed in two places.')).toBeInTheDocument();
    expect(streamChatWithAgent).toHaveBeenCalledWith(expect.objectContaining({
      persistThread: true,
      context: expect.objectContaining({ type: 'wiki_page', id: 'wiki-1', pageId: 'wiki-1' })
    }), expect.any(Object));
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

  it('keeps the conversation but drops page-bound write actions when the column moves on', async () => {
    streamChatWithAgent.mockResolvedValueOnce(sourceReply('A retrieved line.'));
    const { rail } = renderRail();

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'anything' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('A retrieved line.');

    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));

    await waitFor(() => expect(within(rail()).getByText('A retrieved line.')).toBeInTheDocument());
    expect(within(rail()).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('discards and aborts a late reply when the exact room object changes', async () => {
    let release;
    streamChatWithAgent.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const { rail } = renderRail();

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'anything' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    release({ reply: 'A late line.' });

    await waitFor(() => expect(within(rail()).getByText('The second claim.')).toBeInTheDocument());
    expect(streamChatWithAgent.mock.calls[0][1].signal).toHaveProperty('aborted', true);
    await waitFor(() => expect(within(rail()).queryByText('A late line.')).not.toBeInTheDocument());
    expect(within(rail()).queryByText('anything')).not.toBeInTheDocument();
    expect(within(rail()).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('keeps pending work when only the named presentation resolves', async () => {
    let release;
    streamChatWithAgent.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    render(
      <AgentRailProvider>
        <PresentationColumn />
        <AgentRail />
      </AgentRailProvider>
    );
    const rail = screen.getByRole('complementary', { name: 'Skeptical partner' });

    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'What changed?' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve title' }));
    release({ reply: 'The answer remains correctly bound.' });

    expect(await within(rail).findByText('The answer remains correctly bound.')).toBeInTheDocument();
    expect(streamChatWithAgent.mock.calls[0][1].signal).toHaveProperty('aborted', false);
    expect(within(rail).getByText('The resolved claim title.')).toBeInTheDocument();
  });

  it('does not accept a proposal after the column changes during its exit motion', async () => {
    streamChatWithAgent.mockResolvedValueOnce(sourceReply('A stale line.'));
    const { rail, accepted } = renderRail();

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
    streamChatWithAgent.mockResolvedValueOnce(sourceReply('Supply is catching up.'));
    const { rail, accepted } = renderRail();

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'what changed' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('Supply is catching up.');

    fireEvent.click(within(rail()).getByRole('button', { name: 'Accept' }));
    fireEvent.click(await within(rail()).findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(accepted).toEqual([{
      text: 'Supply is catching up.',
      field: 'against',
      acceptedFrom: 'article:article-1'
    }]));
  });

  it('keeps agent commentary conversational but files only the saved passage it cites', async () => {
    streamChatWithAgent.mockResolvedValueOnce(sourceReply(
      'The model explains why the claim is under pressure.',
      {
        relatedItems: [{
          type: 'article',
          id: 'article-9',
          title: 'Capacity disclosures',
          snippet: 'Signed capacity grew faster than management previously guided.'
        }]
      }
    ));
    const { rail, accepted } = renderRail();

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'challenge this claim' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));

    expect(await within(rail()).findByText('The model explains why the claim is under pressure.')).toBeInTheDocument();
    expect(within(rail()).getByText('Signed capacity grew faster than management previously guided.')).toBeInTheDocument();
    fireEvent.click(within(rail()).getByRole('button', { name: 'Accept' }));
    fireEvent.click(await within(rail()).findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(accepted).toEqual([{
      text: 'Signed capacity grew faster than management previously guided.',
      field: 'against',
      acceptedFrom: 'article:article-9'
    }]));
  });

  it('keeps talking but offers no Judgment write when retrieval has no saved article passage', async () => {
    streamChatWithAgent.mockResolvedValueOnce({
      reply: 'I found a synthesis, but no exact saved passage.',
      relatedItems: [{ type: 'wiki_page', id: 'wiki-1', title: 'A Wiki', snippet: 'A synthesis.' }]
    });
    const { rail } = renderRail();

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'challenge this claim' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));

    expect(await within(rail()).findByText('I found a synthesis, but no exact saved passage.')).toBeInTheDocument();
    expect(within(rail()).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('fails closed when a proposal asks for an action outside the room contract', async () => {
    streamChatWithAgent.mockResolvedValueOnce(sourceReply('Publish this without review.'));
    const { rail, accepted } = renderRail();

    fireEvent.change(within(rail()).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'do it' }
    });
    fireEvent.click(within(rail()).getByRole('button', { name: 'Ask' }));
    await within(rail()).findByText('Publish this without review.');
    fireEvent.click(within(rail()).getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(rail()).getByRole('button', { name: 'Against' }));

    expect(accepted).toEqual([]);
    await new Promise(resolve => window.setTimeout(resolve, 250));
    expect(accepted).toEqual([{
      text: 'Publish this without review.',
      field: 'against',
      acceptedFrom: 'article:article-1'
    }]);
  });

  it('reports a failed retrieve instead of inventing a line', async () => {
    streamChatWithAgent.mockRejectedValueOnce(new Error('The index is offline.'));
    const { rail } = renderRail();

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
