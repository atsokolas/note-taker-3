import React from 'react';
import Export from './Export';
import { Page } from '../components/ui';

const Settings = () => {
  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Settings</h1>
        <p className="muted">Export your data and keep your workspace organized.</p>
      </div>
      <Export />
    </Page>
  );
};

export default Settings;
