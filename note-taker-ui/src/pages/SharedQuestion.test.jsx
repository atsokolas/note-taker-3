jest.mock('react-router-dom', () => ({
  Link: ({ to, children, className, ...rest }) =>
    // eslint-disable-next-line jsx-a11y/anchor-is-valid
    <a href={typeof to === 'string' ? to : '#'} className={className} {...rest}>{children}</a>,
  useParams: () => ({ slug: 'qslug123' })
}), { virtual: true });

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SharedQuestion from './SharedQuestion';

jest.mock('../api/questions', () => ({
  getPublicQuestion: jest.fn()
}));

const { getPublicQuestion } = require('../api/questions');

describe('SharedQuestion', () => {
  beforeEach(() => {
    getPublicQuestion.mockReset();
  });

  it('renders public question content without auth chrome', async () => {
    getPublicQuestion.mockResolvedValueOnce({
      slug: 'qslug123',
      ownerDisplayName: 'Athan',
      sharedAt: '2026-06-14T00:00:00Z',
      question: {
        text: 'What survives compounding?',
        status: 'open',
        conceptName: 'Compounding',
        paragraphs: [{ id: 'p1', type: 'paragraph', text: 'First paragraph.' }]
      }
    });

    render(<SharedQuestion />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'What survives compounding?' })).toBeInTheDocument());
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText(/Public page ready: citations included, private source notes withheld\./)).toBeInTheDocument();
    expect(screen.getByTestId('shared-question-topbar')).toBeInTheDocument();
  });
});
