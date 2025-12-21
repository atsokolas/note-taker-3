import React, { useState } from 'react';
import ArticleList from '../components/ArticleList';
import AllHighlights from './AllHighlights';
import TagBrowser from './TagBrowser';
import Views from './Views';
import Collections from './Collections';
import { Page, Card, Button } from '../components/ui';

const LibraryMode = () => {
  const tabs = [
    { key: 'articles', label: 'Articles' },
    { key: 'highlights', label: 'Highlights' },
    { key: 'concepts', label: 'Concepts' },
    { key: 'views', label: 'Saved Views' },
    { key: 'collections', label: 'Collections' }
  ];
  const [active, setActive] = useState('articles');

  const renderTab = () => {
    switch (active) {
      case 'highlights':
        return <AllHighlights />;
      case 'concepts':
        return <TagBrowser />;
      case 'views':
        return <Views />;
      case 'collections':
        return <Collections />;
      default:
        return (
          <div className="library-embed">
            <ArticleList />
            <p className="muted small" style={{ marginTop: 12 }}>
              Select an article to open in the main viewer.
            </p>
          </div>
        );
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Library</h1>
        <p className="muted">Browse everything you’ve saved—articles, highlights, concepts, and smart views.</p>
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

export default LibraryMode;
