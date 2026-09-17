import { useCallback, useEffect, useRef, useState } from 'react';

const useControlledDisclosure = ({ expanded, onExpandedChange }) => {
  const controlled = expanded !== undefined;
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled ? expanded : localOpen;
  const triggerRef = useRef(null);
  const wasOpen = useRef(open);

  const setOpen = useCallback(next => {
    if (!controlled) setLocalOpen(next);
    onExpandedChange?.(next);
  }, [controlled, onExpandedChange]);

  useEffect(() => {
    if (wasOpen.current && !open) {
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
    wasOpen.current = open;
  }, [open]);

  return { controlled, open, setOpen, triggerRef };
};

export default useControlledDisclosure;
