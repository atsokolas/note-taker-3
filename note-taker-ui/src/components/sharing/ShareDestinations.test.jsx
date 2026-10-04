import React from 'react';
import { render, screen } from '@testing-library/react';
import ShareDestinations from './ShareDestinations';

it('opens drafts with an encoded public URL and title without embedding page content', () => {
  const url = 'https://www.noeis.io/share/editions/abc?from=reader&issue=4';
  const title = '東京 · Notes & questions';
  render(<ShareDestinations url={url} title={title} />);
  const email = screen.getByRole('link', { name: 'Share via email' }).getAttribute('href');
  expect(email).toBe(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`);
  const x = new URL(screen.getByRole('link', { name: 'Share on X' }).href);
  expect(x.searchParams.get('url')).toBe(url);
  expect([...x.searchParams.keys()]).toEqual(['url']);
  expect(screen.getByRole('link', { name: 'Share on X' })).toHaveAttribute('rel', 'noopener noreferrer');
});

it('offers no destination before a public link exists', () => {
  const { container } = render(<ShareDestinations url="" />);
  expect(container).toBeEmptyDOMElement();
});
