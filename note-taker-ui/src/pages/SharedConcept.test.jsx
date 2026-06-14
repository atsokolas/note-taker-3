import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
// react-router-dom is mocked virtually here (matches the existing pattern in
// e.g. SemanticRelatedPanel.test.jsx — jest can't resolve the real package
// in this test harness). Stubbing only the surface SharedConcept actually
// uses. useParams returns a fixed slug so we don't need <Routes/> ceremony.
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, className, ...rest }) =>
    // eslint-disable-next-line jsx-a11y/anchor-is-valid
    <a href={typeof to === 'string' ? to : '#'} className={className} {...rest}>{children}</a>,
  useParams: () => ({ slug: 'abc123' })
}), { virtual: true });

import SharedConcept from './SharedConcept';

jest.mock('../api/concepts', () => ({
  getPublicConcept: jest.fn()
}));

const { getPublicConcept } = require('../api/concepts');

const renderAtSlug = () => render(<SharedConcept />);

const baseConcept = {
  slug: 'abc123',
  ownerDisplayName: 'Athan',
  sharedAt: '2026-04-25T00:00:00Z',
  concept: {
    name: 'Compounding interest',
    framing: 'Money compounds; understanding compounds.',
    description: 'A concept about how small advantages compound.',
    hypothesisHtml: '<p>Time + reinvestment beats picking the right asset.</p>',
    supports: [
      { id: 's1', type: 'Highlight', title: 'Buffett on holding', content: 'Compounders need patience.', source: 'Berkshire letter' }
    ],
    contradictions: [
      { id: 'c1', type: 'Article', title: 'Disruption', content: 'Tech can shorten compounding windows.', source: 'HBR' }
    ],
    questions: [
      { id: 'q1', title: 'What survives 100 years?', content: '' }
    ],
    note: { title: 'Owner note', content: '<p>Side note.</p>', updatedAt: '2026-04-20T00:00:00Z' }
  }
};

describe('SharedConcept', () => {
  beforeEach(() => {
    getPublicConcept.mockReset();
    document.title = 'Noeis';
    // Reset previous OG tags so tests don't leak.
    Array.from(document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')).forEach((tag) => tag.remove());
  });

  it('renders the topbar (with brand) immediately, even while loading', async () => {
    getPublicConcept.mockReturnValue(new Promise(() => {})); // never resolves
    renderAtSlug();
    expect(screen.getByTestId('shared-concept-topbar')).toBeInTheDocument();
    expect(screen.getByLabelText('Noeis home')).toBeInTheDocument();
    expect(screen.getByText(/Loading shared concept/)).toBeInTheDocument();
  });

  it('renders the manuscript surface once data resolves', async () => {
    getPublicConcept.mockResolvedValueOnce(baseConcept);
    renderAtSlug();
    await waitFor(() => expect(screen.getByTestId('shared-concept-page')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: 'Compounding interest' })).toBeInTheDocument();
    expect(screen.getByText(/Money compounds; understanding compounds\./)).toBeInTheDocument();
    // Attribution intentionally appears in both the page header and the
    // sticky bar — assert at least one rendered.
    expect(screen.getAllByText(/Shared by Athan/).length).toBeGreaterThan(0);
    expect(screen.getByText(/min read/)).toBeInTheDocument();
    // Cards
    expect(screen.getByText('Buffett on holding')).toBeInTheDocument();
    expect(screen.getByText('Disruption')).toBeInTheDocument();
    expect(screen.getByText('What survives 100 years?')).toBeInTheDocument();
    expect(screen.queryByText('Private note withheld')).toBeNull();
    expect(screen.queryByText('Owner note')).toBeNull();
    expect(screen.queryByText('Side note.')).toBeNull();
  });

  it('updates document.title and OG meta tags from the loaded concept', async () => {
    getPublicConcept.mockResolvedValueOnce(baseConcept);
    renderAtSlug();
    await waitFor(() => expect(document.title).toBe('Compounding interest · Noeis'));
    const ogTitle = document.head.querySelector('meta[property="og:title"]');
    const ogType = document.head.querySelector('meta[property="og:type"]');
    const twitterCard = document.head.querySelector('meta[name="twitter:card"]');
    expect(ogTitle?.getAttribute('content')).toBe('Compounding interest');
    expect(ogType?.getAttribute('content')).toBe('article');
    expect(twitterCard?.getAttribute('content')).toBe('summary');
  });

  it('renders a friendly 404 with brand still present when slug is missing', async () => {
    getPublicConcept.mockRejectedValueOnce({ response: { status: 404 } });
    renderAtSlug();
    await waitFor(() => expect(screen.getByText('Not available')).toBeInTheDocument());
    expect(screen.getByText(/doesn't exist or was revoked/)).toBeInTheDocument();
    // Topbar (brand) still shown so the 404 doesn't feel like a dead end.
    expect(screen.getByTestId('shared-concept-topbar')).toBeInTheDocument();
  });

  it('copies the page URL to clipboard on the topbar copy button', async () => {
    getPublicConcept.mockResolvedValueOnce(baseConcept);
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderAtSlug();
    await waitFor(() => expect(screen.getByTestId('shared-concept-page')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('shared-concept-topbar-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // jsdom's window.location.href is just "http://localhost/" — assert the
    // copy handler passed *some* URL through (component reads window.location
    // at click time; route path isn't reflected without a real router host).
    expect(writeText.mock.calls[0][0]).toMatch(/^https?:\/\//);
    // Button label flips to "Link copied" briefly — wait for the post-await
    // state to flush (handler awaits navigator.clipboard.writeText first).
    await waitFor(() => expect(screen.getAllByText('Link copied').length).toBeGreaterThan(0));
  });
});
