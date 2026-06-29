import { readFileSync } from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from './TopBar';

describe('TopBar help menu', () => {
  it('renders search as a command palette trigger instead of an inline input', () => {
    const onSearchOpen = jest.fn();
    render(
      <MemoryRouter>
        <TopBar searchMode="field" onSearchOpen={onSearchOpen} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));
    expect(onSearchOpen).toHaveBeenCalledTimes(1);
  });

  it('opens command palette from the icon search affordance', () => {
    const onSearchOpen = jest.fn();
    render(
      <MemoryRouter>
        <TopBar searchMode="icon" onSearchOpen={onSearchOpen} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));
    expect(onSearchOpen).toHaveBeenCalledTimes(1);
  });

  it('links the brand to the wiki landing surface', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Noeis home' })).toHaveAttribute('href', '/wiki');
  });

  it('renders Connections and Settings as direct top-bar links', () => {
    render(
      <MemoryRouter>
        <TopBar
          utilityNav={[
            {
              label: 'Connections',
              to: '/connections#sources',
              essential: true,
              match: (location) => location.pathname.startsWith('/connections')
            },
            {
              label: 'Settings',
              to: '/settings',
              essential: true,
              match: (location) => location.pathname.startsWith('/settings')
            }
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Connections' })).toHaveAttribute('href', '/connections#sources');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Connections' })).toHaveClass('topbar__utility-button--essential');
  });

  it('does not render More when secondary navigation is empty', () => {
    render(
      <MemoryRouter>
        <TopBar secondaryNav={[]} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('does not render the ambiguous reference handoff in the top bar', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Reference…' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reference/i })).toBeNull();
  });

  it('opens the more menu in a portal with secondary navigation links', () => {
    render(
      <MemoryRouter>
        <TopBar
          secondaryNav={[
            {
              label: 'How To Use',
              to: '/how-to-use',
              match: (location) => location.pathname.startsWith('/how-to-use')
            }
          ]}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('topbar-more-button'));

    const menu = screen.getByTestId('topbar-more-menu');
    expect(menu).toHaveClass('topbar__menu-popover--portal');
    expect(within(menu).getByRole('menuitem', { name: 'How To Use' })).toBeInTheDocument();
  });

  it('closes the more menu on Escape', () => {
    render(
      <MemoryRouter>
        <TopBar
          secondaryNav={[
            {
              label: 'Map',
              to: '/map',
              match: (location) => location.pathname.startsWith('/map')
            }
          ]}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('topbar-more-button'));
    expect(screen.getByTestId('topbar-more-menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('topbar-more-menu')).toBeNull();
  });

  it('opens the account menu when account items are provided', () => {
    const onLogout = jest.fn();
    render(
      <MemoryRouter>
        <TopBar
          accountMenuItems={[
            { label: 'Logout', onClick: onLogout }
          ]}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('topbar-account-button'));
    const menu = screen.getByTestId('topbar-account-menu');
    expect(menu).toHaveClass('topbar__menu-popover--portal');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('topbar-account-menu')).toBeNull();
  });

  it('does not render the account button when there are no account menu items', () => {
    render(
      <MemoryRouter>
        <TopBar accountMenuItems={[]} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('topbar-account-button')).toBeNull();
  });

  it('does not create More just to hold tour actions', () => {
    render(
      <MemoryRouter>
        <TopBar
          helpMenu={{
            onStart: () => {},
            onResume: () => {},
            onRestart: () => {},
            canResume: true,
            progress: { completed: 2, total: 5, status: 'in_progress' }
          }}
        />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('topbar-tour-button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('keeps tour actions out of More even when secondary navigation exists', () => {
    const onStart = jest.fn();
    const onResume = jest.fn();
    const onRestart = jest.fn();

    render(
      <MemoryRouter>
        <TopBar
          secondaryNav={[
            {
              label: 'How To Use',
              to: '/how-to-use',
              match: (location) => location.pathname.startsWith('/how-to-use')
            }
          ]}
          helpMenu={{
            onStart,
            onResume,
            onRestart,
            canResume: true,
            progress: { completed: 2, total: 5, status: 'in_progress' }
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('topbar-more-button'));
    expect(screen.getByRole('menuitem', { name: 'How To Use' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /tour/i })).toBeNull();
  });

  it('does not show tour progress in global chrome when the tour has not started or is completed', () => {
    const { unmount } = render(
      <MemoryRouter>
        <TopBar
          helpMenu={{
            onStart: () => {},
            onResume: () => {},
            onRestart: () => {},
            canResume: false,
            progress: { completed: 0, total: 5, status: 'not_started' }
          }}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText('0/5')).toBeNull();

    unmount();
    render(
      <MemoryRouter>
        <TopBar
          helpMenu={{
            onStart: () => {},
            onResume: () => {},
            onRestart: () => {},
            canResume: false,
            progress: { completed: 5, total: 5, status: 'completed' }
          }}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText('5/5')).toBeNull();
  });

  it('hides the theme toggle when no onThemeChange handler is provided', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('topbar-theme-toggle')).toBeNull();
  });

  it('renders the theme pill with the current preference label', () => {
    render(
      <MemoryRouter>
        <TopBar theme="auto" onThemeChange={() => {}} />
      </MemoryRouter>
    );
    const pill = screen.getByTestId('topbar-theme-toggle');
    expect(pill.textContent).toBe('');
    expect(pill.getAttribute('aria-label')).toMatch(/Theme: Auto/);
    expect(pill).toHaveAttribute('title', expect.stringMatching(/Theme: Auto/));
  });

  it('cycles through auto → light → dark on click', () => {
    const onThemeChange = jest.fn();
    const { rerender } = render(
      <MemoryRouter>
        <TopBar theme="auto" onThemeChange={onThemeChange} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('topbar-theme-toggle'));
    expect(onThemeChange).toHaveBeenLastCalledWith('light');

    rerender(
      <MemoryRouter>
        <TopBar theme="light" onThemeChange={onThemeChange} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('topbar-theme-toggle'));
    expect(onThemeChange).toHaveBeenLastCalledWith('dark');

    rerender(
      <MemoryRouter>
        <TopBar theme="dark" onThemeChange={onThemeChange} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('topbar-theme-toggle'));
    expect(onThemeChange).toHaveBeenLastCalledWith('auto');
  });

  it('opens a popover with all three theme options on right-click', () => {
    const onThemeChange = jest.fn();
    render(
      <MemoryRouter>
        <TopBar theme="light" onThemeChange={onThemeChange} />
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByTestId('topbar-theme-toggle'));
    expect(screen.getByTestId('topbar-theme-menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Light/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Dark/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitemradio', { name: /Dark/ }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('renders the system status affordance when status props are provided', () => {
    render(
      <MemoryRouter>
        <TopBar
          systemStatus={{
            latestReceipt: { title: 'Readwise sync', summary: '47 highlights attached' }
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('system-status')).toBeInTheDocument();
    expect(screen.getByTestId('system-status-trigger')).toHaveClass('topbar__icon-button');
  });

  it('keeps the top bar header height stable with system status at mobile width', () => {
    const css = readFileSync(path.join(__dirname, 'system-status.css'), 'utf8');
    expect(css).toMatch(/height: 34px/);

    const { container } = render(
      <MemoryRouter>
        <TopBar
          onThemeChange={() => {}}
          systemStatus={{
            backgroundWork: { label: 'Syncing Readwise' }
          }}
        />
      </MemoryRouter>
    );

    const header = container.querySelector('.topbar');
    const trigger = screen.getByTestId('system-status-trigger');
    expect(trigger).toHaveClass('system-status__trigger', 'topbar__icon-button');
    expect(header).toBeInTheDocument();
    expect(header.querySelector('.topbar__content')).toBeInTheDocument();
  });

  it('passes recent receipt history props through to SystemStatus', () => {
    const onClearRecentReceipts = jest.fn();
    render(
      <MemoryRouter>
        <TopBar
          systemStatus={{
            latestReceipt: { id: 'r2', title: 'Readwise sync', summary: '47 highlights attached' },
            recentReceipts: [
              { id: 'r2', title: 'Readwise sync', summary: '47 highlights attached', href: '/connections' }
            ],
            clearRecentReceipts: onClearRecentReceipts
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('system-status-trigger'));
    const recentSection = screen.getByTestId('system-status-recent-activity');
    expect(within(recentSection).getByRole('link', { name: /Readwise sync/ })).toHaveAttribute('href', '/connections');
    fireEvent.click(within(recentSection).getByRole('button', { name: 'Clear all' }));
    expect(onClearRecentReceipts).toHaveBeenCalledTimes(1);
  });
});
