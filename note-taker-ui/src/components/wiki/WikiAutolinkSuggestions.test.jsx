import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiAutolinkSuggestions from './WikiAutolinkSuggestions';
import { getWikiAutolinkSuggestions } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  getWikiAutolinkSuggestions: jest.fn()
}));

const mount = (props = {}) => render(
  <MemoryRouter>
    <WikiAutolinkSuggestions pageId="wiki-1" pageTitle="Strategy" {...props} />
  </MemoryRouter>
);

describe('WikiAutolinkSuggestions', () => {
  beforeEach(() => {
    getWikiAutolinkSuggestions.mockReset();
  });

  it('renders the loading skeleton while pending', () => {
    getWikiAutolinkSuggestions.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByTestId('wiki-autolinks')).toBeInTheDocument();
    expect(screen.getByText('Linkable pages here')).toBeInTheDocument();
  });

  it('renders nothing when the API returns an empty list', async () => {
    getWikiAutolinkSuggestions.mockResolvedValueOnce({ suggestions: [], scanned: 4 });
    const { container } = mount();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders nothing when the API request fails', async () => {
    getWikiAutolinkSuggestions.mockRejectedValueOnce(new Error('boom'));
    const { container } = mount();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders one item per suggestion with title, mention count, and snippet', async () => {
    getWikiAutolinkSuggestions.mockResolvedValueOnce({
      scanned: 12,
      suggestions: [
        { pageId: 'a', title: 'Compounding interest', mentionCount: 3, snippet: '…says Compounding interest matters…' },
        { pageId: 'b', title: 'Karpathy', mentionCount: 1, snippet: '…Karpathy also matters…' }
      ]
    });
    mount();
    expect(await screen.findByText('2 matches')).toBeInTheDocument();
    expect(screen.getByText('Compounding interest').closest('a')).toHaveAttribute('href', '/wiki/a');
    expect(screen.getByText(/3 mentions/)).toBeInTheDocument();
    expect(screen.getByText(/1 mention/)).toBeInTheDocument();
    expect(screen.getByText(/says Compounding interest matters/)).toBeInTheDocument();
  });

  it('does not fire a request when no pageId is provided', () => {
    mount({ pageId: '' });
    expect(getWikiAutolinkSuggestions).not.toHaveBeenCalled();
  });

  it('singularizes "1 match" correctly', async () => {
    getWikiAutolinkSuggestions.mockResolvedValueOnce({
      scanned: 4,
      suggestions: [{ pageId: 'a', title: 'Solo', mentionCount: 1, snippet: 'x' }]
    });
    mount();
    expect(await screen.findByText('1 match')).toBeInTheDocument();
  });
});
