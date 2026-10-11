import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('opens the one Partner as an accessible sheet, by button or ⌘J', () => {
    render(
      <AppShell topBar={<header>Top bar</header>} partner={<aside aria-label="Partner">Partner work</aside>}>
        <main>Library</main>
      </AppShell>
    );

    const trigger = screen.getByRole('button', { name: 'Partner' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Partner' })).toContainElement(
      screen.getByRole('complementary', { name: 'Partner' })
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    act(() => { window.dispatchEvent(new Event('noeis:open-agent')); });
    expect(screen.getByRole('dialog', { name: 'Partner' })).toBeInTheDocument();
  });

  it('keeps keyboard focus inside the open agent drawer', () => {
    render(
      <AppShell
        topBar={<header><button type="button">Outside</button></header>}
        partner={<aside aria-label="Agent"><input aria-label="Agent question" /></aside>}
      >
        <main>Library</main>
      </AppShell>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Partner' }));
    const close = screen.getByRole('button', { name: 'Close' });
    const question = screen.getByRole('textbox', { name: 'Agent question' });

    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(question).toHaveFocus();

    question.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('leaves the page alone where no room has a Partner', () => {
    render(<AppShell topBar={<header>Top bar</header>}><main>Settings</main></AppShell>);
    expect(screen.queryByRole('button', { name: 'Partner' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
