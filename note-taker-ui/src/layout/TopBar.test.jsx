import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from './TopBar';

describe('TopBar help menu', () => {
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
});
