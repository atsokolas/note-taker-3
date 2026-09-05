import React from 'react';
import { render, screen } from '@testing-library/react';
import { useFinePointer, usePrefersReducedMotion } from './useMotionPreferences';

const Probe = () => {
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  return <span>{`reduced:${reduced}|fine:${fine}`}</span>;
};

describe('useMotionPreferences', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('does not throw when matchMedia cannot subscribe', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    expect(() => render(<Probe />)).not.toThrow();
    expect(screen.getByText('reduced:true|fine:true')).toBeInTheDocument();
  });
});
