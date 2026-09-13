import React, { useMemo, useState } from 'react';
import NotebookVolumePage from '../components/think/notebook/NotebookVolumePage';
import { NotebookVolumePanel } from '../components/think/notebook/NotebookVolume';
import { volumeSnapshot } from '../components/think/notebook/notebookShareFixture';
import '../components/think/notebook/notebookShare.css';

const WIDTHS = [
  { id: '1440', px: 1440 },
  { id: '1320', px: 1320 },
  { id: '430', px: 430 }
];

const SCENES = [
  { id: 'compose', label: 'Compose' },
  { id: 'published', label: 'Published' },
  { id: 'stale', label: 'Stale' },
  { id: 'empty', label: 'Empty' },
  { id: 'public', label: 'Recipient' },
  { id: 'revised', label: 'Revised' },
  { id: 'revoked', label: 'Revoked' }
];

const catalog = [
  { notebookId: 'note-1', title: 'Who gets to experiment, and who pays?', contentHash: 'a' },
  { notebookId: 'note-2', title: 'Whose downside?', contentHash: 'b' }
];

const live = volumeSnapshot({ publishedAt: undefined });
const frozen = volumeSnapshot();
const revised = volumeSnapshot({
  revisedAt: '2026-09-13T19:00:00.000Z',
  correction: 'The later note now leads.'
});

const shareFor = (scene) => {
  if (scene === 'empty') {
    return {
      shared: false,
      publishable: false,
      catalog: [{ notebookId: 'note-1', title: 'Who gets to experiment, and who pays?', contentHash: 'a' }],
      preview: { title: '', introduction: '', pieces: [], contents: [], sources: [] },
      currentHash: 'hash'
    };
  }
  if (scene === 'published') {
    return {
      shared: true,
      slug: 'volume-slug',
      stale: false,
      publishable: true,
      catalog,
      preview: live,
      snapshot: frozen,
      currentHash: 'hash'
    };
  }
  if (scene === 'stale') {
    return {
      shared: true,
      slug: 'volume-slug',
      stale: true,
      publishable: true,
      catalog,
      preview: {
        ...live,
        introduction: 'Rewritten in the workshop.'
      },
      snapshot: frozen,
      currentHash: 'hash-2'
    };
  }
  return {
    shared: false,
    publishable: true,
    catalog,
    preview: live,
    currentHash: 'hash'
  };
};

const NotebookVolumePreview = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [width, setWidth] = useState(() => (
    WIDTHS.some((item) => item.id === params.get('width')) ? params.get('width') : '1440'
  ));
  const [scene, setScene] = useState(() => (
    SCENES.some((item) => item.id === params.get('scene')) ? params.get('scene') : 'compose'
  ));

  const setQuery = (nextWidth, nextScene) => {
    const search = new URLSearchParams({ width: nextWidth, scene: nextScene }).toString();
    window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
    setWidth(nextWidth);
    setScene(nextScene);
  };

  const share = shareFor(scene);

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
        data-testid="notebook-volume-preview-stage"
      >
        {scene === 'public' ? (
          <main className="shared-notebook-page" data-testid="shared-volume">
            <NotebookVolumePage snapshot={frozen} />
          </main>
        ) : null}
        {scene === 'revised' ? (
          <main className="shared-notebook-page" data-testid="shared-volume-revised">
            <NotebookVolumePage snapshot={revised} />
          </main>
        ) : null}
        {scene === 'revoked' ? (
          <main className="shared-notebook-page">
            <p className="shared-notebook-page__quiet">This volume is not published.</p>
          </main>
        ) : null}
        {scene !== 'public' && scene !== 'revised' && scene !== 'revoked' ? (
          <NotebookVolumePanel
            key={scene}
            notebookId="note-1"
            status="ready"
            share={share}
            title={scene === 'empty' ? '' : 'Who pays?'}
            introduction={scene === 'empty' ? '' : (scene === 'stale' ? 'Rewritten in the workshop.' : 'Two finished notes, one question.')}
            selection={scene === 'empty' ? ['note-1'] : ['note-1', 'note-2']}
          />
        ) : null}
      </div>
    </div>
  );
};

export default NotebookVolumePreview;
