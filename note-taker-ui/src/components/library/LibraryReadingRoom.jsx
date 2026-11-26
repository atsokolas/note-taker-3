import React, { useEffect, useState } from 'react';
import { getReadingRoom, getWorthSayingPhrasing } from '../../api/readingRoom';
import { fetchLately } from '../../api/retrieval';
import { LEADS, Says } from '../added/WhatItAdded';
import { scopedKey } from '../../utils/browserScope';
import { pickLine, progressPhrase, showsWeather, weekKey } from './libraryReadingRoomModel';
import { clothOf } from '../../utils/cloth';
import { CameBack, Kept, Outside, Underneath, roomOf, useHome } from '../home/Depths';
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

/* A spine on the nightstand: longer the more you marked in it, in the
   cloth of its shelf, with a ribbon where you stopped. */
const Spine = ({ row, pulled = false, children }) => (
  <li
    className="nightstand__spine"
    data-pulled={pulled || undefined}
    data-ribbon={row.ratio > 0 || undefined}
    style={{ '--marks': row.marks || 0, '--cloth': clothOf(row.shelf), '--ribbon': row.ratio }}
  >
    {children}
    <span className="nightstand__about">
      {row.shelf ? <span>{row.shelf}</span> : null}
      {row.minutes ? <span>{row.minutes} min</span> : null}
      {pulled ? null : <span className="sr-only">{progressPhrase(row.ratio) || 'marked recently'}</span>}
    </span>
  </li>
);

/* What you are partway through, stacked like books by the bed, and today's
   pick pulled out of the stack to lie beside it with its note. */
const Nightstand = ({ pick, stillReading, onOpen }) => (
  <div className="nightstand">
    {stillReading.length ? (
      <div className="nightstand__stack" data-testid="reading-room-still">
        <h2 className="reading-room__eyebrow">For now</h2>
        <ul>
          {stillReading.map((row) => (
            <Spine key={row.articleId} row={row}><Title id={row.articleId} title={row.title} onOpen={onOpen} /></Spine>
          ))}
        </ul>
        <p className="reading-room__rule">The longer the spine, the more you marked in it. The ribbon is where you stopped. It sinks underneath in a couple of weeks.</p>
      </div>
    ) : null}
    {pick ? (
      <div className="reading-room__pick" data-testid="reading-room-pick">
        <h2 className="reading-room__eyebrow">For today</h2>
        <ul>
          <Spine row={pick} pulled><Title id={pick.articleId} title={pick.title} onOpen={onOpen} /></Spine>
        </ul>
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
  // The Library's own depths: sources and their passages, not books or threads.
  const { home: whole, keep, putAside } = useHome();
  const home = roomOf(whole, item => !item.book && item.kind !== 'thread');

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
  if (!weather && !pick && !stillReading.length && !arrivals.length && !worthSaying.length && !connected.length && !home) return null;

  return (
    <section className="reading-room" aria-label="Reading room" data-testid="library-reading-room">
      {weather ? (
        <p className="reading-room__weather" data-testid="reading-weather">
          <span className="reading-room__eyebrow">Last week</span>
          {weather}
        </p>
      ) : null}

      {pick || stillReading.length ? <Nightstand pick={pick} stillReading={stillReading} onOpen={onOpen} /> : null}

      {home || connected.length ? (
        <div className="home home--band home__depths">
          {home ? <>
          <section aria-labelledby="library-kept">
            <h2 id="library-kept">Kept <span>sources and passages you hold on to</span></h2>
            <Kept kept={home.kept} asks={home.asks} onKeep={keep} onNotNow={putAside}
              empty="Nothing kept from your sources yet. Keep a source, or one passage in it, for good." />
          </section>
          <section aria-labelledby="library-under">
            <h2 id="library-under">Underneath <span>everything else, still searchable</span></h2>
            <Underneath underneath={home.underneath} />
          </section>
          </> : null}
          <section aria-labelledby="library-back" data-testid="reading-room-connected">
            <h2 id="library-back">Came back</h2>
            {home?.cameBack ? <CameBack pair={home.cameBack} onKeep={keep} /> : null}
            {connected.length ? (
              <ul className="reading-room__connected">
                {connected.map(({ articleId, title, ...connection }) => (
                  <li key={articleId}>
                    <Title id={articleId} title={title} onOpen={onOpen} /> {LEADS[connection.kind].toLowerCase()} <Says {...connection} />.
                  </li>
                ))}
              </ul>
            ) : null}
            {home?.forming ? <Outside about={home.forming.marks.at(-1).text}>from outside, for a thread that is forming</Outside> : null}
            {!home?.cameBack && !connected.length ? <p className="home__quiet">Quiet this week. When something new meets something old, it shows here.</p> : null}
          </section>
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
