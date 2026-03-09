import React from 'react';
import { Button, Card } from '../ui';

const ReadwiseImportCard = ({
  importing = false,
  importStatus = '',
  importStats = null,
  onReadwiseImport = () => {}
}) => (
  <Card className="settings-card">
    <h2>Import</h2>
    <p className="muted">Upload a Readwise CSV to seed your highlights.</p>
    <div className="settings-import-row">
      <div>
        <p className="muted-label">Readwise CSV</p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onReadwiseImport}
          disabled={importing}
        />
      </div>
      <Button variant="secondary" disabled={importing}>
        {importing ? 'Importing…' : 'Upload CSV'}
      </Button>
    </div>
    {importStatus && <p className="status-message">{importStatus}</p>}
    {importStats && (
      <div className="import-summary">
        <p className="muted-label">Summary</p>
        <p>Articles imported: {importStats.importedArticles}</p>
        <p>Highlights imported: {importStats.importedHighlights}</p>
        <p>Rows skipped: {importStats.skippedRows}</p>
        <p>Parse errors: {importStats.parseErrors}</p>
      </div>
    )}
  </Card>
);

export default ReadwiseImportCard;
