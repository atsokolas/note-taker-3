import { fireEvent, render, screen } from '@testing-library/react';
import TourOverlay from './TourOverlay';

const step = {
  id: 'semantic_search',
  title: 'Use semantic search',
  body: 'Search by meaning to find related notes.',
  targetSelector: '',
  placement: 'bottom',
  cta: { label: 'Run demo semantic search', action: 'run_semantic_demo' }
};

describe('TourOverlay', () => {
  it('renders dialog semantics and progress', () => {
    render(
      <TourOverlay
        open
        step={step}
        stepIndex={2}
        totalSteps={5}
        onNext={jest.fn()}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        onClose={jest.fn()}
        onAction={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  });

  it('supports keyboard controls and CTA action', () => {
    const onNext = jest.fn();
    const onBack = jest.fn();
    const onClose = jest.fn();
    const onAction = jest.fn();

    render(
      <TourOverlay
        open
        step={step}
        stepIndex={1}
        totalSteps={5}
        onNext={onNext}
        onBack={onBack}
        onSkip={jest.fn()}
        onClose={onClose}
        onAction={onAction}
      />
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Run demo semantic search' }));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(step.cta);
  });
});

