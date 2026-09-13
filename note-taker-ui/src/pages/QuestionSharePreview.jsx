import React, { useMemo, useState } from 'react';
import QuestionShareView from '../components/think/QuestionShareView';
import {
  QUESTION_NOT_PUBLISHED,
  QUESTION_SHARE_PRIVACY,
  QUESTION_SHARE_TAKE,
  THINK_SHARE_REVOKE,
  questionContribution,
  questionSnapshot
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
  { id: 'together', label: 'Together' },
  { id: 'taken', label: 'Taken' },
  { id: 'owner', label: 'Owner' },
  { id: 'revised', label: 'Revised' },
  { id: 'revoked', label: 'Revoked' }
];

const live = questionSnapshot({ publishedAt: undefined });
const frozen = questionSnapshot();
const together = questionSnapshot({
  contributions: [questionContribution()]
});
const taken = questionSnapshot({
  contributions: [questionContribution({
    interpretation: 'The horizon is the claim, not the fact.',
    interpretedBy: 'Athan'
  })]
});
const revised = questionSnapshot({
  revisedAt: '2026-09-13T15:00:00.000Z',
  correction: 'The exception now leads.',
  question: {
    ...questionSnapshot().question,
    text: 'What survives the rewrite?',
    paragraphs: [{ id: 'p1', type: 'paragraph', text: 'Rewritten in the workshop.' }]
  }
});

const shareFor = (scene) => {
  if (scene === 'published') {
    return { shared: true, slug: 'qslug', stale: false, snapshot: frozen, preview: live, contributions: [] };
  }
  if (scene === 'stale') {
    return { shared: true, slug: 'qslug', stale: true, snapshot: frozen, preview: revised, contributions: [] };
  }
  if (scene === 'together') {
    return { shared: true, slug: 'qslug', stale: false, snapshot: frozen, preview: live, contributions: together.contributions };
  }
  if (scene === 'taken') {
    return { shared: true, slug: 'qslug', stale: false, snapshot: frozen, preview: live, contributions: taken.contributions };
  }
  if (scene === 'owner') {
    return { shared: true, slug: 'qslug', stale: false, snapshot: frozen, preview: live, contributions: together.contributions };
  }
  return { shared: false, stale: false, snapshot: null, preview: live };
};

const QuestionSharePreview = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [width, setWidth] = useState(() => (
    WIDTHS.some((item) => item.id === params.get('width')) ? params.get('width') : '1440'
  ));
  const [scene, setScene] = useState(() => (
    SCENES.some((item) => item.id === params.get('scene')) ? params.get('scene') : 'compose'
  ));
  const [offered, setOffered] = useState([]);
  const [take, setTake] = useState('The horizon is the claim, not the fact.');
  const [takeSaved, setTakeSaved] = useState('');

  const setQuery = (nextWidth, nextScene) => {
    const search = new URLSearchParams({ width: nextWidth, scene: nextScene }).toString();
    window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
    setWidth(nextWidth);
    setScene(nextScene);
  };

  const share = shareFor(scene);
  const reader = share.shared ? (share.snapshot || (share.stale ? null : share.preview)) : share.preview;
  const pending = share.stale ? share.preview : null;
  const ownerReadings = (share.contributions || []).map((row) => {
    const interpretation = String(takeSaved || '').trim();
    if (!interpretation) return row;
    return { ...row, interpretation, interpretedBy: 'Athan' };
  });
  const publicPage = scene === 'taken' ? taken : scene === 'together' ? together : frozen;
  const publicSnapshot = {
    ...publicPage,
    contributions: [
      ...(publicPage.contributions || []),
      ...(scene === 'together' || scene === 'public' ? offered : [])
    ]
  };
  const isPublicPage = scene === 'public' || scene === 'together' || scene === 'taken';

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
        data-testid="question-share-preview-stage"
      >
        {isPublicPage ? (
          <main className="shared-concept-page shared-question-page" data-testid="shared-question-page">
            <QuestionShareView
              snapshot={publicSnapshot}
              onOffer={scene === 'taken' ? null : async (reading) => {
                setOffered((current) => [
                  ...current,
                  {
                    id: `local-${current.length + 1}`,
                    ...reading,
                    createdAt: '2026-09-13T16:00:00.000Z'
                  }
                ]);
              }}
            />
          </main>
        ) : null}
        {scene === 'revised' ? (
          <main className="shared-concept-page shared-question-page" data-testid="shared-question-revised">
            <QuestionShareView snapshot={revised} />
          </main>
        ) : null}
        {scene === 'revoked' ? (
          <main className="shared-concept-page">
            <p className="muted">{QUESTION_NOT_PUBLISHED}</p>
          </main>
        ) : null}
        {!isPublicPage && scene !== 'revised' && scene !== 'revoked' ? (
          <section className="notebook-share" data-testid="question-share-modal">
            <p className="notebook-share__privacy">{QUESTION_SHARE_PRIVACY}</p>
            {reader ? (
              <div className="notebook-share__preview" data-testid="question-share-preview">
                <p className="notebook-share__preview-label">What a reader will see</p>
                <QuestionShareView
                  snapshot={{ ...reader, contributions: ownerReadings }}
                  compact
                />
              </div>
            ) : null}
            {pending ? (
              <div className="notebook-share__preview notebook-share__preview--pending" data-testid="question-share-pending">
                <p className="notebook-share__preview-label">Pending an update</p>
                <QuestionShareView snapshot={pending} compact />
              </div>
            ) : null}
            {scene === 'owner' && ownerReadings.length ? (
              <div className="notebook-share__letters" data-testid="question-share-takes">
                <label className="notebook-share__url-label" htmlFor="question-share-preview-take">
                  How you take this
                </label>
                <p className="notebook-share__hint">{ownerReadings[0].by}</p>
                <textarea
                  id="question-share-preview-take"
                  className="notebook-share__correction"
                  value={take}
                  maxLength={400}
                  rows={3}
                  onChange={(event) => setTake(event.target.value)}
                />
                <p className="notebook-share__hint">{QUESTION_SHARE_TAKE}</p>
                <button
                  type="button"
                  onClick={() => setTakeSaved(take)}
                >
                  Save how you take it
                </button>
              </div>
            ) : null}
            {share.shared ? (
              <>
                <p className="notebook-share__hint">{THINK_SHARE_REVOKE}</p>
                {share.stale ? (
                  <button type="button" data-testid="question-update-share">Update shared version</button>
                ) : null}
              </>
            ) : (
              <button type="button" data-testid="question-publish-share">Create public link</button>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default QuestionSharePreview;
