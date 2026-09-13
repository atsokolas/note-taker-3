import React, { useMemo, useState } from 'react';
import ConceptShareView from '../components/think/ConceptShareView';
import {
  CONCEPT_NOT_PUBLISHED,
  CONCEPT_SHARE_PRIVACY,
  THINK_SHARE_REVOKE,
  conceptSnapshot
} from '../components/think/thinkShareFixture';
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
  { id: 'public', label: 'Recipient' },
  { id: 'revised', label: 'Revised' },
  { id: 'revoked', label: 'Revoked' }
];

const live = conceptSnapshot({ publishedAt: undefined });
const frozen = conceptSnapshot();
const revised = conceptSnapshot({
  revisedAt: '2026-09-13T15:00:00.000Z',
  correction: 'The cost now leads.',
  concept: {
    ...conceptSnapshot().concept,
    framing: 'Rewritten in the workshop.'
  }
});

const shareFor = (scene) => {
  if (scene === 'published') {
    return { shared: true, slug: 'cslug', stale: false, snapshot: frozen, preview: live };
  }
  if (scene === 'stale') {
    return { shared: true, slug: 'cslug', stale: true, snapshot: frozen, preview: revised };
  }
  return { shared: false, stale: false, snapshot: null, preview: live };
};

const ConceptSharePreview = () => {
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
  const reader = share.shared ? (share.snapshot || (share.stale ? null : share.preview)) : share.preview;
  const pending = share.stale ? share.preview : null;

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
        data-testid="concept-share-preview-stage"
      >
        {scene === 'public' ? (
          <main className="shared-concept-page" data-testid="shared-concept-page">
            <ConceptShareView snapshot={frozen} />
          </main>
        ) : null}
        {scene === 'revised' ? (
          <main className="shared-concept-page" data-testid="shared-concept-revised">
            <ConceptShareView snapshot={revised} />
          </main>
        ) : null}
        {scene === 'revoked' ? (
          <main className="shared-concept-page">
            <p className="muted">{CONCEPT_NOT_PUBLISHED}</p>
          </main>
        ) : null}
        {scene !== 'public' && scene !== 'revised' && scene !== 'revoked' ? (
          <section className="notebook-share" data-testid="concept-share-modal">
            <p className="notebook-share__privacy">{CONCEPT_SHARE_PRIVACY}</p>
            {reader ? (
              <div className="notebook-share__preview" data-testid="concept-share-preview">
                <p className="notebook-share__preview-label">What a reader will see</p>
                <ConceptShareView snapshot={reader} compact />
              </div>
            ) : null}
            {pending ? (
              <div className="notebook-share__preview notebook-share__preview--pending" data-testid="concept-share-pending">
                <p className="notebook-share__preview-label">Pending an update</p>
                <ConceptShareView snapshot={pending} compact />
              </div>
            ) : null}
            {share.shared ? (
              <>
                <p className="notebook-share__hint">{THINK_SHARE_REVOKE}</p>
                {share.stale ? (
                  <button type="button" data-testid="concept-update-share">Update shared version</button>
                ) : null}
              </>
            ) : (
              <button type="button" data-testid="concept-publish-share">Create public link</button>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default ConceptSharePreview;
