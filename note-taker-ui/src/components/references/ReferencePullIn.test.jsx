import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReferencePullIn from './ReferencePullIn';

jest.mock('../../api/connections', () => ({
  createConnection: jest.fn().mockResolvedValue({
    _id: 'conn-1',
    relationType: 'related',
    reciprocalConnection: { _id: 'conn-2', relationType: 'referenced_by' },
    trace: {
      bidirectional: true,
      forwardId: 'conn-1',
      reciprocalId: 'conn-2',
      reciprocalRelationType: 'referenced_by'
    }
  }),
  getConnectionsForItem: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] }),
  searchConnectableItems: jest.fn().mockResolvedValue([
    {
      itemType: 'highlight',
      itemId: 'h-1',
      articleId: 'article-1',
      title: 'Margin of safety',
      snippet: 'A useful source highlight',
      openPath: '/library?highlightId=h-1'
    }
  ])
}));

const { createConnection, getConnectionsForItem, searchConnectableItems } = require('../../api/connections');

describe('ReferencePullIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchConnectableItems.mockResolvedValue([
      {
        itemType: 'highlight',
        itemId: 'h-1',
        articleId: 'article-1',
        title: 'Margin of safety',
        snippet: 'A useful source highlight',
        openPath: '/library?highlightId=h-1'
      }
    ]);
    createConnection.mockResolvedValue({
      _id: 'conn-1',
      relationType: 'related',
      reciprocalConnection: { _id: 'conn-2', relationType: 'referenced_by' },
      trace: {
        bidirectional: true,
        forwardId: 'conn-1',
        reciprocalId: 'conn-2',
        reciprocalRelationType: 'referenced_by'
      }
    });
    getConnectionsForItem.mockResolvedValue({ outgoing: [], incoming: [] });
  });

  it('searches connectable items and pulls the selected item into the active context', async () => {
    render(
      <ReferencePullIn
        targetType="concept"
        targetId="concept-1"
        targetTitle="Investing"
        scopeType="concept"
        scopeId="concept-1"
      />
    );

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'margin' }
    });

    await waitFor(() => {
      expect(getConnectionsForItem).toHaveBeenCalledWith({
        itemType: 'concept',
        itemId: 'concept-1',
        scopeType: 'concept',
        scopeId: 'concept-1'
      });
    });
    await waitFor(() => {
      expect(searchConnectableItems).toHaveBeenCalledWith({
        q: 'margin',
        excludeType: 'concept',
        excludeId: 'concept-1',
        scopeType: 'concept',
        scopeId: 'concept-1',
        limit: 6
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/library?highlightId=h-1');
    fireEvent.click(screen.getByText('Margin of safety'));

    await waitFor(() => {
      expect(createConnection).toHaveBeenCalledWith({
        fromType: 'concept',
        fromId: 'concept-1',
        toType: 'highlight',
        toId: 'h-1',
        relationType: 'related',
        scopeType: 'concept',
        scopeId: 'concept-1'
      });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Pulled references')).toHaveTextContent('Highlight · Margin of safety');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Reference landed. Bidirectional trace saved both ways.');
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('Highlight landed');
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('Reciprocal edge saved');
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('1 out · 1 in');
    expect(screen.getByTestId('reference-link-arc')).toBeInTheDocument();
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('1 out · 1 in');
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('Used by');
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('Margin of safety');
    expect(screen.getAllByRole('link', { name: /Margin of safety/ })[0]).toHaveAttribute('href', '/library?highlightId=h-1');
  });

  it('shows an existing graph trace when the reference was already linked', async () => {
    createConnection.mockRejectedValueOnce({ response: { status: 409 } });
    render(
      <ReferencePullIn
        targetType="concept"
        targetId="concept-1"
        targetTitle="Investing"
      />
    );

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'margin' }
    });

    await waitFor(() => {
      expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Margin of safety'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Reference already linked. Bidirectional trace is live.');
    });
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('Existing reciprocal edge confirmed');
    expect(screen.getByLabelText('Pulled references')).toHaveTextContent('Highlight · Margin of safety');
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('1 out · 1 in');
  });

  it('acknowledges the graph save immediately while a pull is in flight', async () => {
    let resolveCreate;
    createConnection.mockReturnValueOnce(new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    render(
      <ReferencePullIn
        targetType="concept"
        targetId="concept-1"
        targetTitle="Investing"
      />
    );

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'margin' }
    });

    await waitFor(() => {
      expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Margin of safety'));

    expect(screen.getByRole('status')).toHaveTextContent('Saving bidirectional trace...');
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('Writing forward reference');
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('Waiting for reciprocal edge');
    expect(screen.getByLabelText('Graph trace receipt')).toHaveTextContent('Updating graph counts');

    resolveCreate({
      _id: 'conn-late',
      reciprocalConnection: { _id: 'conn-late-back', relationType: 'referenced_by' },
      trace: { bidirectional: true, reciprocalId: 'conn-late-back' }
    });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Reference landed. Bidirectional trace saved both ways.');
    });
  });

  it('renders ambient related items as pullable chips', async () => {
    render(
      <ReferencePullIn
        targetType="question"
        targetId="question-1"
        targetTitle="What matters?"
        relatedItems={[{
          type: 'article',
          id: 'a-1',
          title: 'Source article',
          snippet: 'Context'
        }]}
      />
    );

    expect(screen.getByLabelText('Pulled references')).toHaveTextContent('Article · Source article');
    await waitFor(() => {
      expect(screen.getByLabelText('Referenced by')).toHaveTextContent('0 out · 0 in');
    });
  });

  it('shows incoming and outgoing graph context for the active object', async () => {
    getConnectionsForItem.mockResolvedValueOnce({
      outgoing: [{
        _id: 'out-1',
        relationType: 'related',
        toType: 'article',
        toId: 'article-1',
        target: { title: 'Source article', openPath: '/library?articleId=article-1' }
      }],
      incoming: [{
        _id: 'in-1',
        relationType: 'extends',
        fromType: 'wiki_page',
        fromId: 'wiki-1',
        source: { title: 'Durable wiki page', openPath: '/wiki/wiki-1' }
      }]
    });

    render(
      <ReferencePullIn
        targetType="concept"
        targetId="concept-2"
        targetTitle="Circle of competence"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Referenced by')).toHaveTextContent('1 out · 1 in');
    });
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('Uses');
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('Source article');
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('Used by');
    expect(screen.getByLabelText('Referenced by')).toHaveTextContent('Durable wiki page');
    expect(screen.getByLabelText('Local constellation')).toHaveTextContent('2 traces');
    expect(screen.getByLabelText('Local constellation')).toHaveTextContent('1 Article');
    expect(screen.getByLabelText('Local constellation')).toHaveTextContent('1 Wiki');
    expect(screen.getByLabelText('Local constellation')).toHaveTextContent('This uses');
    expect(screen.getByLabelText('Local constellation')).toHaveTextContent('This is used by');
    expect(screen.getByLabelText('Local constellation')).toHaveTextContent('Extends');
    expect(screen.getAllByRole('link', { name: /Source article/ })[0]).toHaveAttribute('href', '/library?articleId=article-1');
    expect(screen.getAllByRole('link', { name: /Durable wiki page/ })[0]).toHaveAttribute('href', '/wiki/workspace?page=wiki-1');
  });

  it('pulls a wiki page result into the active graph context', async () => {
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'wiki_page',
      itemId: 'wiki-1',
      title: 'Durable investing thesis',
      snippet: 'A sourced wiki page'
    }]);
    render(
      <ReferencePullIn
        targetType="question"
        targetId="question-1"
        targetTitle="What is durable?"
      />
    );

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'durable' }
    });

    await waitFor(() => {
      expect(screen.getByText('Durable investing thesis')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/wiki/workspace?page=wiki-1');
    fireEvent.click(screen.getByText('Durable investing thesis'));

    await waitFor(() => {
      expect(createConnection).toHaveBeenCalledWith({
        fromType: 'question',
        fromId: 'question-1',
        toType: 'wiki_page',
        toId: 'wiki-1',
        relationType: 'related'
      });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Pulled references')).toHaveTextContent('Wiki · Durable investing thesis');
    });
  });

  it('lets question surfaces choose support or counter evidence before pulling a reference', async () => {
    createConnection.mockResolvedValueOnce({
      _id: 'counter-conn',
      relationType: 'contradicts',
      reciprocalConnection: { _id: 'counter-back', relationType: 'contradicted_by' },
      trace: {
        bidirectional: true,
        forwardId: 'counter-conn',
        reciprocalId: 'counter-back',
        reciprocalRelationType: 'contradicted_by'
      }
    });
    render(
      <ReferencePullIn
        targetType="question"
        targetId="question-1"
        targetTitle="What breaks the thesis?"
        relationOptions={[
          { value: 'supports', label: 'Support' },
          { value: 'contradicts', label: 'Counter' },
          { value: 'related', label: 'Related' }
        ]}
        defaultRelationType="supports"
      />
    );

    expect(screen.getByRole('button', { name: 'Support' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Counter' }));
    expect(screen.getByRole('button', { name: 'Counter' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'margin' }
    });

    await waitFor(() => {
      expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Margin of safety'));

    await waitFor(() => {
      expect(createConnection).toHaveBeenCalledWith({
        fromType: 'question',
        fromId: 'question-1',
        toType: 'highlight',
        toId: 'h-1',
        relationType: 'contradicts'
      });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Local constellation')).toHaveTextContent('Contradicted by');
    });
  });

  it('notifies the host surface when a reference lands', async () => {
    const onPulled = jest.fn();
    render(
      <ReferencePullIn
        targetType="wiki_page"
        targetId="wiki-1"
        targetTitle="Investing"
        onPulled={onPulled}
      />
    );

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'margin' }
    });

    await waitFor(() => {
      expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Margin of safety'));

    await waitFor(() => {
      expect(onPulled).toHaveBeenCalledWith(expect.objectContaining({
        status: 'saved',
        item: expect.objectContaining({
          itemType: 'highlight',
          itemId: 'h-1',
          articleId: 'article-1',
          title: 'Margin of safety'
        }),
        connection: expect.objectContaining({ _id: 'conn-1' })
      }));
    });
  });

  it('lets host surfaces override graph edge semantics', async () => {
    createConnection.mockResolvedValueOnce({
      _id: 'support-conn',
      relationType: 'supports',
      reciprocalConnection: { _id: 'support-back', relationType: 'supported_by' },
      trace: {
        bidirectional: true,
        forwardId: 'support-conn',
        reciprocalId: 'support-back',
        reciprocalRelationType: 'supported_by'
      }
    });
    render(
      <ReferencePullIn
        targetType="wiki_page"
        targetId="wiki-1"
        targetTitle="Investing"
        connectionPayloadForItem={(item) => ({
          fromType: item.itemType,
          fromId: item.itemId,
          toType: 'wiki_page',
          toId: 'wiki-1',
          relationType: 'supports'
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'margin' }
    });

    await waitFor(() => {
      expect(screen.getByText('Margin of safety')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Margin of safety'));

    await waitFor(() => {
      expect(createConnection).toHaveBeenCalledWith({
        fromType: 'highlight',
        fromId: 'h-1',
        toType: 'wiki_page',
        toId: 'wiki-1',
        relationType: 'supports'
      });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Local constellation')).toHaveTextContent('Supported by');
    });
  });
});
