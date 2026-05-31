import { render, screen } from '@testing-library/react';
import AppShell from './AppShell';

describe('AppShell landmarks', () => {
  it('provides a stable skip target and main content landmark for authenticated routes', () => {
    render(
      <AppShell topBar={<header>Top bar</header>}>
        <section>Route content</section>
      </AppShell>
    );

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main', { name: 'Application content' })).toHaveAttribute('id', 'main-content');
  });
});
