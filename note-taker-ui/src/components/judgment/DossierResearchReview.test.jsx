import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DossierResearchReview from './DossierResearchReview';

const review = {
  status: 'awaiting_review',
  title: 'Review what changed for COST',
  provenance: {
    comparison: {
      headline: 'The 10-Q changed two decision-relevant claims.',
      summary: 'Margins now bear more directly on the owner return hurdle.',
      claimChanges: [{ title: 'Margin conclusion revised', detail: 'The accepted margin claim changed.' }],
      expectations: { summary: 'Required growth increased across two scenarios.' }
    }
  }
};

it('keeps accepted research distinct from the owner-controlled judgment', () => {
  const onKeep = jest.fn();
  const onRevise = jest.fn();
  render(
    <MemoryRouter>
      <DossierResearchReview pageId="page-1" review={review} onKeep={onKeep} onRevise={onRevise} />
    </MemoryRouter>
  );

  expect(screen.getByText('Accepted research · your view is unchanged')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Read the accepted research' }))
    .toHaveAttribute('href', '/wiki/workspace?page=page-1#wiki-dossier-review');
  fireEvent.click(screen.getByRole('button', { name: 'Keep this view' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revise the view' }));
  expect(onKeep).toHaveBeenCalledTimes(1);
  expect(onRevise).toHaveBeenCalledTimes(1);
});

it('renders nothing after the review is resolved', () => {
  const { container } = render(
    <MemoryRouter>
      <DossierResearchReview pageId="page-1" review={{ ...review, status: 'completed' }} />
    </MemoryRouter>
  );
  expect(container).toBeEmptyDOMElement();
});
