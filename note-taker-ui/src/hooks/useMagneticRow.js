import { useCallback } from 'react';
import useCssMagneticLerp from './useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from './useMotionPreferences';

/* Library, wiki, and source rows share one magnetic system: the same lerp
   KindRail uses, driving `--magnetic-x` a few pixels toward the pointer.
   Bloom position is a CSS variable on the same move, not a second tracker. */
const DRIFT_PX = 5;

const useMagneticRow = () => {
  const magnet = useCssMagneticLerp('--magnetic-x', 0.22);
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const follow = fine && !reduced;

  const onPointerMove = useCallback((event) => {
    if (!follow) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--row-bloom-x', `${event.clientX - rect.left}px`);
    target.style.setProperty('--row-bloom-y', `${event.clientY - rect.top}px`);
    const mid = rect.left + rect.width / 2;
    const t = (event.clientX - mid) / Math.max(rect.width / 2, 1);
    magnet.setTarget(Math.max(-DRIFT_PX, Math.min(DRIFT_PX, t * DRIFT_PX)));
  }, [follow, magnet]);

  const onPointerLeave = useCallback((event) => {
    const target = event.currentTarget;
    target.style.removeProperty('--row-bloom-x');
    target.style.removeProperty('--row-bloom-y');
    if (follow) magnet.setTarget(0);
  }, [follow, magnet]);

  return {
    rowRef: magnet.elRef,
    onPointerMove,
    onPointerLeave
  };
};

export default useMagneticRow;
