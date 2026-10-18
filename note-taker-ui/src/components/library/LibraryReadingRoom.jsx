import React, { useEffect, useState } from 'react';
import { getReadingRoom, getWorthSayingPhrasing } from '../../api/readingRoom';
import { scopedKey } from '../../utils/browserScope';
import { pickLine, progressPhrase, showsWeather, weekKey } from './libraryReadingRoomModel';
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

/**
 * The Library's front door. Every section is silent when it has nothing true
 * to say, and the room disappears with them; the shelf below is unchanged.
 */
export default function LibraryReadingRoom({ onOpen }) {
  const [room, setRoom] = useState(null);
  const [said, setSaid] = useState(null);
  const weatherVisible = useWeatherVisible();

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
  if (!weather && !pick && !stillReading.length && !arrivals.length && !worthSaying.length) return null;

  return (
    <section className="reading-room" aria-label="Reading room" data-testid="library-reading-room">
      {weather ? (
        <p className="reading-room__weather" data-testid="reading-weather">
          <span className="reading-room__eyebrow">Last week's reading weather</span>
          {weather}
        </p>
      ) : null}

      {pick ? (
        <div className="reading-room__pick" data-testid="reading-room-pick">
          <span className="reading-room__eyebrow">For today</span>
          <Title id={pick.articleId} title={pick.title} onOpen={onOpen} />
          <p className="reading-room__detail">
            {[pickLine(pick), pick.siteName || pick.author].filter(Boolean).join(' · ')}
          </p>
          <p className="reading-room__rule">One a day from the back of the shelf: the oldest pieces you saved yourself.</p>
        </div>
      ) : null}

      {stillReading.length ? (
        <div className="reading-room__shelf" data-testid="reading-room-still">
          <h2 className="reading-room__eyebrow">Still reading</h2>
          <ul>
            {stillReading.map((row) => (
              <li key={row.articleId}>
                <Title id={row.articleId} title={row.title} onOpen={onOpen} />
                <span>{progressPhrase(row.ratio) || 'marked recently'}</span>
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
