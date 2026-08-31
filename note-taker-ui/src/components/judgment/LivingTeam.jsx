import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import {
  approveLivingTeamVersion,
  getLivingTeam,
  grantLivingTeamSeat,
  handOffLivingTeam
} from '../../api/judgmentResolution';
import {
  ROLE_LABEL,
  SENTENCE_LABEL,
  POSTURE_LABEL,
  approvalLine,
  casePath,
  hasRoom,
  partedLine
} from '../../pages/livingTeamModel';

const ROLES = ['observe', 'research', 'propose', 'decide', 'approve', 'publish'];

const Position = ({ position }) => {
  if (!position) return null;
  const href = casePath(position.pageId);
  return (
    <article className={`living-team__position${position.self ? ' is-self' : ''}`}>
      <p className="living-team__who">
        {href ? <Link to={href}>{position.label}</Link> : <span>{position.label}</span>}
        {position.decisionRight ? <small> may decide</small> : null}
      </p>
      {position.claim ? <p className="living-team__claim">{position.claim}</p> : (
        <p className="living-team__silence">No held sentence on their page yet.</p>
      )}
      {position.action?.posture ? (
        <p className="living-team__posture">{POSTURE_LABEL[position.action.posture] || position.action.posture}</p>
      ) : null}
      {position.confidence ? <p className="living-team__confidence">{position.confidence}</p> : null}
      {position.assumptions?.length ? (
        <p><span>Assumes</span>{position.assumptions.join(' ')}</p>
      ) : null}
    </article>
  );
};

const LivingTeam = ({ pageId }) => {
  const reduced = usePrefersReducedMotion();
  const systemStatus = useSystemStatusControls();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [label, setLabel] = useState('');
  const [memberPageId, setMemberPageId] = useState('');
  const [role, setRole] = useState('observe');
  const [conditions, setConditions] = useState('');
  const [handoffPageId, setHandoffPageId] = useState('');
  const [handoffLabel, setHandoffLabel] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    try {
      const next = await getLivingTeam({ pageId });
      setTeam(next);
      setError('');
    } catch (_loadError) {
      setError('The room could not be read.');
    }
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (intent, work) => {
    if (busy) return;
    setBusy(intent);
    setError('');
    try {
      const result = await work();
      if (result?.team) setTeam(result.team);
      if (result?.receipt) {
        systemStatus.setLatestReceipt({
          id: result.receipt.id,
          title: result.receipt.title || 'The room moved',
          summary: result.receipt.summary || '',
          status: 'completed',
          completedAt: result.receipt.completedAt
        });
      }
      return result;
    } catch (failure) {
      const message = failure?.response?.data?.error || failure?.message || 'The paper did not take.';
      setError(message);
      systemStatus.setRecoverableFailure({
        stage: 'living-team',
        message,
        retryable: true
      });
      return null;
    } finally {
      setBusy('');
    }
  };

  if (!pageId) return null;
  const visible = team?.visible !== false;
  const room = hasRoom(team) || open;
  const mayAdminister = Boolean(team?.authority?.administer?.allowed);
  const mayApprove = Boolean(team?.authority?.approve?.allowed);
  const positions = Array.isArray(team?.positions) ? team.positions : [];
  const dissent = Array.isArray(team?.dissent) ? team.dissent : [];
  const brief = team?.brief;
  const approvals = Array.isArray(team?.approvals) ? team.approvals : [];
  const walk = Array.isArray(team?.handoffs) ? team.handoffs[team.handoffs.length - 1] : null;

  if (!visible && team) return null;

  return (
    <section
      className={`living-team${reduced ? ' is-still' : ''}`}
      aria-labelledby="living-team-title"
    >
      <h2 id="living-team-title">The room</h2>
      {!room ? (
        <p className="living-team__silence">
          This case is still yours alone.
          {mayAdminister ? (
            <button type="button" onClick={() => setOpen(true)}>Name who may sit here</button>
          ) : null}
        </p>
      ) : null}

      {room && team?.mandate?.purpose ? (
        <p className="living-team__mandate">{team.mandate.purpose}</p>
      ) : null}
      {room && team?.mandate?.exposureLabel ? (
        <p className="living-team__exposure">{team.mandate.exposureLabel}</p>
      ) : null}

      {positions.length ? (
        <div className="living-team__overlay" aria-label="Authored positions">
          {positions.map((position) => (
            <Position key={position.pageId || position.userId} position={position} />
          ))}
        </div>
      ) : null}

      {dissent.length ? (
        <section className="living-team__dissent" aria-label="Authored dissent">
          <h3>Where minds part</h3>
          <ol>
            {dissent.map((pair) => (
              <li key={`${pair.left?.pageId}-${pair.right?.pageId}`}>
                <p>{partedLine(pair)}</p>
                {pair.left?.pageId ? (
                  <Link to={casePath(pair.left.pageId)}>{pair.left.label}</Link>
                ) : null}
                {pair.right?.pageId ? (
                  <Link to={casePath(pair.right.pageId)}>{pair.right.label}</Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {brief && !brief.silent ? (
        <section className="living-team__brief" aria-label="Meeting brief">
          <h3>Before the room begins</h3>
          <ol>
            {brief.sentences.map((row, index) => (
              <li key={`${row.kind}-${index}`} data-kind={row.kind}>
                <span>{SENTENCE_LABEL[row.kind] || row.kind}</span>
                {row.record?.pageId ? (
                  <Link to={casePath(row.record.pageId)}>{row.text}</Link>
                ) : (
                  <p>{row.text}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {approvals.length ? (
        <section className="living-team__approvals" aria-label="Approval receipts">
          <h3>Approvals</h3>
          <ol>
            {approvals.map((row) => (
              <li key={row.receiptId} className={row.supersededBy ? 'is-superseded' : ''}>
                <p>{approvalLine(row)}</p>
                {row.conditions ? <p>{row.conditions}</p> : null}
                {row.object?.versionHash ? (
                  <small title={row.object.versionHash}>{row.object.versionHash.slice(0, 8)}</small>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {walk?.walk?.length ? (
        <section className="living-team__walk" aria-label="Handoff">
          <h3>A calm guided walk</h3>
          <p>
            {walk.from?.label} handed this case to {walk.to?.label}.
            {walk.fromAuthorshipIntact ? ' Departed authorship is intact.' : ''}
          </p>
          <ol>
            {walk.walk.map((step, index) => (
              <li key={`${step.kind}-${index}`}>
                <span>{step.title}</span>
                {step.record?.pageId ? (
                  <Link to={casePath(step.record.pageId)}>{step.text}</Link>
                ) : (
                  <p>{step.text}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {mayApprove ? (
        <form
          className="living-team__approve"
          onSubmit={(event) => {
            event.preventDefault();
            run('approve', () => approveLivingTeamVersion({ pageId, conditions }));
          }}
        >
          <p className="living-team__authority">{team.authority.approve.label}</p>
          <label>
            Conditions, if any
            <input
              value={conditions}
              onChange={(event) => setConditions(event.target.value)}
              placeholder="Leave blank if none."
            />
          </label>
          <button type="submit" disabled={Boolean(busy)}>
            {busy === 'approve' ? 'Approving…' : 'Approve this version'}
          </button>
        </form>
      ) : team?.authority?.approve?.label && room ? (
        <p className="living-team__authority">{team.authority.approve.label}</p>
      ) : null}

      {mayAdminister && (room || open) ? (
        <form
          className="living-team__grant"
          onSubmit={(event) => {
            event.preventDefault();
            run('grant', () => grantLivingTeamSeat({
              pageId,
              memberPageId,
              label,
              roles: [role]
            })).then((result) => {
              if (result) {
                setLabel('');
                setMemberPageId('');
                setOpen(true);
              }
            });
          }}
        >
          <h3>Name a seat</h3>
          <p>Their paper stays theirs. This overlay only names a right.</p>
          <label>
            How they are named
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label>
            Their page
            <input value={memberPageId} onChange={(event) => setMemberPageId(event.target.value)} />
          </label>
          <label>
            Right
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLES.map((id) => (
                <option key={id} value={id}>{ROLE_LABEL[id]}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={Boolean(busy) || !memberPageId}>
            {busy === 'grant' ? 'Naming…' : 'Name them'}
          </button>
        </form>
      ) : null}

      {mayAdminister && room ? (
        <form
          className="living-team__handoff"
          onSubmit={(event) => {
            event.preventDefault();
            run('handoff', () => handOffLivingTeam({
              pageId,
              toPageId: handoffPageId,
              toLabel: handoffLabel
            }));
          }}
        >
          <h3>Hand the case on</h3>
          <p>Posture, rights, questions, dissent, and triggers travel. Their original page does not move.</p>
          <label>
            Successor’s name
            <input value={handoffLabel} onChange={(event) => setHandoffLabel(event.target.value)} />
          </label>
          <label>
            Successor’s page
            <input value={handoffPageId} onChange={(event) => setHandoffPageId(event.target.value)} />
          </label>
          <button type="submit" disabled={Boolean(busy) || !handoffPageId}>
            {busy === 'handoff' ? 'Handing on…' : 'Hand it on'}
          </button>
        </form>
      ) : null}

      {error ? <p className="living-team__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default LivingTeam;
