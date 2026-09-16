import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionMissingMiddle from './QuestionMissingMiddle';

describe('QuestionMissingMiddle', () => {
  it('shows both ends of one missing connection or a named miss', async () => {
    const onPlace = jest.fn();
    const search = jest.fn().mockResolvedValue({
      articles: [{
        _id: 'letter',
        title: 'Household letter',
        content: 'Someone still bears the downside of a recoverable mistake.'
      }],
      highlights: []
    });
    render(
      <QuestionMissingMiddle
        boundQuestion="Who bears the downside?"
        placed={[{ passage: 'Patience is not the same as avoidance.' }]}
        onPlace={onPlace}
        search={search}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask what is unconnected' }));
    expect(screen.getByText('Looking for an unconnected premise.')).toBeInTheDocument();
    expect(await screen.findByText('Here')).toBeInTheDocument();
    expect(screen.getByText('Who bears the downside?')).toBeInTheDocument();
    expect(screen.getByText('There')).toBeInTheDocument();
    expect(screen.getByText('Household letter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Place beside the question' }));
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({
      articleId: 'letter',
      passage: expect.stringMatching(/bears the downside/)
    }));
  });

  it('lets a merely similar line go and names a miss when nothing else qualifies', async () => {
    const search = jest.fn().mockResolvedValue({
      articles: [{
        _id: 'letter',
        title: 'Household letter',
        content: 'Someone still bears the downside of a recoverable mistake.'
      }],
      highlights: []
    });
    render(
      <QuestionMissingMiddle
        boundQuestion="Who bears the downside?"
        placed={[{ passage: 'Patience is not the same as avoidance.' }]}
        search={search}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask what is unconnected' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Not this — only similar' }));
    expect(await screen.findByText('Nothing you already have speaks to the unconnected part of this question.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place beside the question' })).not.toBeInTheDocument();
  });
});
