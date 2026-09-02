import { useCallback } from 'react';
import useCssMagneticLerp from './useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from './useMotionPreferences';

/* Library, wiki, and source rows share one magnetic system: the same lerp
   KindRail uses, driving `--magnetic-x` a few pixels toward the pointer.

   It also used to publish the pointer's position into `--row-bloom-x/y` for a
   wash that followed the cursor across the row. The wash is gone — a row under
   the pointer takes a ring now, and a ring does not care where inside the row
   the pointer is — so two style writes on every pointer move went with it. */
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
    const mid = rect.left + rect.width / 2;
    const t = (event.clientX - mid) / Math.max(rect.width / 2, 1);
    magnet.setTarget(Math.max(-DRIFT_PX, Math.min(DRIFT_PX, t * DRIFT_PX)));
  }, [follow, magnet]);

  const onPointerLeave = useCallback(() => {
    if (follow) magnet.setTarget(0);
  }, [follow, magnet]);

  return {
    rowRef: magnet.elRef,
    onPointerMove,
    onPointerLeave
  };
};

export default useMagneticRow;
