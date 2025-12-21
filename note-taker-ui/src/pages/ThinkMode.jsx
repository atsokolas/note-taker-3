import React, { useState } from 'react';
import Notebook from './Notebook';
import TagBrowser from './TagBrowser';
import AllHighlights from './AllHighlights';
import { Page, Card, Button } from '../components/ui';

const ThinkMode = () => {
  const tabs = [
    { key: 'notebook', label: 'Notebook' },
    { key: 'concepts', label: 'Concepts' },
    { key: 'backlinks', label: 'Backlinks' }
  ];
  const [active, setActive] = useState('notebook');

  const renderTab = () => {
    switch (active) {
      case 'concepts':
        return <TagBrowser />;
      case 'backlinks':
        return (
          <div>
            <p className="muted" style={{ marginBottom: 12 }}>
              See where ideas connect. Expand highlights to view references into notebook entries and collections.
            </p>
            <AllHighlights />
          </div>
        );
      default:
        return <Notebook />;
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Think</h1>
        <p className="muted">Write, connect concepts, and see backlinks across your notes and highlights.</p>
      </div>
      <Card className="tab-card">
        <div className="tab-bar">
          {tabs.map(t => (
            <Button
              key={t.key}
              variant={active === t.key ? 'primary' : 'secondary'}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="tab-body">
          {renderTab()}
        </div>
      </Card>
    </Page>
  );
};

export default ThinkMode;
