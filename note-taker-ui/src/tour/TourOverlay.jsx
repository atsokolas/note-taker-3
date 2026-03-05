import React, { useEffect, useMemo, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isTextInputElement = (node) => {
  if (!node || typeof node !== 'object') return false;
  const tagName = String(node.tagName || '').toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || Boolean(node.isContentEditable);
};

const resolveCardPosition = (targetRect, placement) => {
  if (!targetRect) return null;
  const gap = 14;
  const cardWidth = 340;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centerLeft = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);
  const base = {
    left: clamp(centerLeft, 16, Math.max(16, viewportWidth - cardWidth - 16)),
    top: targetRect.bottom + gap
  };

  if (placement === 'top') {
    base.top = targetRect.top - gap;
    base.transform = 'translateY(-100%)';
  } else if (placement === 'left') {
    base.left = targetRect.left - cardWidth - gap;
    base.top = targetRect.top + (targetRect.height / 2);
    base.transform = 'translateY(-50%)';
  } else if (placement === 'right') {
    base.left = targetRect.right + gap;
    base.top = targetRect.top + (targetRect.height / 2);
    base.transform = 'translateY(-50%)';
  }

  const maxTop = Math.max(16, viewportHeight - 260);
  base.top = clamp(base.top, 16, maxTop);
  if (!base.transform) base.transform = 'none';
  return base;
};

const TourOverlay = ({
  open = false,
  step = null,
  stepIndex = 0,
  totalSteps = 0,
  onNext = () => {},
  onBack = () => {},
  onSkip = () => {},
  onClose = () => {},
  onAction = () => {}
}) => {
  const [targetRect, setTargetRect] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null);
      return undefined;
    }
    let raf = null;
    const updateRect = () => {
      if (!step.targetSelector) {
        setTargetRect(null);
        return;
      }
      const target = document.querySelector(step.targetSelector);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setTargetRect(null);
        return;
      }
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      });
    };
    const updateRectRaf = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateRect);
    };
    updateRect();
    window.addEventListener('resize', updateRectRaf);
    window.addEventListener('scroll', updateRectRaf, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateRectRaf);
      window.removeEventListener('scroll', updateRectRaf, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onBack();
        return;
      }
      if (event.key === 'Enter' && !isTextInputElement(document.activeElement)) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack, onClose, onNext, open]);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
  }, [open, step?.id]);

  const anchored = Boolean(targetRect) && window.innerWidth >= 860;
  const position = useMemo(
    () => (anchored ? resolveCardPosition(targetRect, step?.placement || 'bottom') : null),
    [anchored, step?.placement, targetRect]
  );

  const progressNow = Math.min(totalSteps, Math.max(1, stepIndex + 1));
  const progressValue = totalSteps > 0 ? Math.round((progressNow / totalSteps) * 100) : 0;

  if (!open || !step) return null;

  return (
    <div className="tour-layer" aria-hidden="false">
      <div className="sr-only" aria-live="polite">
        {`Step ${progressNow} of ${totalSteps}: ${step.title}`}
      </div>

      <div className="tour-backdrop" />

      {anchored && targetRect && (
        <div
          className="tour-spotlight"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12
          }}
        />
      )}

      <section
        ref={cardRef}
        className={`tour-card ${anchored ? 'tour-card--anchored' : 'tour-card--centered'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`tour-title-${step.id}`}
        aria-describedby={`tour-body-${step.id}`}
        tabIndex={-1}
        style={anchored && position ? {
          top: position.top,
          left: position.left,
          transform: position.transform
        } : undefined}
      >
        <button
          type="button"
          className="tour-close"
          aria-label="Close tour"
          onClick={onClose}
        >
          ×
        </button>

        <div className="tour-step-label">
          Step {progressNow} of {totalSteps}
        </div>
        <h3 id={`tour-title-${step.id}`}>{step.title}</h3>
        <p id={`tour-body-${step.id}`}>{step.body}</p>

        <div
          className="tour-progress"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, totalSteps)}
          aria-valuenow={progressNow}
          aria-label="Tour progress"
        >
          <span className="tour-progress__fill" style={{ width: `${progressValue}%` }} />
        </div>

        {step.cta && (
          <button
            type="button"
            className="ui-button ui-button-secondary tour-cta"
            onClick={() => onAction(step.cta)}
          >
            {step.cta.label}
          </button>
        )}

        <div className="tour-actions">
          <button
            type="button"
            className="ui-quiet-button"
            onClick={onBack}
            disabled={stepIndex <= 0}
          >
            Back
          </button>
          <button
            type="button"
            className="ui-quiet-button"
            onClick={onSkip}
          >
            Skip
          </button>
          <button
            type="button"
            className="ui-button ui-button-primary"
            onClick={onNext}
          >
            {stepIndex >= totalSteps - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default TourOverlay;
