import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getFolders } from '../api/folders';
import LibraryPasteLink, { linkFrom, linksFrom } from '../components/library/LibraryPasteLink';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/ui';
import '../styles/library-collection.css';

/* The link handed to this page. A Shortcut writes it after "url=" as it is,
   query string and all, so everything after "url=" is the link unless it
   arrived encoded. A share sheet may send only text with a link in it. */
export const handedInLink = (search = '') => {
  const at = search.search(/[?&]url=/);
  if (at >= 0) {
    let rest = search.slice(at + 5);
    if (/^https?%3A/i.test(rest)) rest = rest.split('&')[0];
    try { rest = decodeURIComponent(rest); } catch (_) { /* written as it is */ }
    const link = linkFrom(rest);
    if (link) return link;
  }
  const params = new URLSearchParams(search);
  return linksFrom(`${params.get('text') || ''} ${params.get('url') || ''}`)[0] || '';
};

/* A bookmark whose address is a line of script. React will not write a
   javascript: address, so it is set on the node itself. */
const Bookmarklet = ({ origin }) => {
  const node = useRef(null);
  useEffect(() => {
    node.current?.setAttribute('href', `javascript:void(open('${origin}/library/save?url='+encodeURIComponent(location.href)))`);
  }, [origin]);
  return (
    <a ref={node} href={`${origin}/library/save`} className="save-link__bookmarklet" onClick={event => event.preventDefault()}>
      Save to Noeis
    </a>
  );
};

/**
 * Save from anywhere: the page the iPhone share sheet, the installed app's
 * share target, and the bookmarklet all open. With a link, it saves it to
 * the nightstand at once and says so; without one, it says how to set those
 * up, once, so every link after is a tap away.
 */
export default function SaveLink() {
  useDocumentTitle('Save a link');
  const { search } = useLocation();
  const navigate = useNavigate();
  const link = useMemo(() => handedInLink(search), [search]);
  const [folders, setFolders] = useState([]);
  useEffect(() => { getFolders().then(setFolders).catch(() => {}); }, []);
  const origin = window.location.origin;

  return (
    <main className="save-link" aria-labelledby="save-link-title">
      <PageHeader
        eyebrow={<Link to="/library?scope=later">← Nightstand</Link>}
        titleId="save-link-title"
        title={link ? 'Saving a link' : 'Save from anywhere'}
        lede={link ? null : 'Set this up once, and anything you find goes on your nightstand in one tap.'}
      />
      <LibraryPasteLink
        link={link}
        folders={folders}
        onOpen={id => navigate(`/library?articleId=${encodeURIComponent(id)}`)}
        onShowNightstand={() => navigate('/library?scope=later')}
      />
      {link ? null : <section className="save-link__ways" aria-label="Ways to save">
        <h2>From an iPhone or iPad</h2>
        <ol>
          <li>In Shortcuts, make a new shortcut called <em>Save to Noeis</em>.</li>
          <li>Turn on <em>Show in Share Sheet</em>, receiving URLs.</li>
          <li>Add <em>Open URLs</em>, and write <code>{origin}/library/save?url=</code> followed by <em>Shortcut Input</em>.</li>
        </ol>
        <p>Then Share, Save to Noeis, from Safari or any app. You stay signed in here, so nothing else is needed.</p>
        <h2>From a computer</h2>
        <p>Drag <Bookmarklet origin={origin} /> to your bookmarks bar. On any page, click it.</p>
        <h2>From Android</h2>
        <p>Add Noeis to your home screen from the browser menu. It then appears when you share a link.</p>
      </section>}
    </main>
  );
}
