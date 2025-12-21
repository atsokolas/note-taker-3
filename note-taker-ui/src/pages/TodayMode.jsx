import React, { useState } from 'react';
import Today from './Today';
import Brain from './Brain';
import { Page, Card, Button } from '../components/ui';

const TodayMode = () => {
  const tabs = [
    { key: 'desk', label: 'Desk' },
    { key: 'brain', label: 'Brain Snapshot' }
  ];
  const [active, setActive] = useState('desk');

  const renderTab = () => {
    if (active === 'brain') return <Brain />;
    return <Today />;
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Today</h1>
        <p className="muted">Start here each day—resurfaced highlights, quick insights, and your desk.</p>
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

export default TodayMode;
