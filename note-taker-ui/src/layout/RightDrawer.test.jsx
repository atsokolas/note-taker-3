import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RightDrawer from './RightDrawer';

const setViewport = (width) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query) => ({
      matches: query.includes('1240') ? width <= 1240 : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    })
  });
};

const DrawerHarness = ({ initialOpen = false }) => {
  const [open, setOpen] = useState(initialOpen);
  return (
    <RightDrawer title="Thought partner" open={open} onToggle={setOpen}>
      <button type="button">Reference</button>
      <button type="button">Challenge</button>
    </RightDrawer>
  );
};

describe('RightDrawer', () => {
  beforeEach(() => {
    setViewport(1440);
  });

  it('preserves the desktop rail collapse behavior', () => {
    render(<DrawerHarness initialOpen />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Thought partner' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Thought partner' }));
    expect(screen.getByRole('button', { name: 'Expand right panel' })).toBeInTheDocument();
  });

  it('uses a labeled modal drawer on mobile and restores trigger focus after Escape', () => {
    setViewport(430);
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: 'Open Thought partner' });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Thought partner' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close Thought partner' })).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close Thought partner' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Thought partner' }));
  });

  it('portals the mobile trigger outside transformed layout ancestors', () => {
    setViewport(430);
    const { container } = render(<DrawerHarness initialOpen />);

    expect(container.querySelector('[data-testid="agent-context-trigger"]')).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-testid="agent-context-trigger"]')).toBeInTheDocument();
  });

  it('contains Tab focus within the open mobile drawer', () => {
    setViewport(430);
    render(<DrawerHarness initialOpen />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Thought partner' }));
    const close = screen.getByRole('button', { name: 'Close Thought partner' });
    const challenge = screen.getByRole('button', { name: 'Challenge' });
    challenge.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(challenge);
  });
});
