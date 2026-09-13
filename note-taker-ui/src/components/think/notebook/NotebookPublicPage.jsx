import React from 'react';
import { Link } from 'react-router-dom';
import NotebookEssay from './NotebookEssay';
import { NOTEBOOK_SHARE_COLOPHON } from './notebookShareFixture';
import './notebookShare.css';

const PrintNote = () => (
  <p className="shared-notebook-page__print">
    <button type="button" onClick={() => window.print()}>
      Print this note
    </button>
  </p>
);

export default function NotebookPublicPage({ snapshot, onAsk = null }) {
  if (!snapshot) return null;
  return (
    <div className="shared-notebook-page__inner">
      <Link to="/" className="shared-notebook-page__home">Noeis</Link>
      <NotebookEssay snapshot={snapshot} onAsk={onAsk} />
      <p className="shared-notebook-page__colophon">{NOTEBOOK_SHARE_COLOPHON}</p>
      <PrintNote />
    </div>
  );
}
