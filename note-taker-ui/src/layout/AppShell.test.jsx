import { fireEvent, render, screen } from '@testing-library/react';
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

  it('carries room identity without changing the routed content landmark', () => {
    const { container } = render(
      <AppShell
        topBar={<header>Top bar</header>}
        surface={{ room: 'wiki', objectType: 'wiki_page', objectId: 'page-1' }}
      >
        <main>Wiki article</main>
      </AppShell>
    );

    expect(container.firstChild).toHaveAttribute('data-noeis-surface', 'wiki');
    expect(container.firstChild).toHaveAttribute('data-noeis-object-type', 'wiki_page');
    expect(container.firstChild).toHaveAttribute('data-noeis-object-id', 'page-1');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('uses the same agent rail as an accessible compact-screen drawer', () => {
    render(
      <AppShell topBar={<header>Top bar</header>} rightRail={<aside aria-label="Agent">Agent work</aside>}>
        <main>Library</main>
      </AppShell>
    );

    const trigger = screen.getByRole('button', { name: 'Agent' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Agent context' })).toContainElement(
      screen.getByRole('complementary', { name: 'Agent' })
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
