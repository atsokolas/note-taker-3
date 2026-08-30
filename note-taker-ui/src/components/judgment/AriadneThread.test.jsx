import React from 'react';
import { render, screen } from '@testing-library/react';
import AriadneThread from './AriadneThread';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: jest.fn(() => false)
}));

const nodeAt = (rect) => ({
  getBoundingClientRect: () => rect
});

const refs = () => {
  const opinion = nodeAt({ left: 100, top: 100, width: 500, height: 50 });
  return {
    sourceRef: { current: nodeAt({ left: 500, top: 400, width: 300, height: 40 }) },
    targetRef: { current: { querySelector: () => opinion } }
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  usePrefersReducedMotion.mockReturnValue(false);
});

it('draws one warm thread from the reviewed sentence to the held sentence', () => {
  const { sourceRef, targetRef } = refs();
  render(<AriadneThread traceId="receipt-1" sourceRef={sourceRef} targetRef={targetRef} />);

  const thread = screen.getByTestId('ariadne-thread');
  expect(thread.querySelector('path')).toHaveAttribute(
    'd',
    'M 490 420 C 322 420, 258 125, 90 125'
  );
  expect(thread.querySelector('.ariadne-thread__knot')).toHaveStyle({ left: '90px', top: '125px' });
});

it('keeps the provenance mark but removes the traveling line for reduced motion', () => {
  usePrefersReducedMotion.mockReturnValue(true);
  const { sourceRef, targetRef } = refs();
  render(<AriadneThread traceId="receipt-1" sourceRef={sourceRef} targetRef={targetRef} />);

  const thread = screen.getByTestId('ariadne-thread');
  expect(thread).toHaveClass('ariadne-thread--reduced');
  expect(thread.querySelector('path')).not.toBeInTheDocument();
  expect(thread.querySelector('.ariadne-thread__knot')).toBeInTheDocument();
});

it('stays silent without a confirmed accepted-write trace', () => {
  const { sourceRef, targetRef } = refs();
  render(<AriadneThread traceId="" sourceRef={sourceRef} targetRef={targetRef} />);
  expect(screen.queryByTestId('ariadne-thread')).not.toBeInTheDocument();
});
