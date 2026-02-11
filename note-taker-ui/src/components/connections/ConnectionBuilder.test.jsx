import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectionBuilder from './ConnectionBuilder';

jest.mock('../../api/connections', () => ({
  createConnection: jest.fn().mockResolvedValue({
    _id: 'c-1',
    fromType: 'highlight',
    fromId: 'h-1',
    toType: 'notebook',
    toId: 'n-1',
    relationType: 'supports',
    target: { title: 'Target note' }
  }),
  deleteConnection: jest.fn().mockResolvedValue({ message: 'ok' }),
  getConnectionsForItem: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] }),
  searchConnectableItems: jest.fn().mockResolvedValue([
    {
      itemType: 'notebook',
      itemId: 'n-1',
      title: 'Target note',
      snippet: 'Snippet'
    }
  ])
}));

jest.mock('../../api/conceptPaths', () => ({
  createConceptPath: jest.fn().mockResolvedValue({ _id: 'path-1' })
}));

const {
  createConnection,
  getConnectionsForItem,
  searchConnectableItems
} = require('../../api/connections');

describe('ConnectionBuilder', () => {
  beforeEach(() => {
    createConnection.mockClear();
    getConnectionsForItem.mockClear();
    searchConnectableItems.mockClear();
  });

  it('creates a connection from selected search target', async () => {
    render(<ConnectionBuilder itemType="highlight" itemId="h-1" />);

    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => {
      expect(getConnectionsForItem).toHaveBeenCalledWith({ itemType: 'highlight', itemId: 'h-1' });
    });

    fireEvent.change(screen.getByPlaceholderText('Search notes, highlights, articles, concepts'), {
      target: { value: 'target' }
    });

    await waitFor(() => {
      expect(
        searchConnectableItems.mock.calls.some(([payload]) => (
          payload.q === 'target'
          && payload.excludeType === 'highlight'
          && payload.excludeId === 'h-1'
        ))
      ).toBe(true);
    });

    fireEvent.click(screen.getByText('Target note'));
    fireEvent.change(screen.getByDisplayValue('Related'), {
      target: { value: 'supports' }
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(createConnection).toHaveBeenCalledWith({
        fromType: 'highlight',
        fromId: 'h-1',
        toType: 'notebook',
        toId: 'n-1',
        relationType: 'supports'
      });
    });
  });

  it('passes scope to search/list/create when scope is provided', async () => {
    render(
      <ConnectionBuilder
        itemType="highlight"
        itemId="h-1"
        scopeType="concept"
        scopeId="concept-1"
      />
    );

    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => {
      expect(getConnectionsForItem).toHaveBeenCalledWith({
        itemType: 'highlight',
        itemId: 'h-1',
        scopeType: 'concept',
        scopeId: 'concept-1'
      });
    });

    fireEvent.change(screen.getByPlaceholderText('Search items in this concept'), {
      target: { value: 'target' }
    });
    await waitFor(() => {
      expect(
        searchConnectableItems.mock.calls.some(([payload]) => (
          payload.q === 'target'
          && payload.excludeType === 'highlight'
          && payload.excludeId === 'h-1'
          && payload.scopeType === 'concept'
          && payload.scopeId === 'concept-1'
        ))
      ).toBe(true);
    });

    fireEvent.click(screen.getByText('Target note'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(createConnection).toHaveBeenCalledWith({
        fromType: 'highlight',
        fromId: 'h-1',
        toType: 'notebook',
        toId: 'n-1',
        relationType: 'related',
        scopeType: 'concept',
        scopeId: 'concept-1'
      });
    });
  });
});
