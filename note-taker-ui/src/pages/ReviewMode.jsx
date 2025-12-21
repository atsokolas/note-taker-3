import React, { useState } from 'react';
import Journey from './Journey';
import Resurface from './Resurface';
import Trending from './Trending';
import { Page, Card, Button } from '../components/ui';

const ReviewMode = () => {
  const tabs = [
    { key: 'journey', label: 'Journey' },
    { key: 'resurface', label: 'Resurface' },
    { key: 'trends', label: 'Trends' }
  ];
  const [active, setActive] = useState('journey');

  const renderTab = () => {
    switch (active) {
      case 'resurface':
        return <Resurface />;
      case 'trends':
        return <Trending />;
      default:
        return <Journey />;
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Review</h1>
        <p className="muted">Revisit what matters: recent reading, resurfaced highlights, and trending patterns.</p>
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

export default ReviewMode;
