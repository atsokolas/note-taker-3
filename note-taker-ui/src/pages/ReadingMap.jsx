import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getReadingMap } from '../api/library';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { useMediaQuery, usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import { PageHeader } from '../components/ui';
import { buildCanonicalArticlePath } from '../utils/sourceRoutes';
import {
  IDENTITY,
  centreOn,
  dotRadius,
  frameFor,
  gapSentence,
  orderClusters,
  panBy,
  project,
  sourcesIn,
  stepToward,
  tween,
  zoomAt,
  zoomForCluster
} from './readingMapModel';
import '../styles/reading-map.css';

// Everything you have read, as one picture.
//
// Plain SVG rather than the force graph in the bundle: the server already
// decided where every source lives, so nothing here needs a physics
// simulation, and a canvas cannot take its colours from the theme tokens or
// hold a focus ring. Each dot, name and blind spot is an element the
// stylesheet paints, in every palette, and the camera is three numbers.

const FALLBACK_SIZE = { width: 960, height: 620 };
const CAMERA_MS = 280;
const ease = t => 1 - (1 - t) ** 3;

const useFrameSize = (ref) => {
  const [size, setSize] = useState(FALLBACK_SIZE);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

/* The camera eases between views unless motion is unwelcome, in which case
   it simply arrives. */
const useCamera = (reduced) => {
  const [view, setView] = useState(IDENTITY);
  const viewRef = useRef(IDENTITY);
  const frameRef = useRef(0);
  const apply = useCallback((next) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const moveTo = useCallback((target) => {
    cancelAnimationFrame(frameRef.current);
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      apply(target);
      return;
    }
    const from = viewRef.current;
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / CAMERA_MS);
      apply(tween(from, target, ease(t)));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [apply, reduced]);
  const jumpTo = useCallback((next) => {
    cancelAnimationFrame(frameRef.current);
    apply(typeof next === 'function' ? next(viewRef.current) : next);
  }, [apply]);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  return { view, moveTo, jumpTo };
};

const Card = ({ source, at }) => (
  <div className="reading-map__card" style={{ left: at.x, top: at.y }} aria-hidden="true">
    <p className="reading-map__card-title">{source.title}</p>
    {source.line ? <p className="reading-map__card-line">“{source.line}”</p> : null}
  </div>
);

const MapCanvas = ({ map, onOpen, reduced }) => {
  const frameRef = useRef(null);
  const size = useFrameSize(frameRef);
  const { view, moveTo, jumpTo } = useCamera(reduced);
  const clusters = useMemo(() => orderClusters(map.clusters), [map.clusters]);
  /* Each subject's whole circle is in frame, not just its middle. */
  const frame = useMemo(() => frameFor([
    ...map.sources,
    ...map.gaps,
    ...map.clusters.flatMap(c => [{ x: c.x - c.radius, y: c.y - c.radius }, { x: c.x + c.radius, y: c.y + c.radius }])
  ], size.width, size.height, 72), [map, size]);
  const [hoverId, setHoverId] = useState('');
  /* Where the keyboard is: on a subject, or inside one on a source. */
  const [focus, setFocus] = useState({ level: 'clusters', cluster: 0, source: 0, shown: false });
  const inside = focus.level === 'sources' ? sourcesIn(map, clusters[focus.cluster]?.id) : [];
  const keyed = focus.shown && focus.level === 'sources' ? inside[focus.source] : null;
  const keyedCluster = focus.shown ? clusters[focus.cluster] : null;
  const shown = map.sources.find(source => source.id === hoverId) || keyed;

  const announce = (() => {
    if (keyed) return `${keyed.title}. ${keyed.line || ''} Enter opens it; Escape goes back to the subjects.`;
    if (keyedCluster) {
      const count = keyedCluster.size === 1 ? 'one source' : `${keyedCluster.size} sources`;
      return `${keyedCluster.name}, ${count}. Enter steps inside.`;
    }
    return '';
  })();

  const handleKey = (event) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      moveTo(zoomAt(view, 1.4, { x: size.width / 2, y: size.height / 2 }));
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      moveTo(zoomAt(view, 1 / 1.4, { x: size.width / 2, y: size.height / 2 }));
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      moveTo(IDENTITY);
      return;
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      if (!focus.shown) {
        setFocus(current => ({ ...current, shown: true }));
        return;
      }
      if (focus.level === 'clusters') {
        const next = stepToward(focus.cluster, clusters, event.key);
        setFocus(current => ({ ...current, cluster: next }));
      } else {
        const next = stepToward(focus.source, inside, event.key);
        setFocus(current => ({ ...current, source: next }));
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!focus.shown) {
        setFocus(current => ({ ...current, shown: true }));
      } else if (focus.level === 'clusters' && clusters[focus.cluster]) {
        const cluster = clusters[focus.cluster];
        setFocus(current => ({ ...current, level: 'sources', source: 0 }));
        moveTo(centreOn(cluster, frame, zoomForCluster(cluster, frame)));
      } else if (keyed) {
        onOpen(keyed);
      }
      return;
    }
    if (event.key === 'Escape' && focus.level === 'sources') {
      event.preventDefault();
      setFocus(current => ({ ...current, level: 'clusters' }));
      moveTo(IDENTITY);
    }
  };

  /* Wheel zooms around the cursor. Registered by hand because React's wheel
     listener is passive and the page would scroll underneath the zoom. */
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022));
      jumpTo(current => zoomAt(current, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [jumpTo]);

  /* One pointer pans; two pinch. A press that barely moved is still a click. */
  const pointers = useRef(new Map());
  const travelled = useRef(0);
  const [dragging, setDragging] = useState(false);
  const local = (event) => {
    const rect = frameRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointers.current.set(event.pointerId, local(event));
    travelled.current = 0;
  };
  const onPointerMove = (event) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = local(event);
    if (pointers.current.size === 1) {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      travelled.current += Math.abs(dx) + Math.abs(dy);
      if (travelled.current > 4) {
        if (!dragging) {
          setDragging(true);
          frameRef.current.setPointerCapture?.(event.pointerId);
        }
        jumpTo(current => panBy(current, dx, dy));
      }
    } else if (pointers.current.size === 2) {
      const [other] = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
      const before = Math.hypot(previous.x - other.x, previous.y - other.y) || 1;
      const after = Math.hypot(point.x - other.x, point.y - other.y) || 1;
      travelled.current += 10;
      jumpTo(current => zoomAt(current, after / before, { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 }));
    }
    pointers.current.set(event.pointerId, point);
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) setDragging(false);
  };
  const openUnlessDragged = source => () => {
    if (travelled.current > 4) return;
    onOpen(source);
  };

  const at = point => project(point, frame, view);
  const fitted = view === IDENTITY || (view.k === 1 && !view.tx && !view.ty);

  return (
    <div
      ref={frameRef}
      className={`reading-map__frame${dragging ? ' is-dragging' : ''}`}
      tabIndex={0}
      role="application"
      aria-roledescription="map"
      aria-label="Your reading as a map. Arrow keys move between subjects, Enter steps inside one and opens a source, Escape steps back out, plus and minus zoom."
      onKeyDown={handleKey}
      onFocus={(event) => {
        /* Arriving by keyboard lights the first subject; a click does not. */
        let byKeyboard = false;
        try { byKeyboard = event.target.matches(':focus-visible'); } catch (_error) { byKeyboard = false; }
        if (byKeyboard) setFocus(current => ({ ...current, shown: true }));
      }}
      onBlur={() => setFocus(current => ({ ...current, shown: false }))}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="reading-map-frame"
    >
      <svg className="reading-map__svg" width={size.width} height={size.height} aria-hidden="true">
        {map.clusters.map(cluster => (
          <circle
            key={cluster.id}
            className={`reading-map__halo${keyedCluster?.id === cluster.id ? ' is-active' : ''}`}
            cx={at(cluster).x}
            cy={at(cluster).y}
            r={cluster.radius * frame.scale * view.k + 16}
          />
        ))}
        {map.gaps.map(gap => {
          const place = at(gap);
          return (
            <g key={gap.name} className="reading-map__gap" data-testid="reading-map-gap">
              <circle className="reading-map__gap-ring" cx={place.x} cy={place.y} r={34 * Math.sqrt(view.k)} />
              <text className="reading-map__gap-name" x={place.x} y={place.y + 5} textAnchor="middle">{gap.name}</text>
            </g>
          );
        })}
        {map.sources.map(source => {
          const place = at(source);
          const active = shown?.id === source.id;
          return (
            <circle
              key={source.id}
              className={`reading-map__dot${active ? ' is-active' : ''}`}
              cx={place.x}
              cy={place.y}
              r={dotRadius(source.marks, view.k)}
              onPointerEnter={() => setHoverId(source.id)}
              onPointerLeave={() => setHoverId(current => (current === source.id ? '' : current))}
              onClick={openUnlessDragged(source)}
              data-testid="reading-map-dot"
            />
          );
        })}
        {/* Names last, so a dot never sits on top of a word. */}
        {map.clusters.map(cluster => (
          <text
            key={cluster.id}
            className={`reading-map__name${keyedCluster?.id === cluster.id ? ' is-active' : ''}`}
            x={at(cluster).x}
            y={at(cluster).y - (cluster.radius * frame.scale * view.k + 16) - 8}
            textAnchor="middle"
          >
            {cluster.name}
          </text>
        ))}
      </svg>
      {shown ? <Card source={shown} at={at(shown)} /> : null}
      {!fitted ? (
        <button type="button" className="reading-map__reset" onClick={() => moveTo(IDENTITY)}>
          Whole map
        </button>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
};

/* On a phone the map becomes its index: each subject, what it holds, and
   where the writing has gone without the reading. */
const MapList = ({ map }) => (
  <div className="reading-map__list">
    {orderClusters(map.clusters).map(cluster => (
      <section key={cluster.id} className="reading-map__subject" aria-labelledby={`subject-${cluster.id}`}>
        <h2 id={`subject-${cluster.id}`}>{cluster.name}</h2>
        <ul>
          {sourcesIn(map, cluster.id).map(source => (
            <li key={source.id}>
              <Link to={buildCanonicalArticlePath(source.id)}>{source.title}</Link>
              {source.line ? <p>“{source.line}”</p> : null}
            </li>
          ))}
        </ul>
      </section>
    ))}
    {map.gaps.length ? (
      <section className="reading-map__subject reading-map__subject--gaps" aria-labelledby="subject-gaps">
        <h2 id="subject-gaps">Where your reading has not gone</h2>
        <ul>
          {map.gaps.map(gap => <li key={gap.name}><em>{gap.name}.</em> {gapSentence(gap)}</li>)}
        </ul>
      </section>
    ) : null}
  </div>
);

const ReadingMap = () => {
  useDocumentTitle('Map', 'Library');
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 640px)');
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState({ loading: true, map: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    getReadingMap()
      .then(map => { if (!cancelled) setState({ loading: false, map, error: '' }); })
      .catch(() => { if (!cancelled) setState({ loading: false, map: null, error: 'The map could not be drawn just now.' }); });
    return () => { cancelled = true; };
  }, []);

  const open = useCallback(source => navigate(buildCanonicalArticlePath(source.id)), [navigate]);
  const { loading, map, error } = state;
  const ready = map?.status === 'ready' && map.sources?.length;
  const lede = (() => {
    if (loading) return '';
    if (error) return error;
    if (!ready) return 'The map appears once there is enough reading to draw: about eight sources with passages you marked.';
    if (narrow) return 'Your sources, gathered by what they are about.';
    return map.gaps?.length
      ? 'Each dot is a source, set beside the ones that mean the same thing. The italic names are what you write about and have barely read.'
      : 'Each dot is a source, set beside the ones that mean the same thing. Larger dots are where you marked more.';
  })();

  return (
    <main className={`reading-map${narrow ? ' is-narrow' : ''}`} aria-labelledby="reading-map-title" aria-busy={loading || undefined}>
      <PageHeader
        eyebrow={<Link to="/library">← Library</Link>}
        titleId="reading-map-title"
        title="Your reading, as a map"
        lede={lede}
      />
      {loading ? <p className="reading-map__quiet" role="status">Drawing the map…</p> : null}
      {ready && narrow ? <MapList map={map} /> : null}
      {ready && !narrow ? <MapCanvas map={map} onOpen={open} reduced={reduced} /> : null}
      {ready && !narrow && map.gaps?.length ? (
        <ul className="reading-map__gap-notes">
          {map.gaps.map(gap => <li key={gap.name}><em>{gap.name}.</em> {gapSentence(gap)}</li>)}
        </ul>
      ) : null}
    </main>
  );
};

export default ReadingMap;
