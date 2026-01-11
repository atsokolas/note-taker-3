import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Journey from './Journey';
import Resurface from './Resurface';
import api from '../api';
import { Page, Card, Button, SectionHeader, QuietButton, SubtleDivider, Chip } from '../components/ui';
import WorkspaceShell from '../layouts/WorkspaceShell';
import useReflections from '../hooks/useReflections';

const ReviewMode = () => {
  const tabs = [
    { key: 'journey', label: 'Journey' },
    { key: 'reflections', label: 'Reflections' },
    { key: 'resurface', label: 'Resurface' }
  ];
  const [active, setActive] = useState('journey');
  const [range, setRange] = useState('14d');
  const location = useLocation();
  const navigate = useNavigate();
  const reflectionsEnabled = active === 'reflections';
  const { data: reflections, loading: reflectionsLoading, error: reflectionsError, refresh } = useReflections(range, {
    enabled: reflectionsEnabled
  });

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const rangeOptions = [
    { label: '7d', value: '7d' },
    { label: '14d', value: '14d' },
    { label: '30d', value: '30d' }
  ];

  const setQueryParams = (updates) => {
    const params = new URLSearchParams(location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: false });
  };

  const createId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const startWeeklyReflection = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const title = `Weekly Reflection — ${today}`;
    const prompts = [
      'What did I learn?',
      'What changed my mind?',
      'What needs deeper thought?'
    ];
    const blocks = [
      { id: createId(), type: 'heading', level: 2, text: title },
      ...prompts.map(text => ({ id: createId(), type: 'paragraph', text }))
    ];
    const contentParts = [
      `<h2>${escapeHtml(title)}</h2>`,
      ...prompts.map(text => `<p><strong>${escapeHtml(text)}</strong></p>`)
    ];
    const payload = {
      title,
      content: contentParts.join(''),
      blocks
    };
    try {
      const res = await api.post('/api/notebook', payload, authHeaders());
      if (res.data?._id) {
        navigate(`/notebook?entryId=${res.data._id}`);
      }
    } catch (err) {
      console.error('Error creating reflection note:', err);
    }
  };

  const renderTab = () => {
    switch (active) {
      case 'resurface':
        return <Resurface />;
      case 'reflections': {
        const activeConcepts = reflections.activeConcepts || [];
        const notesInProgress = reflections.notesInProgress || [];
        const openQuestionGroups = reflections.openQuestions?.groups || [];
        const deltaSummary = reflections.deltaSummary || [];
        return (
          <div className="section-stack">
            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Actively thinking about</span>
                <span className="muted small">Last {range}</span>
              </div>
              {reflectionsLoading && <p className="muted small">Loading reflections…</p>}
              {reflectionsError && <p className="status-message error-message">{reflectionsError}</p>}
              {!reflectionsLoading && !reflectionsError && (
                <div className="reflection-list">
                  {activeConcepts.length === 0 && <p className="muted small">No concept activity yet.</p>}
                  {activeConcepts.map(concept => (
                    <div key={concept.name} className="reflection-row">
                      <div className="reflection-row-title">
                        <Link to={`/think?concept=${encodeURIComponent(concept.name)}`} className="article-title-link">
                          {concept.name}
                        </Link>
                        {concept.description && <span className="muted small">{concept.description}</span>}
                      </div>
                      <div className="reflection-row-meta">
                        <span className="muted small">{concept.highlightsCount} highlights</span>
                        <span className="muted small">{concept.notesCount} notes</span>
                        <span className="muted small">{concept.questionsOpenCount} open questions</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Notes in progress</span>
                <span className="muted small">{notesInProgress.length} updated</span>
              </div>
              {!reflectionsLoading && !reflectionsError && (
                <div className="reflection-list">
                  {notesInProgress.length === 0 && <p className="muted small">No notes updated in this range.</p>}
                  {notesInProgress.map(note => (
                    <div key={note.id} className="reflection-row">
                      <div className="reflection-row-title">
                        <Link to={`/notebook?entryId=${note.id}`} className="article-title-link">
                          {note.title}
                        </Link>
                        {note.snippet && <span className="muted small">{note.snippet}</span>}
                      </div>
                      <div className="reflection-row-meta">
                        {(note.conceptMentions || []).slice(0, 3).map(tag => (
                          <Chip key={`${note.id}-${tag}`}>{tag}</Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Open questions</span>
                <span className="muted small">
                  {openQuestionGroups.reduce((sum, group) => sum + group.questions.length, 0)} open
                </span>
              </div>
              {!reflectionsLoading && !reflectionsError && (
                <div className="reflection-list">
                  {openQuestionGroups.length === 0 && <p className="muted small">No open questions right now.</p>}
                  {openQuestionGroups.map(group => (
                    <div key={group.concept} className="reflection-group">
                      <div className="reflection-group-title">{group.concept}</div>
                      {group.questions.map(question => (
                        <div key={question.id} className="reflection-row">
                          <div className="reflection-row-title">
                            <span className="article-title-link">{question.text}</span>
                          </div>
                          {question.linkedNotebookEntryId && (
                            <div className="reflection-row-meta">
                              <Link to={`/notebook?entryId=${question.linkedNotebookEntryId}`} className="muted small">
                                Open note
                              </Link>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">What changed</span>
                <span className="muted small">Last 7 days vs prior 7</span>
              </div>
              {!reflectionsLoading && !reflectionsError && (
                <ul className="reflection-list reflection-list--bullets">
                  {deltaSummary.length === 0 && <li className="muted small">No changes yet.</li>}
                  {deltaSummary.map((line, idx) => (
                    <li key={`${line}-${idx}`} className="muted small">{line}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        );
      }
      default:
        return <Journey />;
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const nextRange = params.get('range');
    if (tab && tabs.some(t => t.key === tab)) {
      setActive(tab);
    }
    if (nextRange && rangeOptions.some(option => option.value === nextRange)) {
      setRange(nextRange);
    }
  }, [location.search]);

  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Review sections" subtitle="Switch your lens." />
      <div className="section-stack">
        {tabs.map(t => (
          <QuietButton
            key={t.key}
            className={active === t.key ? 'is-active' : ''}
            onClick={() => {
              setActive(t.key);
              setQueryParams({ tab: t.key });
            }}
          >
            {t.label}
          </QuietButton>
        ))}
      </div>
      {active === 'reflections' && (
        <>
          <SubtleDivider />
          <SectionHeader title="Range" subtitle="Focus window." />
          <div className="section-stack">
            {rangeOptions.map(option => (
              <QuietButton
                key={option.value}
                className={range === option.value ? 'is-active' : ''}
                onClick={() => {
                  setRange(option.value);
                  setQueryParams({ tab: 'reflections', range: option.value });
                }}
              >
                {option.label}
              </QuietButton>
            ))}
          </div>
        </>
      )}
      <SubtleDivider />
      <p className="muted small">Review is optional, but it shows you where the patterns live.</p>
    </div>
  );

  const mainPanel = (
    <div className="section-stack">
      {renderTab()}
    </div>
  );

  const rightPanel = (
    <div className="section-stack">
      <SectionHeader
        title={active === 'reflections' ? 'Quick actions' : 'Review tools'}
        subtitle={active === 'reflections' ? 'Keep momentum.' : 'Lightweight by design.'}
      />
      {active === 'reflections' ? (
        <>
          <Button variant="secondary" onClick={refresh} disabled={reflectionsLoading}>
            {reflectionsLoading ? 'Refreshing…' : 'Refresh reflections'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const note = reflections.notesInProgress?.[0];
              if (note?.id) navigate(`/notebook?entryId=${note.id}`);
            }}
            disabled={!reflections.notesInProgress?.[0]?.id}
          >
            Continue last note
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const concept = reflections.activeConcepts?.[0];
              if (concept?.name) navigate(`/think?concept=${encodeURIComponent(concept.name)}`);
            }}
            disabled={!reflections.activeConcepts?.[0]?.name}
          >
            Open active concept
          </Button>
          <Button onClick={startWeeklyReflection}>Start weekly reflection</Button>
          <p className="muted small">Create a note with prompts and move your thinking forward.</p>
        </>
      ) : (
        <p className="muted small">Switch to Reflections when you want the editorial snapshot.</p>
      )}
    </div>
  );

  return (
    <Page>
      <WorkspaceShell
        title="Review"
        subtitle="Revisit what matters: recent reading, resurfaced highlights, and steady patterns."
        eyebrow="Mode"
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle={active === 'reflections' ? 'Quick actions' : 'Review tools'}
        defaultRightOpen
      />
    </Page>
  );
};

export default ReviewMode;
