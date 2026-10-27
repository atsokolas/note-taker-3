import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import plan from './reviewerFixturePlan.json';
import { createSetupClient, createFixtureSession, fixtureReceipt, verifySetupIdentity, editionFixturePayload, editionFixtureReceipt } from './reviewerFixtureSetup';
import '../styles/reviewer-fixtures.css';

const ReviewerFixtures = () => {
  const [identity, setIdentity] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [conceptId, setConceptId] = useState('');
  const [error, setError] = useState('');
  const session = useRef(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const controller = useRef(null);

  useEffect(() => {
    mounted.current = true;
    const onSessionChange = event => {
      if (event.key !== null && !['token', 'refreshToken'].includes(event.key)) return;
      controller.current?.abort(); session.current = null;
      setConceptId('');
      setState(null); setIdentity(null); setBusy(false); setError('The session changed. Reopen setup in the reviewer account.');
    };
    window.addEventListener('storage', onSessionChange);
    return () => { mounted.current = false; controller.current?.abort(); window.removeEventListener('storage', onSessionChange); };
  }, []);

  const open = async event => {
    event.preventDefault();
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    controller.current?.abort();
    const activeController = new AbortController(); controller.current = activeController;
      try {
        const client = createSetupClient(activeController.signal, { conceptId: conceptId.trim() });
        const verified = verifySetupIdentity(await client.identity());
        if (!mounted.current || activeController.signal.aborted) return;
        setIdentity(verified);
        session.current = createFixtureSession({ client, storage: window.localStorage, locks: navigator.locks });
        const initial = await session.current.inspect();
        if (mounted.current && !activeController.signal.aborted) setState(initial);
      } catch (failure) {
        if (mounted.current && !activeController.signal.aborted) setError(failure?.reviewerSetup
          ? failure.message : 'Reviewer verification or saved-state read failed. No setup writes were made by this check.');
      } finally {
        running.current = false;
        if (mounted.current && !activeController.signal.aborted) setBusy(false);
      }
  };

  const perform = async action => {
    if (running.current || !session.current) return;
    const activeSession = session.current;
    running.current = true; setBusy(true); setError('');
    try {
      const result = await activeSession[action]();
      if (mounted.current && session.current === activeSession) { setState(result); setIdentity(result.identity); }
    } catch (failure) {
      if (mounted.current && session.current === activeSession) { setState(null); setError(failure?.reviewerSetup
        ? failure.message : 'Setup is paused. Check saved state before continuing.'); }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <main className="reviewer-fixtures" aria-labelledby="reviewer-fixtures-title">
      <h1 id="reviewer-fixtures-title">Reviewer fixture setup</h1>
      {!identity ? (
        <form onSubmit={open}>
          <p>This setup is available only to the verified reviewer account. Enter the private concept ID already verified for that account.</p>
          <label htmlFor="reviewer-concept-id">Reviewer concept ID</label>
          <input id="reviewer-concept-id" value={conceptId} onChange={event => setConceptId(event.target.value)}
            required pattern="[a-f0-9]{24}" maxLength={24} autoComplete="off" spellCheck={false} disabled={busy} />
          <Button type="submit" disabled={busy}>Verify reviewer</Button>
          {busy && <p role="status">Verifying the isolated reviewer account…</p>}
        </form>
      ) : (
        <>
          <p>Verified reviewer ownership and active AI holds. Save two fictional sources, one highlight and one private draft Wiki. Setup calls no inference route.</p>
          <p>This prepares test data. Connector acceptance has not run.</p>
          <p>Use only this existing reviewer browser. Keep setup closed in other browser profiles.</p>
          {plan.sources.map((source, index) => (
            <details key={source.fixtureKey}>
              <summary>Source {index + 1}: {source.title}</summary>
              <p>Author: {source.author}</p>
              <p>Fictional identity URL: <code>{source.url}</code></p>
              <textarea readOnly rows={10} aria-label={`Source ${index + 1} exact text`} value={source.text} />
            </details>
          ))}
          <details>
            <summary>Source 1 highlight and separate reader thought</summary>
            <textarea readOnly rows={4} aria-label="Exact highlight quotation" value={plan.highlight.text} />
            <textarea readOnly rows={2} aria-label="Exact reader thought" value={plan.highlight.note} />
          </details>
          <details>
            <summary>Private Wiki: {plan.wiki.title}</summary>
            <p>Private · Draft · Topic · Selected sources</p>
            <textarea readOnly rows={3} aria-label="Exact Wiki baseline" value={plan.wiki.body} />
          </details>
          <div className="reviewer-fixtures__actions">
            <Button type="button" disabled={busy || !state || state.complete || identity.fixtureBindingComplete}
              onClick={() => perform('run')}>Save fictional fixtures</Button>
            <Button type="button" disabled={busy} onClick={() => perform('inspect')}>Check saved state</Button>
          </div>
          {state && <p role="status">{state.complete ? 'Saved and read back exactly. Source events are held with zero attempts.'
            : `${state.sources.filter(Boolean).length} of 2 sources saved; ${state.highlight ? 'highlight saved' : 'highlight not saved'}; ${state.wiki ? 'Wiki saved' : 'Wiki not saved'}.`}</p>}
          {identity.fixtureBindingComplete && <p>Fixture binding is complete. Setup is read-only.</p>}
          {state?.complete && <>
            <label htmlFor="reviewer-fixture-receipt">Verified private setup receipt</label>
            <textarea id="reviewer-fixture-receipt" readOnly rows={18} value={JSON.stringify(fixtureReceipt(state), null, 2)} />
            <Link to={`/wiki/workspace?page=${state.wiki._id || state.wiki.id}`}>Open the private Wiki</Link>
          </>}
          {identity.userId === plan.edition.ownerId && <section aria-labelledby="reviewer-edition-title">
            <h2 id="reviewer-edition-title">Fictional Edition setup</h2>
            <p>Prepare one sample-only paper and its first issue from the existing fictional source 1. Weekly cadence only groups the issue; this creates no schedule.</p>
            <p>Check the original fixtures and Edition before saving. Existing differences are preserved. This does not enable Wiki inference or save a source into the Library.</p>
            <details>
              <summary>Exact fictional profile and baseline item</summary>
              <textarea readOnly rows={10} aria-label="Exact Edition profile" value={JSON.stringify(plan.edition.profile, null, 2)} />
              <textarea readOnly rows={12} aria-label="Exact Edition baseline" value={JSON.stringify(editionFixturePayload(), null, 2)} />
            </details>
            <div className="reviewer-fixtures__actions">
              <Button type="button" disabled={busy} onClick={() => perform('inspectEdition')}>Check Edition setup</Button>
              <Button type="button" disabled={busy || !state?.edition || state.edition.complete || identity.fixtureBindingComplete}
                onClick={() => perform('runEdition')}>Save fictional Edition</Button>
            </div>
            {state?.edition && <p role="status">{state.edition.complete ? 'Fictional Edition saved and read back exactly. Its quotation remains unchecked.'
              : state.edition.profile ? 'Fictional profile saved; first issue not saved.' : 'Fictional profile and first issue are not saved.'}</p>}
            {state?.edition?.complete && <>
              <label htmlFor="reviewer-edition-receipt">Verified private Edition receipt</label>
              <textarea id="reviewer-edition-receipt" readOnly rows={18} value={JSON.stringify(editionFixtureReceipt(state), null, 2)} />
              <Link to={`/editions/${state.edition.issue._id || state.edition.issue.id}`}>Open the private fictional Edition</Link>
            </>}
          </section>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
};

export default ReviewerFixtures;
