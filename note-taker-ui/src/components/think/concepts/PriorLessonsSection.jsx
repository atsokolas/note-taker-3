import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adoptDecisionLessonEvidence, getConcepts } from '../../../api/concepts';

const ADOPTION_ROLES = Object.freeze([
  { value: 'support', label: 'Support' },
  { value: 'tension', label: 'Tension' },
  { value: 'context', label: 'Context' }
]);

const createRequestId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `adopt-lesson-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const roleLabel = (role) => {
  const normalized = String(role || '').toLowerCase();
  switch (normalized) {
    case 'support':
      return 'Support';
    case 'tension':
      return 'Tension';
    case 'context':
      return 'Context';
    default:
      return '';
  }
};

const decisionTitle = (lesson) => (
  lesson?.decision?.title
  || lesson?.decision?.summary
  || lesson?.decision?.id
  || 'Reviewed decision'
);

const sourcePageIdFor = (lesson, fallbackWikiPageId = '') => (
  String(lesson?.relevanceBasis?.pageId || lesson?.page?.id || fallbackWikiPageId || '').trim()
);

const isAcceptedLesson = (lesson) => (
  lesson?.acceptedIntoConcept === true
  || String(lesson?.status || '').toLowerCase() === 'accepted'
);

const adoptionErrorMessage = (error) => {
  const code = String(error?.response?.data?.code || '').trim();
  const serverError = error?.response?.data?.error;
  switch (code) {
    case 'stale_lesson':
      return serverError || 'This lesson changed after you opened the action. Reload and try again.';
    case 'role_conflict':
      return serverError || 'This lesson was already accepted with a different role.';
    case 'adoption_conflict':
    case 'concurrent_adoption':
      return serverError || 'This lesson was accepted concurrently. Reload the Concept evidence.';
    case 'lesson_unavailable':
      return serverError || 'This retained lesson is no longer available for review.';
    default:
      return serverError || error?.message || 'Could not accept this lesson as evidence.';
  }
};

const receiptForLesson = (lesson, evidence = {}) => {
  const adoptionId = String(lesson?.adoptionId || '').trim();
  if (!adoptionId) return '';
  const roles = ['support', 'tension', 'context'];
  for (const role of roles) {
    const match = (Array.isArray(evidence?.[role]) ? evidence[role] : []).find(item => (
      item?.kind === 'decision_lesson'
      && String(item?.ref?.id || item?.adoptionId || '') === adoptionId
    ));
    const receiptId = match?.provenance?.adoptionReceiptId;
    if (receiptId) return String(receiptId);
  }
  return '';
};

const emptyDraft = () => ({
  lessonId: '',
  destinationConceptId: '',
  role: '',
  requestId: '',
  step: 'choose',
  pending: false,
  error: '',
  errorCode: '',
  success: null
});

const destinationHref = (concept) => {
  const conceptId = String(concept?._id || concept?.id || '').trim();
  const conceptName = String(concept?.name || concept?.title || '').trim();
  if (!conceptId || !conceptName) return '';
  const params = new URLSearchParams({ tab: 'concepts', concept: conceptName, conceptId });
  const wikiPageId = String(concept?.continuityAnchor?.objectId || '').trim();
  if (wikiPageId && String(concept?.continuityAnchor?.objectType || '') === 'wiki_page') {
    params.set('investigation', '1');
    params.set('conceptId', conceptId);
    params.set('wikiPageId', wikiPageId);
  }
  return `/think?${params.toString()}`;
};

const PriorLessonEvidenceList = ({ items = [] }) => {
  if (!Array.isArray(items) || !items.length) {
    return <p className="concept-investigation__quiet">No observed evidence is attached.</p>;
  }
  return (
    <ul className="concept-prior-lessons__evidence">
      {items.map((item, index) => {
        const ref = item?.ref || item || {};
        const key = `${ref.type || 'source'}:${ref.id || index}`;
        return <li key={key}>{ref.title || ref.id || 'Observed evidence'}</li>;
      })}
    </ul>
  );
};

const PriorLessonRow = ({
  lesson,
  evidence,
  wikiPageId,
  concepts,
  conceptsLoading,
  draft,
  onStart,
  onCancel,
  onDestinationChange,
  onRoleChange,
  onContinueToConfirm,
  onBackToChoose,
  onConfirm,
  onRetry
}) => {
  const accepted = isAcceptedLesson(lesson);
  const active = !accepted && draft?.lessonId === lesson?.id;
  const choosing = active && draft.step === 'choose';
  const confirming = active && draft.step === 'confirm';
  const destination = concepts.find(concept => (
    String(concept?._id || concept?.id || '') === String(draft?.destinationConceptId || '')
  ));
  const destinationName = destination?.name || destination?.title || draft?.destinationConceptId || '';
  const receiptId = receiptForLesson(lesson, evidence) || draft?.success?.receiptId || '';
  const successHref = draft?.success?.destinationHref || '';

  return (
    <li className={`concept-prior-lessons__item${accepted ? ' is-accepted' : ''}`}>
      <div className="concept-prior-lessons__item-header">
        <div>
          <span className="concept-prior-lessons__eyebrow">
            {accepted ? 'Accepted into Concept' : 'Available for review'}
          </span>
          <h4>{decisionTitle(lesson)}</h4>
        </div>
        {accepted ? (
          <span className="concept-prior-lessons__accepted-role">
            {roleLabel(lesson.acceptedRole) || 'Accepted'}
          </span>
        ) : null}
      </div>

      {lesson.lesson ? <p className="concept-prior-lessons__lesson">{lesson.lesson}</p> : null}

      <div className="concept-prior-lessons__meta">
        {lesson.result ? <span>Result · {lesson.result}</span> : null}
        {lesson.observedAt ? (
          <span>Observed · {new Date(lesson.observedAt).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
          })}</span>
        ) : null}
      </div>

      <section className="concept-prior-lessons__observed" aria-label="Observed evidence">
        <span className="concept-prior-lessons__eyebrow">Observed evidence</span>
        <PriorLessonEvidenceList items={lesson.observedEvidence} />
      </section>

      {accepted ? (
        <footer className="concept-prior-lessons__provenance" aria-label="Accepted lesson provenance">
          <p>
            <strong>Decision</strong>
            <span aria-hidden="true"> → </span>
            <strong>Observed outcome</strong>
            <span aria-hidden="true"> → </span>
            <strong>{roleLabel(lesson.acceptedRole) || 'Recorded'} evidence</strong>
          </p>
          <dl className="concept-prior-lessons__acceptance">
            <div>
              <dt>Accepted role</dt>
              <dd>{roleLabel(lesson.acceptedRole) || 'Recorded'}</dd>
            </div>
            {lesson.adoptionId ? (
              <div>
                <dt>Adoption</dt>
                <dd>{lesson.adoptionId}</dd>
              </div>
            ) : null}
            {receiptId ? (
              <div>
                <dt>Receipt</dt>
                <dd>{receiptId}</dd>
              </div>
            ) : null}
          </dl>
        </footer>
      ) : null}

      {!accepted && !active ? (
        <div className="concept-prior-lessons__actions">
          <button type="button" onClick={() => onStart(lesson)}>
            Add as evidence
          </button>
        </div>
      ) : null}

      {choosing ? (
        <div
          className="concept-prior-lessons__chooser"
          role="region"
          aria-label="Choose destination and role"
        >
          <p className="concept-investigation__quiet">
            Choose an exact destination Concept and one evidence role. No role is suggested.
          </p>
          <label className="concept-prior-lessons__field">
            <span>Destination Concept</span>
            <select
              value={draft.destinationConceptId}
              onChange={event => onDestinationChange(event.target.value)}
              disabled={draft.pending || conceptsLoading}
              aria-required="true"
            >
              <option value="">
                {conceptsLoading ? 'Loading Concepts…' : 'Choose a destination Concept'}
              </option>
              {concepts.map(concept => {
                const id = String(concept?._id || concept?.id || '').trim();
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {concept.name || concept.title || id}
                  </option>
                );
              })}
            </select>
          </label>

          <fieldset className="concept-prior-lessons__roles" disabled={draft.pending}>
            <legend>Evidence role</legend>
            <div role="radiogroup" aria-label="Evidence role" aria-required="true">
              {ADOPTION_ROLES.map(option => (
                <label key={option.value} className="concept-prior-lessons__role">
                  <input
                    type="radio"
                    name={`prior-lesson-role-${lesson.id}`}
                    value={option.value}
                    checked={draft.role === option.value}
                    onChange={() => onRoleChange(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="concept-prior-lessons__actions">
            <button
              type="button"
              onClick={onContinueToConfirm}
              disabled={draft.pending || !draft.destinationConceptId || !draft.role}
            >
              Review confirmation
            </button>
            <button type="button" onClick={onCancel} disabled={draft.pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <div
          className="concept-prior-lessons__confirm"
          role="region"
          aria-label="Confirm lesson adoption"
        >
          <p>Confirm that you want to accept this retained lesson as Concept evidence.</p>
          <dl className="concept-prior-lessons__confirm-facts">
            <div>
              <dt>Destination Concept</dt>
              <dd>{destinationName}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel(draft.role)}</dd>
            </div>
            <div>
              <dt>Source decision</dt>
              <dd>{decisionTitle(lesson)}</dd>
            </div>
            <div>
              <dt>Lesson</dt>
              <dd>{lesson.lesson || 'No lesson text is recorded.'}</dd>
            </div>
            <div>
              <dt>Observed evidence</dt>
              <dd>
                <PriorLessonEvidenceList items={lesson.observedEvidence} />
              </dd>
            </div>
            <div>
              <dt>Source page</dt>
              <dd>{sourcePageIdFor(lesson, wikiPageId)}</dd>
            </div>
          </dl>

          {draft.pending ? (
            <p className="concept-prior-lessons__status" role="status" aria-live="polite">
              Accepting lesson as evidence…
            </p>
          ) : null}

          {draft.error ? (
            <div className="concept-prior-lessons__error" role="alert">
              <p>{draft.error}</p>
              <button type="button" onClick={onRetry} disabled={draft.pending}>
                Retry
              </button>
            </div>
          ) : null}

          {draft.success ? (
            <div className="concept-prior-lessons__status" role="status" aria-live="polite">
              <p>
                {draft.success.idempotent ? 'Already accepted' : 'Accepted'} into{' '}
                <strong>{draft.success.destinationName}</strong> as{' '}
                <strong>{roleLabel(draft.success.role)}</strong> evidence.
              </p>
              {draft.success.adoptionId ? <p>Adoption: {draft.success.adoptionId}</p> : null}
              {draft.success.receiptId ? <p>Receipt: {draft.success.receiptId}</p> : null}
              {successHref ? <Link to={successHref}>Open destination Concept</Link> : null}
            </div>
          ) : null}

          <div className="concept-prior-lessons__actions">
            <button
              type="button"
              onClick={onConfirm}
              disabled={draft.pending || Boolean(draft.success)}
            >
              {draft.pending ? 'Accepting…' : 'Confirm add as evidence'}
            </button>
            <button
              type="button"
              onClick={onBackToChoose}
              disabled={draft.pending || Boolean(draft.success)}
            >
              Back
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={draft.pending}
            >
              {draft.success ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
};

const PriorLessonsSection = ({
  priorLessons,
  evidence,
  wikiPageId = '',
  onAdopted
}) => {
  const items = Array.isArray(priorLessons?.items) ? priorLessons.items : [];
  const [concepts, setConcepts] = useState([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [conceptsError, setConceptsError] = useState('');
  const [conceptsRequestVersion, setConceptsRequestVersion] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const submitLockRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (!items.length) return undefined;
    setConceptsLoading(true);
    setConceptsError('');
    getConcepts({ force: true })
      .then(list => {
        if (!active) return;
        setConcepts(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!active) return;
        setConcepts([]);
        setConceptsError('Could not load destination Concepts.');
      })
      .finally(() => {
        if (active) setConceptsLoading(false);
      });
    return () => { active = false; };
  }, [conceptsRequestVersion, items.length]);

  if (!items.length) return null;

  const activeLesson = items.find(item => item?.id === draft.lessonId) || null;

  const startAdoption = (lesson) => {
    setDraft({
      ...emptyDraft(),
      lessonId: lesson.id,
      requestId: createRequestId(),
      step: 'choose'
    });
  };

  const cancelAdoption = () => {
    if (draft.pending) return;
    submitLockRef.current = false;
    setDraft(emptyDraft());
  };

  const submitAdoption = async () => {
    if (submitLockRef.current || draft.pending || !activeLesson) return;
    const destinationConceptId = String(draft.destinationConceptId || '').trim();
    const role = String(draft.role || '').trim().toLowerCase();
    const sourcePageId = sourcePageIdFor(activeLesson, wikiPageId);
    const decisionId = String(activeLesson?.decision?.id || '').trim();
    const lessonId = String(activeLesson?.id || '').trim();
    const expectedDecisionHash = String(activeLesson?.provenance?.immutableSnapshotHash || '').trim();
    const expectedOutcomeHash = String(activeLesson?.provenance?.outcomeRecordHash || '').trim();
    const destination = concepts.find(concept => (
      String(concept?._id || concept?.id || '') === destinationConceptId
    ));

    if (!destinationConceptId || !role || !sourcePageId || !decisionId || !lessonId
      || !draft.requestId || !expectedDecisionHash || !expectedOutcomeHash) {
      setDraft(previous => ({
        ...previous,
        error: 'Destination Concept, role, and exact lesson hashes are required.',
        errorCode: 'invalid_request'
      }));
      return;
    }

    submitLockRef.current = true;
    setDraft(previous => ({
      ...previous,
      pending: true,
      error: '',
      errorCode: '',
      success: null
    }));

    try {
      const result = await adoptDecisionLessonEvidence(destinationConceptId, {
        sourcePageId,
        decisionId,
        lessonId,
        role,
        requestId: draft.requestId,
        expectedDecisionHash,
        expectedOutcomeHash
      });
      setDraft(previous => ({
        ...previous,
        pending: false,
        success: {
          idempotent: Boolean(result?.idempotent),
          adoptionId: result?.adoption?.id || '',
          receiptId: result?.receipt?.id || result?.adoption?.provenance?.adoptionReceiptId || '',
          role: result?.adoption?.role || role,
          destinationConceptId,
          destinationName: destination?.name || destination?.title || destinationConceptId,
          destinationHref: destinationHref(destination)
        }
      }));
      if (typeof onAdopted === 'function') {
        await onAdopted(result, { destinationConceptId, destinationConcept: destination });
      }
    } catch (error) {
      setDraft(previous => ({
        ...previous,
        pending: false,
        error: adoptionErrorMessage(error),
        errorCode: String(error?.response?.data?.code || '')
      }));
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <section
      className="concept-prior-lessons"
      aria-labelledby="concept-prior-lessons-title"
      data-testid="concept-prior-lessons"
    >
      <header className="concept-prior-lessons__header">
        <div>
          <span className="concept-prior-lessons__eyebrow">Retained lessons · review only</span>
          <h3 id="concept-prior-lessons-title">Prior lessons from this Wiki lineage</h3>
          <p>
            Fully verified, human-reviewed outcomes from the exact Wiki page under investigation.
            Nothing is accepted until you choose a destination Concept and an explicit role.
          </p>
        </div>
        <span>{items.length}</span>
      </header>

      {conceptsError ? (
        <div className="concept-prior-lessons__error" role="alert">
          <p>{conceptsError}</p>
          <button
            type="button"
            onClick={() => setConceptsRequestVersion(value => value + 1)}
            disabled={conceptsLoading}
          >
            Retry destinations
          </button>
        </div>
      ) : null}

      <ul className="concept-prior-lessons__list">
        {items.map(lesson => (
          <PriorLessonRow
            key={lesson.id || lesson.decision?.id}
            lesson={lesson}
            evidence={evidence}
            wikiPageId={wikiPageId}
            concepts={concepts}
            conceptsLoading={conceptsLoading}
            draft={draft}
            onStart={startAdoption}
            onCancel={cancelAdoption}
            onDestinationChange={value => setDraft(previous => ({
              ...previous,
              destinationConceptId: value,
              success: null,
              error: ''
            }))}
            onRoleChange={value => setDraft(previous => ({
              ...previous,
              role: value,
              success: null,
              error: ''
            }))}
            onContinueToConfirm={() => setDraft(previous => ({
              ...previous,
              step: 'confirm',
              success: null,
              error: ''
            }))}
            onBackToChoose={() => setDraft(previous => ({
              ...previous,
              step: 'choose',
              success: null,
              error: ''
            }))}
            onConfirm={submitAdoption}
            onRetry={submitAdoption}
          />
        ))}
      </ul>
    </section>
  );
};

export {
  ADOPTION_ROLES,
  adoptionErrorMessage,
  createRequestId,
  isAcceptedLesson,
  roleLabel,
  sourcePageIdFor
};

export default PriorLessonsSection;
