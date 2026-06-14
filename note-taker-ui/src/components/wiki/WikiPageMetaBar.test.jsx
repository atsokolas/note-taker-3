import React from 'react';
import { render, screen } from '@testing-library/react';
import WikiPageMetaBar from './WikiPageMetaBar';

describe('WikiPageMetaBar', () => {
  it('shows a public-ready receipt and share link for shared pages', () => {
    render(
      <WikiPageMetaBar
        page={{
          _id: 'wiki-1',
          pageType: 'topic',
          status: 'published',
          visibility: 'shared',
          sourceScope: 'selected_sources'
        }}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Public page ready: citations included, private source notes withheld.');
    expect(screen.getByRole('link', { name: 'Public link' })).toHaveAttribute('href', `${window.location.origin}/share/wiki/wiki-1`);
  });
});
