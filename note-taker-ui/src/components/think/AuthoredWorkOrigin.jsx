import React from 'react';
import { resolveSavedSourcePath, safeInternalPath } from '../../utils/sourceRoutes';
import './authored-work-origin.css';

const keptDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const AuthoredWorkOrigin = ({ importMeta, sourceBlocks = [] }) => {
  if (importMeta?.sourceType !== 'authored_exploration') return null;
  const originHref = safeInternalPath(importMeta.sourceUrl, '/wiki/read/') || safeInternalPath(importMeta.sourceUrl, '/library');
  if (!originHref) return null;
  const passageHref = resolveSavedSourcePath(importMeta);
  const sourceDoors = (Array.isArray(sourceBlocks) ? sourceBlocks : []).flatMap((block) => {
    const href = resolveSavedSourcePath(block);
    if (!href) return [];
    return [{
      href,
      label: String(block.articleTitle || 'Library source').trim() || 'Library source'
    }];
  });
  const label = String(importMeta.sourceLabel || 'the original page').trim();
  const date = keptDate(importMeta.importedAt);

  return (
    <footer className="authored-work-origin" aria-label="Authored work origin">
      <p>
        {date ? <><time dateTime={new Date(importMeta.importedAt).toISOString()}>{`Kept ${date}`}</time><span aria-hidden="true"> · </span></> : null}
        <a href={originHref}>{`Return to ${label}`}</a>
      </p>
      {sourceDoors.length ? (
        <div className="authored-work-origin__sources" aria-label="Library sources">
          {sourceDoors.map((source, index) => (
            <a key={`${source.href}:${index}`} href={source.href}>{`Open ${source.label}`}</a>
          ))}
        </div>
      ) : passageHref ? (
        <a href={passageHref}>Open the chosen passage</a>
      ) : null}
    </footer>
  );
};

export default AuthoredWorkOrigin;
