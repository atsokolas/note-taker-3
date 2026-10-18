import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExplainItBack from './ExplainItBack';
import { canExplainBack, explainBack } from '../../api/readingRoom';

jest.mock('../../api/readingRoom', () => ({
  canExplainBack: jest.fn(),
  explainBack: jest.fn()
}));

const TWO = 'Costco sells cheap. People like it a great deal.';

const openAndWrite = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Explain it back' }));
  fireEvent.change(screen.getByLabelText('Explain it back in two sentences'), { target: { value: TWO } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
};

beforeEach(() => jest.clearAllMocks());

describe('ExplainItBack', () => {
  it('is not shown without a model', async () => {
    canExplainBack.mockResolvedValue(false);
    const { container } = render(<ExplainItBack articleId="a1" />);
    await waitFor(() => expect(canExplainBack).toHaveBeenCalledWith('a1'));
    expect(container).toBeEmptyDOMElement();
  });

  it('is not shown when availability cannot be read', async () => {
    canExplainBack.mockRejectedValue(new Error('down'));
    const { container } = render(<ExplainItBack articleId="a1" />);
    await waitFor(() => expect(canExplainBack).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows what you left out, quoting the source', async () => {
    canExplainBack.mockResolvedValue(true);
    explainBack.mockResolvedValue({ missed: [{ point: 'Where the money comes from.', quote: 'the fee pays the bills' }] });
    render(<ExplainItBack articleId="a1" />);
    await openAndWrite();
    expect(await screen.findByText('What you left out')).toBeInTheDocument();
    expect(screen.getByText('Where the money comes from.')).toBeInTheDocument();
    expect(screen.getByText('the fee pays the bills')).toBeInTheDocument();
    expect(explainBack).toHaveBeenCalledWith('a1', TWO);
  });

  it('says so plainly when nothing central is missing', async () => {
    canExplainBack.mockResolvedValue(true);
    explainBack.mockResolvedValue({ missed: [] });
    render(<ExplainItBack articleId="a1" />);
    await openAndWrite();
    expect(await screen.findByText('You have the thread. Nothing central is missing.')).toBeInTheDocument();
  });

  it('keeps your words when the comparison fails', async () => {
    canExplainBack.mockResolvedValue(true);
    explainBack.mockRejectedValue({ response: { data: { error: 'Could not compare this time. Your words are still here.' } } });
    render(<ExplainItBack articleId="a1" />);
    await openAndWrite();
    expect(await screen.findByText('Could not compare this time. Your words are still here.')).toBeInTheDocument();
    expect(screen.getByLabelText('Explain it back in two sentences')).toHaveValue(TWO);
  });
});
