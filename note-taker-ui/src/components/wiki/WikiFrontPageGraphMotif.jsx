import React from 'react';

/* Decorative knowledge-graph constellation for the wiki front page.
   Warm palette via CSS; reduced-motion-safe in wiki-front-page.css. */
const WikiFrontPageGraphMotif = () => (
  <div className="wiki-front-page__graph-motif" aria-hidden="true">
    <svg
      className="wiki-front-page__graph-motif-svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="wiki-front-page__graph-motif-network">
        <g className="wiki-front-page__graph-motif-edges">
          <line x1="118" y1="142" x2="286" y2="228" />
          <line x1="286" y1="228" x2="468" y2="176" />
          <line x1="468" y1="176" x2="612" y2="312" />
          <line x1="612" y1="312" x2="824" y2="248" />
          <line x1="824" y1="248" x2="1048" y2="188" />
          <line x1="286" y1="228" x2="348" y2="412" />
          <line x1="348" y1="412" x2="612" y2="312" />
          <line x1="612" y1="312" x2="728" y2="508" />
          <line x1="728" y1="508" x2="968" y2="468" />
          <line x1="968" y1="468" x2="1188" y2="392" />
          <line x1="348" y1="412" x2="188" y2="548" />
          <line x1="728" y1="508" x2="512" y2="628" />
          <line x1="512" y1="628" x2="312" y2="712" />
          <line x1="968" y1="468" x2="812" y2="688" />
          <line x1="1188" y1="392" x2="1296" y2="612" />
        </g>
        <g className="wiki-front-page__graph-motif-nodes">
          <circle cx="118" cy="142" r="4.5" />
          <circle cx="286" cy="228" r="5" />
          <circle cx="468" cy="176" r="4" />
          <circle cx="612" cy="312" r="5.5" />
          <circle cx="824" cy="248" r="4" />
          <circle cx="1048" cy="188" r="4.5" />
          <circle cx="348" cy="412" r="4" />
          <circle cx="728" cy="508" r="5" />
          <circle cx="968" cy="468" r="4.5" />
          <circle cx="1188" cy="392" r="4" />
          <circle cx="188" cy="548" r="3.5" />
          <circle cx="512" cy="628" r="4" />
          <circle cx="312" cy="712" r="3.5" />
          <circle cx="812" cy="688" r="4" />
          <circle cx="1296" cy="612" r="3.5" />
        </g>
      </g>
    </svg>
  </div>
);

export default React.memo(WikiFrontPageGraphMotif);
