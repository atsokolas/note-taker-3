import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Journey from './Journey';
import Resurface from './Resurface';
import Trending from './Trending';
import api from '../api';
import { Page, Card, Button, TagChip, SectionHeader, QuietButton, SubtleDivider } from '../components/ui';
import WorkspaceShell from '../layouts/WorkspaceShell';

const ReviewMode = () => {
  const tabs = [
    { key: 'journey', label: 'Journey' },
    { key: 'resurface', label: 'Resurface' },
    { key: 'trends', label: 'Trends' },
    { key: 'reflection', label: 'Reflection' }
  ];
  const [active, setActive] = useState('journey');
  const [reflection, setReflection] = useState({ mostActiveConcepts: [], increasedConcepts: [], openQuestions: [] });
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionError, setReflectionError] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadReflection = async () => {
    setReflectionLoading(true);
    setReflectionError('');
    try {
      const res = await api.get('/api/reflection?range=30d', authHeaders());
      setReflection(res.data || { mostActiveConcepts: [], increasedConcepts: [], openQuestions: [] });
    } catch (err) {
      setReflectionError(err.response?.data?.error || 'Failed to load reflection.');
    } finally {
      setReflectionLoading(false);
    }
  };

  const renderTab = () => {
    switch (active) {
      case 'resurface':
        return <Resurface />;
      case 'trends':
        return <Trending />;
      case 'reflection':
        return (
          <div className="section-stack">
            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Most active concepts</span>
                <span className="muted small">Last 30 days</span>
              </div>
              {reflectionLoading && <p className="muted small">Loading reflection…</p>}
              {reflectionError && <p className="status-message error-message">{reflectionError}</p>}
              {!reflectionLoading && !reflectionError && (
                <div className="highlight-tag-chips" style={{ flexWrap: 'wrap' }}>
                  {reflection.mostActiveConcepts.length === 0 && <span className="muted small">No recent activity yet.</span>}
                  {reflection.mostActiveConcepts.map(c => (
                    <TagChip key={c.tag} to={`/tags/${encodeURIComponent(c.tag)}`}>{c.tag} <span className="tag-count">{c.count}</span></TagChip>
                  ))}
                </div>
              )}
            </Card>

            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Concepts gaining momentum</span>
                <span className="muted small">Compared to last month</span>
              </div>
              {!reflectionLoading && !reflectionError && (
                <div className="section-stack">
                  {reflection.increasedConcepts.length === 0 && <p className="muted small">No concept increases yet.</p>}
                  {reflection.increasedConcepts.map(c => (
                    <div key={c.tag} className="search-card">
                      <div className="search-card-top">
                        <Link to={`/tags/${encodeURIComponent(c.tag)}`} className="article-title-link">{c.tag}</Link>
                        <span className="muted small">+{c.delta}</span>
                      </div>
                      <p className="muted small">{c.currentCount} this month · {c.previousCount} last month</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Open questions</span>
                <span className="muted small">{reflection.openQuestions.length} open</span>
              </div>
              {!reflectionLoading && !reflectionError && (
                <div className="section-stack">
                  {reflection.openQuestions.length === 0 && <p className="muted small">No open questions right now.</p>}
                  {reflection.openQuestions.slice(0, 6).map(q => (
                    <div key={q._id} className="search-card">
                      <div className="search-card-top">
                        <span className="article-title-link">{q.text}</span>
                        {q.linkedTagName && (
                          <TagChip to={`/tags/${encodeURIComponent(q.linkedTagName)}`}>{q.linkedTagName}</TagChip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        );
      default:
        return <Journey />;
    }
  };

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
              if (t.key === 'reflection') loadReflection();
            }}
          >
            {t.label}
          </QuietButton>
        ))}
      </div>
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
      <SectionHeader title="Review tools" subtitle="Lightweight by design." />
      {active === 'reflection' ? (
        <>
          <Button variant="secondary" onClick={loadReflection} disabled={reflectionLoading}>
            {reflectionLoading ? 'Refreshing…' : 'Refresh reflection'}
          </Button>
          <p className="muted small">Reflection uses your last 30 days to spot what is building momentum.</p>
        </>
      ) : (
        <p className="muted small">Switch to Reflection when you want the 30-day snapshot.</p>
      )}
    </div>
  );

  return (
    <Page>
      <WorkspaceShell
        title="Review"
        subtitle="Revisit what matters: recent reading, resurfaced highlights, and trending patterns."
        eyebrow="Mode"
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Review tools"
        defaultRightOpen
      />
    </Page>
  );
};

export default ReviewMode;
