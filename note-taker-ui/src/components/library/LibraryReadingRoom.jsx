import React, { useEffect, useState } from 'react';
import { getReadingRoom, getWorthSayingPhrasing } from '../../api/readingRoom';
import { fetchLately } from '../../api/retrieval';
import { LEADS, Says } from '../added/WhatItAdded';
import { scopedKey } from '../../utils/browserScope';
import { pickLine, progressPhrase, showsWeather, spineLength, weekKey } from './libraryReadingRoomModel';
import { clothOf } from '../../utils/cloth';
import '../../styles/library-reading-room.css';

const WEATHER_KEY = 'library.readingWeather.seenWeek';

/* Read once per mount: the line stays for the whole visit that earned it. */
const useWeatherVisible = () => {
  const [visible] = useState(() => {
    const now = new Date();
    try {
      return showsWeather({ now, seenWeek: window.localStorage.getItem(scopedKey(WEATHER_KEY)) || '' });
    } catch (_) {
      return now.getDay() === 1;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(scopedKey(WEATHER_KEY), weekKey(new Date()));
    } catch (_) {
      /* Without storage the weather keeps to Mondays. */
    }
  }, []);
  return visible;
};

const Title = ({ id, title, onOpen, options }) => (
  <button type="button" className="reading-room__title" onClick={() => onOpen?.(id, options)}>
    {title || 'Untitled'}
  </button>
);

/* A spine on the nightstand: as long as the piece takes to read, in the
   cloth of its shelf, with a ribbon where you stopped. */
const Spine = ({ row, pulled = false, children }) => (
  <li
    className="nightstand__spine"
    data-pulled={pulled || undefined}
    data-ribbon={row.ratio > 0 || undefined}
    style={{ '--length': spineLength(row.minutes), '--cloth': clothOf(row.shelf), '--ribbon': row.ratio }}
  >
    {children}
    <span className="nightstand__about">
      {row.shelf ? <span>{row.shelf}</span> : null}
      {row.minutes ? <span>{row.minutes} min</span> : null}
      {pulled ? null : <span>{progressPhrase(row.ratio) || 'marked recently'}</span>}
    </span>
  </li>
);

/* What you are partway through, stacked like books by the bed, with today's
   pick pulled out of the stack and its note beside it. */
const Nightstand = ({ pick, stillReading, onOpen }) => (
  <div className="nightstand">
    <div className="nightstand__stack" data-testid="reading-room-still">
      {stillReading.length ? <h2 className="reading-room__eyebrow">Still reading</h2> : null}
      <ul>
        {stillReading.map((row) => (
          <Spine key={row.articleId} row={row}><Title id={row.articleId} title={row.title} onOpen={onOpen} /></Spine>
        ))}
        {pick ? <Spine row={pick} pulled><Title id={pick.articleId} title={pick.title} onOpen={onOpen} /></Spine> : null}
      </ul>
      <p className="reading-room__rule">The longer the spine, the longer the read. The ribbon is where you stopped.</p>
    </div>
    {pick ? (
      <div className="reading-room__pick" data-testid="reading-room-pick">
        <span className="reading-room__eyebrow">For today</span>
        <p className="reading-room__detail">
          {[pickLine(pick), pick.siteName || pick.author].filter(Boolean).join(' · ')}
        </p>
        <p className="reading-room__rule">One a day, from the oldest things you saved.</p>
      </div>
    ) : null}
  </div>
);

/**
 * The Library's front door. Every section is silent when it has nothing true
 * to say, and the room disappears with them; the shelf below is unchanged.
 */
export default function LibraryReadingRoom({ onOpen }) {
  const [room, setRoom] = useState(null);
  const [said, setSaid] = useState(null);
  const [connected, setConnected] = useState([]);
  const weatherVisible = useWeatherVisible();

  // Asked after the room: the model may read a new arrival's pairs first.
  useEffect(() => {
    let live = true;
    fetchLately().then((rows) => { if (live) setConnected(rows); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    getReadingRoom()
      .then((payload) => { if (live) setRoom(payload || null); })
      .catch(() => { if (live) setRoom(null); });
    return () => { live = false; };
  }, []);

  const worthSaying = Array.isArray(room?.worthSaying) && room.worthSaying.length === 3 ? room.worthSaying : [];
  const phrase = worthSaying.length > 0 && Boolean(room?.modelAvailable);
  useEffect(() => {
    if (!phrase) return undefined;
    let live = true;
    getWorthSayingPhrasing()
      .then((rows) => {
        if (!live || !Array.isArray(rows)) return;
        setSaid(new Map(rows.map((row) => [row.articleId, row.said])));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [phrase]);

  if (!room) return null;
  const weather = weatherVisible ? room.weather?.line : '';
  const pick = room.pick?.articleId ? room.pick : null;
  const stillReading = Array.isArray(room.stillReading) ? room.stillReading : [];
  const arrivals = Array.isArray(room.newFromSources) ? room.newFromSources : [];
  if (!weather && !pick && !stillReading.length && !arrivals.length && !worthSaying.length && !connected.length) return null;

  return (
    <section className="reading-room" aria-label="Reading room" data-testid="library-reading-room">
      {weather ? (
        <p className="reading-room__weather" data-testid="reading-weather">
          <span className="reading-room__eyebrow">Last week</span>
          {weather}
        </p>
      ) : null}

      {pick || stillReading.length ? <Nightstand pick={pick} stillReading={stillReading} onOpen={onOpen} /> : null}

      {connected.length ? (
        <div className="reading-room__connected" data-testid="reading-room-connected">
          <h2 className="reading-room__eyebrow">Connected this week</h2>
          <ul>
            {connected.map(({ articleId, title, ...connection }) => (
              <li key={articleId}>
                <Title id={articleId} title={title} onOpen={onOpen} /> {LEADS[connection.kind].toLowerCase()} <Says {...connection} />.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {arrivals.length ? (
        <div className="reading-room__shelf" data-testid="reading-room-arrivals">
          <h2 className="reading-room__eyebrow">New from your sources</h2>
          <ul>
            {arrivals.map((row) => (
              <li key={row.articleId}>
                <Title id={row.articleId} title={row.title} onOpen={onOpen} />
                {row.sourceName ? <span>{row.sourceName}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {worthSaying.length ? (
        <div className="reading-room__saying" data-testid="reading-room-saying">
          <h2 className="reading-room__eyebrow">Three things worth saying this week</h2>
          <ol>
            {worthSaying.map((line) => (
              <li key={line.articleId}>
                {said?.get(line.articleId) ? <p className="reading-room__said">{said.get(line.articleId)}</p> : null}
                <blockquote>{line.quote}</blockquote>
                <Title id={line.articleId} title={line.title} onOpen={onOpen} options={{ highlightId: line.highlightId }} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
