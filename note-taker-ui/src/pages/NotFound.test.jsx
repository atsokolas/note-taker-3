import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from './NotFound';

describe('NotFound', () => {
  it('asks search engines not to keep the page while it is shown', () => {
    const robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    robots.setAttribute('content', 'index,follow');
    document.head.appendChild(robots);

    const { unmount } = render(<MemoryRouter initialEntries={['/nowhere']}><NotFound /></MemoryRouter>);
    expect(screen.getByText('There is no page here.')).toBeInTheDocument();
    expect(robots.getAttribute('content')).toBe('noindex');

    unmount();
    expect(robots.getAttribute('content')).toBe('index,follow');
    robots.remove();
  });
});
