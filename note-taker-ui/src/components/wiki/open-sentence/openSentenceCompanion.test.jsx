import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render as renderWithoutRouter, screen, within } from '@testing-library/react';
import { companionForOpenedClaim } from './openSentenceCompanion';
import { buildAgentContext } from '../../../agent/agentConversationModel';
import PartnerPanel from '../../../agent/PartnerPanel';
import { AgentRailProvider, useContextualAgentSurface } from '../../../agent/AgentRailContext';
import { getAgentThread, streamChatWithAgent } from '../../../api/agent';

// The panel links what it read back to its source.
const render = ui => renderWithoutRouter(ui, { wrapper: MemoryRouter });

jest.mock('../../../api/agent', () => ({
  getAgentThread: jest.fn(),
  streamChatWithAgent: jest.fn()
}));

const page = {
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Children need room to make mistakes.',
        marks: [{
          type: 'claim',
          attrs: { claimId: 'claim-1', citationIndexes: [1] }
        }]
      }]
    }]
  },
  claims: [{
    claimId: 'claim-1',
    text: 'Children need room to make mistakes.',
    sourceRefIds: ['source-nomad']
  }],
  sourceRefs: [{
    _id: 'source-nomad',
    title: 'Nomad',
    snippet: 'A wrong turn you can walk back from still teaches the map.'
  }]
};

const WikiAsk = ({ onAccept } = {}) => {
  useContextualAgentSurface('agent-surface.wiki', {
    objectType: 'wiki_claim',
    objectId: 'claim-1',
    pageId: 'page-1',
    claimId: 'claim-1',
    subject: 'Children need room to make mistakes.',
    askPlaceholder: 'Ask about this sentence'
  }, onAccept ? { onAccept } : {});
  return <PartnerPanel />;
};

describe('open sentence companion', () => {
  beforeEach(() => {
    window.localStorage.clear();
    getAgentThread.mockReset();
    streamChatWithAgent.mockReset();
    streamChatWithAgent.mockResolvedValue({ reply: 'A generated narrower wording.' });
  });

  it('rebinds to the opened line and names the attached source, or stays silent', () => {
    expect(companionForOpenedClaim(page, { claimId: 'claim-1' })).toEqual(expect.objectContaining({
      subject: 'Children need room to make mistakes.',
      askPlaceholder: 'Ask about this sentence',
      lines: [{ id: 'source', text: 'Nomad' }]
    }));

    expect(companionForOpenedClaim({
      ...page,
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Nothing sits beside this yet.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-silent', citationIndexes: [] } }]
          }]
        }]
      }
    }, { claimId: 'claim-silent' })).toEqual(expect.objectContaining({
      lines: []
    }));

    expect(companionForOpenedClaim(page, { claimId: 'claim-missing' })).toBeNull();
    expect(companionForOpenedClaim(page, { claimId: '' })).toBeNull();
  });

  it('counts two exact excerpts from the same article as one source family', () => {
    const articlePage = {
      ...page,
      sourceRefs: [{
        ...page.sourceRefs[0],
        type: 'article',
        objectId: 'article-nomad'
      }]
    };
    const companion = companionForOpenedClaim(articlePage, {
      claimId: 'claim-1',
      exploration: {
        claimId: 'claim-1',
        draft: {
          writing: 'Recoverable error can be a form of care.',
          selectedSource: {
            articleId: 'article-nomad',
            title: 'Nomad',
            passage: 'The second excerpt names the next attempt.',
            available: true
          }
        }
      }
    });

    expect(companion).toEqual(expect.objectContaining({
      askPlaceholder: 'Think with me about this'
    }));
    expect(companion.lines.filter((line) => line.id.startsWith('source'))).toHaveLength(2);
  });

  it('asks against the accepted page, with the opened line as focus', () => {
    expect(buildAgentContext({
      room: 'wiki',
      contractId: 'agent-surface.wiki',
      objectType: 'wiki_claim',
      objectId: 'claim-1',
      pageId: 'page-1',
      claimId: 'claim-1',
      subject: 'Children need room to make mistakes.'
    })).toEqual(expect.objectContaining({
      type: 'wiki_page',
      id: 'page-1',
      pageId: 'page-1',
      title: 'Children need room to make mistakes.',
      metadata: expect.objectContaining({
        objectType: 'wiki_claim',
        claimId: 'claim-1',
        primaryText: 'Children need room to make mistakes.'
      })
    }));
    expect(buildAgentContext({
      objectType: 'wiki_claim',
      objectId: 'claim-1',
      subject: 'Children need room to make mistakes.'
    })).toBeNull();
  });

  it('does not offer a Wiki rewrite from a generated reply', async () => {
    const accepted = [];
    render(
      <AgentRailProvider>
        <WikiAsk onAccept={(proposal) => accepted.push(proposal.body)} />
      </AgentRailProvider>
    );
    const rail = screen.getByRole('complementary', { name: 'Partner' });

    fireEvent.change(within(rail).getByPlaceholderText('Ask about this sentence'), {
      target: { value: 'Is recoverable mistakes warranted?' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));

    expect(await within(rail).findByText('A generated narrower wording.')).toBeInTheDocument();
    expect(streamChatWithAgent).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        type: 'wiki_page',
        id: 'page-1',
        pageId: 'page-1',
        metadata: expect.objectContaining({ claimId: 'claim-1' })
      })
    }), expect.any(Object));
    expect(within(rail).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(accepted).toEqual([]);
  });

  it('reports a failed ask instead of inventing a line', async () => {
    streamChatWithAgent.mockRejectedValueOnce(new Error('The steward could not reach the page.'));
    render(
      <AgentRailProvider>
        <WikiAsk />
      </AgentRailProvider>
    );
    const rail = screen.getByRole('complementary', { name: 'Partner' });

    fireEvent.change(within(rail).getByPlaceholderText('Ask about this sentence'), {
      target: { value: 'What sits beside this?' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));

    expect(await within(rail).findByRole('alert'))
      .toHaveTextContent('The steward could not reach the page.');
    expect(within(rail).queryByText('A generated narrower wording.')).not.toBeInTheDocument();
  });
});
