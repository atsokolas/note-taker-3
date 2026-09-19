import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
  roomShelfItemClass
} from '../collection/RoomShelf';
import {
  issueShelfMeta,
  issuesShelfLabel,
  resolvePaperIssueId,
  shelfIssuesForPaper,
  windowLine
} from '../../pages/editionModel';

const NARROW_SHELF = '(max-width: 700px)';

const useNarrowShelf = () => {
  const read = () => (
    typeof window !== 'undefined'
      ? Boolean(window.matchMedia?.(NARROW_SHELF)?.matches)
      : false
  );
  const [narrow, setNarrow] = useState(read);

  useEffect(() => {
    const query = window.matchMedia?.(NARROW_SHELF);
    if (!query) return undefined;
    const handleChange = () => setNarrow(Boolean(query.matches));
    handleChange();
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, []);

  return narrow;
};

const EditionShelfNav = ({
  papers = [],
  paper,
  selectedIssueId = '',
  readProfileIssue,
  onOpenArrivals,
  onOpenArchive,
  onNavigate,
  className = '',
  inSheet = false
}) => {
  const narrow = useNarrowShelf();
  const hiddenOnPhone = narrow && !inSheet;
  const issues = paper?.issues || [];
  const shelfIssues = shelfIssuesForPaper(issues, selectedIssueId);
  const issuesLabel = issuesShelfLabel(issues, selectedIssueId);

  const choosePaper = (nextPaper) => {
    const issueId = resolvePaperIssueId(nextPaper, readProfileIssue);
    if (issueId) onNavigate?.(issueId, nextPaper.profile);
  };

  const shelf = (
    <RoomShelf
      as="nav"
      className={`edition-shelf${className ? ` ${className}` : ''}`}
      aria-label="Editions"
      label="Editions"
    >
      <RoomShelfSection label="Editions">
        <RoomShelfList>
          <li>
            <RoomShelfButton type="button" onClick={onOpenArrivals}>
              <span>New arrivals</span>
            </RoomShelfButton>
          </li>
          <li>
            <Link className={roomShelfItemClass()} to="/library?scope=later">
              <span>Later</span>
            </Link>
          </li>
          <li>
            <Link className={roomShelfItemClass()} to="/editions?power=1">
              <span>Power through</span>
            </Link>
          </li>
        </RoomShelfList>
      </RoomShelfSection>

      {papers.length ? (
        <RoomShelfSection label="Publications">
          <RoomShelfList>
            {papers.map((row) => (
              <li key={row.profile}>
                {row.profile === paper?.profile ? (
                  <span
                    className={roomShelfItemClass({ active: true })}
                    aria-current="true"
                  >
                    <span>{row.title}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={roomShelfItemClass()}
                    onClick={() => choosePaper(row)}
                  >
                    <span>{row.title}</span>
                  </button>
                )}
              </li>
            ))}
          </RoomShelfList>
        </RoomShelfSection>
      ) : null}

      {paper ? (
        <RoomShelfSection label={issuesLabel}>
          <RoomShelfList>
            {shelfIssues.map((issue) => {
              const active = issue._id === selectedIssueId;
              const range = windowLine(issue);
              const meta = issueShelfMeta(issue, paper.issueLabel);
              const label = [paper.title, meta, range].filter(Boolean).join(', ');
              return (
                <li key={issue._id}>
                  <Link
                    className={roomShelfItemClass({ active })}
                    aria-current={active ? 'page' : undefined}
                    to={`/editions/${encodeURIComponent(issue._id)}`}
                    aria-label={label || 'This issue'}
                  >
                    <span>{range || 'This issue'}</span>
                    {meta ? <RoomShelfMeta>{meta}</RoomShelfMeta> : null}
                  </Link>
                </li>
              );
            })}
          </RoomShelfList>
          <button type="button" className="edition-shelf__archive" onClick={onOpenArchive}>
            All issues →
          </button>
        </RoomShelfSection>
      ) : null}
    </RoomShelf>
  );

  if (hiddenOnPhone) return null;
  return shelf;
};

export { useNarrowShelf, NARROW_SHELF };
export default EditionShelfNav;
