import React, { useMemo, useState } from 'react';
import NotebookPublicPage from '../components/think/notebook/NotebookPublicPage';
import { NotebookSharePanel } from '../components/think/notebook/NotebookShare';
import { essaySnapshot } from '../components/think/notebook/notebookShareFixture';
import '../components/think/notebook/notebookShare.css';

const WIDTHS = [
  { id: '1440', px: 1440 },
  { id: '1320', px: 1320 },
  { id: '430', px: 430 }
];

const SCENES = [
  { id: 'preview', label: 'Preview' },
  { id: 'published', label: 'Published' },
  { id: 'stale', label: 'Stale' },
  { id: 'empty', label: 'Empty' },
  { id: 'public', label: 'Recipient' },
  { id: 'revoked', label: 'Revoked' }
];

const live = essaySnapshot({ publishedAt: undefined });
const frozen = essaySnapshot();
const empty = { title: 'Untitled', ownerDisplayName: 'Athan', blocks: [] };

const shareFor = (scene) => {
  if (scene === 'empty') {
    return { shared: false, publishable: false, preview: empty, currentHash: 'hash' };
  }
  if (scene === 'published') {
    return {
      shared: true,
      slug: 'essay-slug',
      stale: false,
      publishable: true,
      preview: live,
      snapshot: frozen,
      currentHash: 'hash'
    };
  }
  if (scene === 'stale') {
    return {
      shared: true,
      slug: 'essay-slug',
      stale: true,
      publishable: true,
      preview: {
        ...live,
        blocks: [...live.blocks, { id: 'p2', type: 'paragraph', text: 'Rewritten in the workshop.' }]
      },
      snapshot: frozen,
      currentHash: 'hash-2'
    };
  }
  return { shared: false, publishable: true, preview: live, currentHash: 'hash' };
};

const NotebookSharePreview = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [width, setWidth] = useState(() => (
    WIDTHS.some((item) => item.id === params.get('width')) ? params.get('width') : '1440'
  ));
  const [scene, setScene] = useState(() => (
    SCENES.some((item) => item.id === params.get('scene')) ? params.get('scene') : 'preview'
  ));

  const setQuery = (nextWidth, nextScene) => {
    const search = new URLSearchParams({ width: nextWidth, scene: nextScene }).toString();
    window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
    setWidth(nextWidth);
    setScene(nextScene);
  };

  return (
    <div className="notebook-share-preview">
      <div className="notebook-share-preview__controls" aria-label="Preview controls">
        {WIDTHS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={width === item.id}
            onClick={() => setQuery(item.id, scene)}
          >
            {item.id}
          </button>
        ))}
        {SCENES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scene === item.id}
            onClick={() => setQuery(width, item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="notebook-share-preview__stage"
        style={{ '--preview-width': `${WIDTHS.find((item) => item.id === width)?.px || 1440}px` }}
        data-testid="notebook-share-preview-stage"
      >
        {scene === 'public' ? (
          <main className="shared-notebook-page" data-testid="shared-notebook">
            <NotebookPublicPage snapshot={frozen} />
          </main>
        ) : null}
        {scene === 'revoked' ? (
          <main className="shared-notebook-page">
            <p className="shared-notebook-page__quiet">This note is not published.</p>
          </main>
        ) : null}
        {scene !== 'public' && scene !== 'revoked' ? (
          <NotebookSharePanel key={scene} notebookId="essay-1" status="ready" share={shareFor(scene)} />
        ) : null}
      </div>
    </div>
  );
};

export default NotebookSharePreview;
