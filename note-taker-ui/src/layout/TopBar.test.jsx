import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders direct utility links in the top bar', () => {
    render(
      <MemoryRouter>
        <TopBar
          utilityNav={[
            {
              label: 'Connections',
              to: '/integrations',
              match: (location) => location.pathname.startsWith('/integrations')
            },
            {
              label: 'Settings',
              to: '/settings',
              match: (location) => location.pathname.startsWith('/settings')
            }
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Connections' })).toHaveAttribute('href', '/integrations');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('does not render More when secondary navigation is empty', () => {
    render(
      <MemoryRouter>
        <TopBar secondaryNav={[]} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('exposes a persistent reference handoff in the top bar', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Reference…' })).toBeInTheDocument();
  });

  it('opens the more menu for secondary navigation links', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.getByRole('menuitem', { name: 'How To Use' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
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
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Light/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Dark/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitemradio', { name: /Dark/ }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });
});
