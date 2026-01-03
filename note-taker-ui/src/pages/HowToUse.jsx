import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Card, Button } from '../components/ui';

const TOUR_KEYS = [
  { key: 'toured_today', label: 'Today checked off' },
  { key: 'toured_library', label: 'Library checked off' },
  { key: 'toured_think', label: 'Think checked off' },
  { key: 'toured_review', label: 'Review checked off' }
];

const HowToUse = () => {
  const navigate = useNavigate();
  const [tourState, setTourState] = useState(() => {
    const initial = {};
    TOUR_KEYS.forEach(item => {
      initial[item.key] = localStorage.getItem(item.key) === 'true';
    });
    return initial;
  });

  const allComplete = useMemo(
    () => TOUR_KEYS.every(item => tourState[item.key]),
    [tourState]
  );

  const toggleTour = (key) => {
    setTourState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(key, String(next[key]));
      return next;
    });
  };

  const handleTourClick = () => {
    const section = document.getElementById('howto-tour');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">How To Use</p>
        <h1>Your calm filing cabinet for everything you read.</h1>
        <p className="muted">Note Taker takes what you read, keeps the best parts, and hands them back right when you need them.</p>
        <p className="muted">
          You are the kind of person who reads a lot, highlights the good parts, and plans to come back later.
          You want the payoff without the mess. This is that.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button onClick={() => navigate('/library')}>Start here: Set up your Library</Button>
          <Button variant="secondary" onClick={handleTourClick}>Take the 5-minute tour</Button>
        </div>
      </div>

      <div className="section-stack">
        <section id="howto-tour">
          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">The 5-minute tour</span>
              <span className="muted small">Do these once and you are set.</span>
            </div>
            <ol className="howto-list">
              <li>
                <strong>Save an article.</strong> An Article is the whole source. The book on the shelf.
              </li>
              <li>
                <strong>Highlight the parts that matter.</strong> A Highlight is the atomic unit. Small, sharp, easy to reuse.
              </li>
              <li>
                <strong>Tag as Concepts.</strong> Concepts are idea homes. “Second-order effects.” “Personal finance.” “Great openings.”
              </li>
              <li>
                <strong>Drop highlights into Notes.</strong> Think mode is where you stitch ideas into something new.
              </li>
              <li>
                <strong>Come back tomorrow.</strong> Today resurfaces the good stuff so your brain stays warm.
              </li>
            </ol>
          </Card>
        </section>

        <div className="search-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {[
            {
              title: 'Today',
              copy: 'Why it exists: a daily desk. You will see resurfaced highlights, recent notes, and quick prompts.',
              intent: 'Use this when you want a 60-second reset and a quick win.',
              next: 'Hit reshuffle and drop one resurfaced highlight into a note.',
              route: '/today'
            },
            {
              title: 'Library',
              copy: 'Why it exists: a home for everything you read. You will see articles, highlights, concepts, and saved views as drawers.',
              intent: 'Use this when you want to find something in 10 seconds.',
              next: 'Create one saved view for a theme you keep returning to.',
              route: '/library'
            },
            {
              title: 'Think',
              copy: 'Why it exists: synthesis. You will see your notebook, concept pages, and backlinks.',
              intent: 'Use this when you want to make sense, not just collect.',
              next: 'Write one short note using five highlights.',
              route: '/think'
            },
            {
              title: 'Review',
              copy: 'Why it exists: perspective. You will see your journey, resurfacing, and reflection prompts.',
              intent: 'Use this when you want to see progress or patterns.',
              next: 'Open Journey and scan your last seven days.',
              route: '/review'
            },
            {
              title: 'Settings',
              copy: 'Why it exists: ownership. You will see export, import, and your backup levers.',
              intent: 'Use this when you want control and backup.',
              next: 'Export your data once, just to prove it.',
              route: '/settings'
            }
          ].map(card => (
            <Card key={card.title} className="search-card">
              <div className="search-card-top">
                <span className="article-title-link">{card.title}</span>
                <span className="muted small">Mode</span>
              </div>
              <p className="muted">{card.copy}</p>
              <p className="muted small"><strong>Use this when:</strong> {card.intent}</p>
              <p className="muted small"><strong>Do this next:</strong> {card.next}</p>
              <Button variant="secondary" onClick={() => navigate(card.route)}>
                Go to {card.title}
              </Button>
            </Card>
          ))}
        </div>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">First-week plan</span>
            <span className="muted small">Seven days to habit.</span>
          </div>
          <ul className="howto-checklist">
            <li>Day 1: Save 3 articles, add 10 highlights.</li>
            <li>Day 2: Create 5 concepts, pin 3 key highlights.</li>
            <li>Day 3: Write one synthesis note using 5 highlights.</li>
            <li>Day 4: Create one saved view (“AI Strategy”, “Behavioral Edges”).</li>
            <li>Day 5: Use Today, reshuffle, insert one resurfaced highlight into a note.</li>
            <li>Day 6: Answer one open question.</li>
            <li>Day 7: Export your data (trust ritual).</li>
          </ul>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">FAQ</span>
          </div>
          <div className="section-stack">
            <div>
              <strong>Is this like Notion?</strong>
              <p className="muted">Calmer. Focused on reading, recall, and ideas. Not endless pages.</p>
            </div>
            <div>
              <strong>Do I need to organize perfectly?</strong>
              <p className="muted">No. Start messy. The system forgives you.</p>
            </div>
            <div>
              <strong>What if I forget to tag?</strong>
              <p className="muted">Search plus resurfacing saves you. Tag later in seconds.</p>
            </div>
            <div>
              <strong>Is my data stuck here?</strong>
              <p className="muted">No. Export is built in. Your brain stays yours.</p>
            </div>
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Tour complete</span>
            <span className="muted small">Optional, but satisfying.</span>
          </div>
          <div className="section-stack">
            {TOUR_KEYS.map(item => (
              <label key={item.key} className="howto-tour-row">
                <input
                  type="checkbox"
                  checked={tourState[item.key]}
                  onChange={() => toggleTour(item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
            {allComplete && <p className="status-message success-message">Tour complete. You are officially dangerous.</p>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Why this exists</span>
          </div>
          <p className="muted">
            You read great stuff. You highlight it. Then it disappears into a folder you never open.
            Note Taker is the opposite of that. It gives your reading a real home and keeps it warm.
            So six months from now you can find the exact idea in 10 seconds and get on with your day.
          </p>
        </Card>
      </div>
    </Page>
  );
};

export default HowToUse;
