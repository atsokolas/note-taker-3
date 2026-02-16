import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';

const findStartIndex = (offsets, scrollTop) => {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < scrollTop) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const VirtualList = forwardRef(({
  items = [],
  height = 560,
  itemSize = 56,
  overscan = 5,
  dynamicItemHeights = false,
  className = '',
  style = {},
  renderItem
}, ref) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState({});
  const viewportRef = useRef(null);
  const observersRef = useRef(new Map());

  useEffect(() => {
    if (!dynamicItemHeights) return;
    setMeasuredHeights({});
  }, [dynamicItemHeights, items]);

  useEffect(() => () => {
    observersRef.current.forEach(observer => observer.disconnect());
    observersRef.current.clear();
  }, []);

  const metrics = useMemo(() => {
    const sizes = new Array(items.length);
    const offsets = new Array(items.length);
    let runningOffset = 0;

    for (let i = 0; i < items.length; i += 1) {
      const estimated = typeof itemSize === 'function' ? Number(itemSize(i, items[i])) : Number(itemSize);
      const fallbackSize = Number.isFinite(estimated) ? Math.max(1, estimated) : 1;
      const measured = measuredHeights[i];
      const safeSize = dynamicItemHeights && Number.isFinite(measured) ? Math.max(1, measured) : fallbackSize;
      sizes[i] = safeSize;
      offsets[i] = runningOffset;
      runningOffset += safeSize;
    }

    return { sizes, offsets, totalHeight: runningOffset };
  }, [dynamicItemHeights, itemSize, items, measuredHeights]);

  const startIndex = useMemo(() => {
    if (!metrics.offsets.length) return 0;
    const nearest = findStartIndex(metrics.offsets, Math.max(0, scrollTop));
    return clamp(nearest - overscan, 0, items.length - 1);
  }, [items.length, metrics.offsets, overscan, scrollTop]);

  const endIndex = useMemo(() => {
    if (!metrics.offsets.length) return -1;
    const viewBottom = scrollTop + height;
    let index = startIndex;
    while (index < items.length && metrics.offsets[index] < viewBottom) {
      index += 1;
    }
    return clamp(index + overscan, 0, items.length - 1);
  }, [height, items.length, metrics.offsets, overscan, scrollTop, startIndex]);

  const visibleRows = useMemo(() => {
    if (endIndex < startIndex) return [];
    const rows = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      rows.push(index);
    }
    return rows;
  }, [endIndex, startIndex]);

  const scrollToIndex = useCallback((index, align = 'auto') => {
    const viewport = viewportRef.current;
    if (!viewport || index < 0 || index >= items.length) return;

    const rowTop = metrics.offsets[index];
    const rowBottom = rowTop + metrics.sizes[index];
    const currentTop = viewport.scrollTop;
    const currentBottom = currentTop + height;

    if (align === 'start') {
      viewport.scrollTop = rowTop;
      return;
    }
    if (align === 'end') {
      viewport.scrollTop = Math.max(0, rowBottom - height);
      return;
    }
    if (rowTop < currentTop) {
      viewport.scrollTop = rowTop;
      return;
    }
    if (rowBottom > currentBottom) {
      viewport.scrollTop = Math.max(0, rowBottom - height);
    }
  }, [height, items.length, metrics.offsets, metrics.sizes]);

  useImperativeHandle(ref, () => ({ scrollToIndex }), [scrollToIndex]);

  const setRowNode = useCallback((index, node) => {
    if (!dynamicItemHeights) return;

    const currentObserver = observersRef.current.get(index);
    if (!node) {
      if (currentObserver) {
        currentObserver.disconnect();
        observersRef.current.delete(index);
      }
      return;
    }

    const applyHeight = (nextHeight) => {
      const safeHeight = Math.max(1, Math.ceil(nextHeight));
      setMeasuredHeights(prev => (prev[index] === safeHeight ? prev : { ...prev, [index]: safeHeight }));
    };

    applyHeight(node.getBoundingClientRect().height || node.offsetHeight || 0);
    if (typeof ResizeObserver === 'undefined') return;
    if (currentObserver) currentObserver.disconnect();

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      applyHeight(entry.contentRect?.height || node.getBoundingClientRect().height || node.offsetHeight || 0);
    });
    observer.observe(node);
    observersRef.current.set(index, observer);
  }, [dynamicItemHeights]);

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{ ...style, overflowY: 'auto', maxHeight: height, minHeight: 0 }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ position: 'relative', height: metrics.totalHeight }}>
        {visibleRows.map(index => (
          <div
            key={index}
            ref={(node) => setRowNode(index, node)}
            style={{
              position: 'absolute',
              top: metrics.offsets[index],
              left: 0,
              right: 0,
              minHeight: metrics.sizes[index]
            }}
          >
            {renderItem(items[index], index)}
          </div>
        ))}
      </div>
    </div>
  );
});

export default VirtualList;
