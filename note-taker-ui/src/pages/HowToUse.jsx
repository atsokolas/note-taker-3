import React from 'react';
import { Link } from 'react-router-dom';
import { getNoeisNavigationDefinitions } from '../system/noeisSurfaceDefinitions';
import { goToKeyFor } from '../navigation/appNavigation';
import { SHORTCUT_SECTIONS } from '../components/KeyboardShortcutOverlay';
import '../styles/help-page.css';

/* The rooms describe themselves in the surface registry, and the keys come
   from the same lists the keyboard obeys, so this page cannot name a room
   or a key that is not there. */
const ROOMS = getNoeisNavigationDefinitions('primary');
const [ANYWHERE] = SHORTCUT_SECTIONS;

const HowToUse = () => (
  <main className="help-page" aria-labelledby="help-title">
    <h1 id="help-title">Help</h1>
    <p className="help-page__lede">What each room is for, and the keys that get you there.</p>

    <ul className="help-page__rows">
      {ROOMS.map((room) => {
        const key = goToKeyFor(room.route);
        return (
          <li key={room.id}>
            <Link to={room.route}>{room.name}</Link>
            <span>{room.orientation}</span>
            {key ? <kbd aria-label={`G then ${key.toUpperCase()}`}>G {key.toUpperCase()}</kbd> : null}
          </li>
        );
      })}
    </ul>

    <h2>Anywhere</h2>
    <ul className="help-page__rows">
      {ANYWHERE.items.map(({ keys, label }) => (
        <li key={label}>
          <span>{label}</span>
          <kbd>{keys.join(' ')}</kbd>
        </li>
      ))}
    </ul>

    <h2>Bringing things in</h2>
    <p>
      <Link to="/connections#sources">Connections</Link> brings in Readwise, Kindle, Notion and files,
      and lets an agent such as Claude read what you keep. <Link to="/library/save">Save a link</Link> puts
      one page on your Nightstand.
    </p>

    <h2>Your data</h2>
    <p>
      Everything you keep can be exported as files from <Link to="/settings?section=data">Settings, Data</Link>.
      Something wrong? <Link to="/support">Support</Link> says how to reach Athan.
    </p>
  </main>
);

export default HowToUse;
