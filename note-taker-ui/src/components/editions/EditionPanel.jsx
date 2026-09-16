import React, { useEffect, useRef } from 'react';

/** Wide: beside the paper. Narrow: a focused sheet with the same return door. */
export default function EditionPanel({ title, origin, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    const narrow = window.matchMedia?.('(max-width: 1199px)');
    const overflow = document.body.style.overflow;
    const present = () => {
      panel.close?.();
      if (narrow?.matches && panel.showModal) {
        panel.showModal();
        document.body.style.overflow = 'hidden';
      } else {
        panel.show?.();
        panel.setAttribute('open', '');
        document.body.style.overflow = overflow;
      }
      panel.querySelector('button')?.focus({ preventScroll: true });
    };
    present();
    narrow?.addEventListener?.('change', present);
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === 'Tab' && narrow?.matches) {
        const nodes = [
          ...panel.querySelectorAll('button:not(:disabled), a[href], textarea, input, select')
        ].filter((el) => !el.hidden && el.tabIndex >= 0);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      narrow?.removeEventListener?.('change', present);
      document.body.style.overflow = overflow;
      panel.removeEventListener('keydown', onKey);
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [origin]);
  return (
    <dialog ref={ref} className="edition-peek" aria-label={title}>
      <header>
        <span>{title}</span>
        <button aria-label="Close side view" onClick={onClose}>
          Close ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
