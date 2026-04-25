import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThinkHome from './ThinkHome';

const noop = () => {};

const baseProps = {
  recentTargets: [],
  workingSet: { notebooks: [], concepts: [], questions: [] },
  returnQueue: [],
  recentHighlights: [],
  recentArticles: [],
  onOpenTarget: noop,
  onOpenNotebook: noop,
  onOpenConcept: noop,
  onOpenQuestion: noop,
  onOpenReturnQueueItem: noop,
  onOpenArticle: noop,
  onOpenActivation: noop,
  onClearActivation: noop,
  onCreateNote: noop,
  onCreateConcept: noop,
  onCreateFromTemplate: noop,
  onCreateQuestion: noop
};

describe('ThinkHome', () => {
  it('promotes "New note" to a primary action and keeps the rest secondary', () => {
    const onCreateNote = jest.fn();
    render(<ThinkHome {...baseProps} onCreateNote={onCreateNote} />);

    const newNote = screen.getByRole('button', { name: 'New note' });
    expect(newNote.className).toMatch(/ui-quiet-button--primary/);

    const newConcept = screen.getByRole('button', { name: 'New concept' });
    expect(newConcept.className).not.toMatch(/ui-quiet-button--primary/);

    fireEvent.click(newNote);
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it('drives the bloom CSS vars on pointermove over the primary button', () => {
    render(<ThinkHome {...baseProps} />);
    const primary = screen.getByRole('button', { name: 'New note' });
    primary.getBoundingClientRect = () => ({
      top: 100, left: 200, right: 320, bottom: 140, width: 120, height: 40, x: 200, y: 100, toJSON: () => ({})
    });
    // jsdom doesn't propagate clientX/clientY through fireEvent.pointerMove options;
    // dispatch a real PointerEvent and assign the coords on the event object.
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'clientX', { value: 250 });
    Object.defineProperty(moveEvent, 'clientY', { value: 120 });
    primary.dispatchEvent(moveEvent);
    expect(primary.style.getPropertyValue('--bloom-x')).toBe('50px');
    expect(primary.style.getPropertyValue('--bloom-y')).toBe('20px');

    fireEvent.pointerLeave(primary);
    expect(primary.style.getPropertyValue('--bloom-x')).toBe('');
    expect(primary.style.getPropertyValue('--bloom-y')).toBe('');
  });

  it('renders a strengthened Continue hero with type chip and Resume CTA when a recent item exists', () => {
    const onOpenTarget = jest.fn();
    const recent = {
      id: 'concept-1',
      type: 'concept',
      title: 'Calm magnetic interfaces',
      path: '/think?tab=concepts&name=Calm%20magnetic%20interfaces',
      openedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    };
    render(<ThinkHome {...baseProps} recentTargets={[recent]} onOpenTarget={onOpenTarget} />);

    expect(screen.getByText('Calm magnetic interfaces')).toBeInTheDocument();
    expect(screen.getByText('Concept')).toBeInTheDocument();
    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(resume.className).toMatch(/ui-quiet-button--primary/);

    fireEvent.click(resume);
    expect(onOpenTarget).toHaveBeenCalledTimes(1);
    expect(onOpenTarget.mock.calls[0][0].id).toBe('concept-1');

    fireEvent.click(screen.getByRole('button', { name: 'Resume Calm magnetic interfaces' }));
    expect(onOpenTarget).toHaveBeenCalledTimes(2);
  });

  it('falls back to an empty message when there is no recent item', () => {
    render(<ThinkHome {...baseProps} />);
    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });
});
