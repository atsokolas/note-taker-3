import { render, screen } from '@testing-library/react';
import AppShell from './AppShell';

describe('AppShell landmarks', () => {
  it('provides a stable skip target without adding a duplicate main landmark', () => {
    render(
      <AppShell topBar={<header>Top bar</header>}>
        <main aria-label="Route content">Route content</main>
      </AppShell>
    );

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')).toHaveClass('app-shell-new__body');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main', { name: 'Route content' })).toBeInTheDocument();
  });
});
