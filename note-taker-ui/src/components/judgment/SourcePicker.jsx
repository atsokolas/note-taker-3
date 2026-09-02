import React, { useEffect, useState } from 'react';
import { searchKeyword } from '../../api/retrieval';
import { rankSourceOptions, sourcesFromSearch } from '../../pages/sourceMention';

/**
 * The sources you can reach for while writing a reason.
 *
 * Two lists, deliberately not merged in the reader's head: what is already on
 * this case, and what the library turned up. The first needs no search — the
 * reader bound those to this belief themselves — so it is there the instant
 * the mark is typed, and the library is only asked when there is something to
 * ask it.
 *
 * A search that finds nothing says so. It does not quietly show the bound list
 * again and let the reader think that was the answer.
 */
const SourcePicker = ({ bound = [], query = '', onChoose, onDismiss }) => {
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const [asked, setAsked] = useState('');

  /* The library is asked on a pause, not a keystroke. Three letters is the
     point where a title search stops returning the whole shelf. */
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 3) {
      setFound([]);
      setAsked('');
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const payload = await searchKeyword({ q: needle, type: ['article', 'highlight'] });
        if (!cancelled) setFound(sourcesFromSearch(payload));
      } catch (_error) {
        if (!cancelled) setFound([]);
      } finally {
        if (!cancelled) {
          setSearching(false);
          setAsked(needle);
        }
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const options = rankSourceOptions({ bound, found, query });
  const nothingFound = Boolean(asked) && !searching && !options.length;

  return (
    <div className="judgment-sources" role="listbox" aria-label="Sources">
      {options.map((option) => (
        <button
          key={`${option.origin}:${option.id}`}
          type="button"
          role="option"
          aria-selected="false"
          className={`judgment-sources__option is-${option.origin}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose?.(option)}
        >
          <span className="judgment-sources__label">
            {option.label}
            {/* Only where a name repeats inside this very list. */}
            {option.detail ? <span className="judgment-sources__detail">{option.detail}</span> : null}
          </span>
          {option.origin === 'bound' ? (
            <span className="judgment-sources__where">on this case</span>
          ) : null}
        </button>
      ))}

      {searching ? <p className="judgment-sources__quiet">Looking…</p> : null}

      {nothingFound ? (
        <p className="judgment-sources__quiet">Nothing in your library matches “{asked}”.</p>
      ) : null}

      {!options.length && !searching && !asked ? (
        <p className="judgment-sources__quiet">
          {bound.length ? 'No source on this case matches.' : 'Keep typing to search your library.'}
        </p>
      ) : null}

      <button type="button" className="judgment-sources__close" onClick={() => onDismiss?.()}>
        esc to close
      </button>
    </div>
  );
};

export default SourcePicker;
