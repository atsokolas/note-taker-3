import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from './TopBar';

describe('TopBar help menu', () => {
  it('renders direct utility links in the top bar', () => {
    render(
      <MemoryRouter>
        <TopBar
          utilityNav={[
            {
              label: 'Settings',
              to: '/settings',
              match: (location) => location.pathname.startsWith('/settings')
            }
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
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

  it('renders an inline progress chip on the Tour button when the tour is in progress', () => {
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
    const tourButton = screen.getByTestId('topbar-tour-button');
    expect(tourButton.className).toMatch(/has-progress/);
    expect(tourButton).toHaveAttribute('aria-label', 'Tour: 2 of 5 steps complete');
    expect(tourButton.textContent).toContain('2/5');
  });

  it('omits the progress chip when the tour has not started or is completed', () => {
    const { rerender } = render(
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
    let tourButton = screen.getByTestId('topbar-tour-button');
    expect(tourButton.className).not.toMatch(/has-progress/);
    expect(tourButton.textContent).not.toContain('0/5');

    rerender(
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
    tourButton = screen.getByTestId('topbar-tour-button');
    expect(tourButton.className).not.toMatch(/has-progress/);
    expect(tourButton.textContent).not.toContain('5/5');
  });

  it('exposes start, resume, and restart tour actions', () => {
    const onStart = jest.fn();
    const onResume = jest.fn();
    const onRestart = jest.fn();

    render(
      <MemoryRouter>
        <TopBar
          helpMenu={{
            onStart,
            onResume,
            onRestart,
            canResume: true
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tour' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Start onboarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tour' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resume onboarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tour' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restart onboarding' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
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
    expect(pill.textContent).toContain('Auto');
    expect(pill.getAttribute('aria-label')).toMatch(/Theme: Auto/);
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
