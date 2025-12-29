import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Card, Button } from '../components/ui';

const TOUR_KEYS = [
  { key: 'toured_today', label: 'Visited Today' },
  { key: 'toured_library', label: 'Visited Library' },
  { key: 'toured_think', label: 'Visited Think' },
  { key: 'toured_review', label: 'Visited Review' }
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

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">How to Use</p>
        <h1>A calm filing cabinet for your reading life.</h1>
        <p className="muted">Note Taker turns the best parts of what you read into ideas you can find in 10 seconds—months later.</p>
        <p className="muted">
          You are the kind of person who highlights, saves, and swears you will come back.
          Now you actually can. Without chaos. Without ten tabs open forever.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button onClick={() => navigate('/library')}>Start here: Set up your Library</Button>
          <Button variant="secondary" onClick={() => navigate('/today')}>Take the 5-minute tour</Button>
        </div>
      </div>

      <div className="section-stack">
        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">The 5-minute tour</span>
            <span className="muted small">Do these once and you are set.</span>
          </div>
          <ol className="howto-list">
            <li>
              <strong>Save an article.</strong> This is your source. Your library shelf.
            </li>
            <li>
              <strong>Highlight what matters.</strong> A highlight is the atomic unit. Tiny, precise, useful.
            </li>
            <li>
              <strong>Tag as Concepts.</strong> Concepts are idea homes. “Compounding.” “AI hardware.” “Strategy.”
            </li>
            <li>
              <strong>Drop highlights into Notes.</strong> Think mode is where you synthesize, not just collect.
            </li>
            <li>
              <strong>Come back tomorrow.</strong> Today resurfaces your best bits so your brain stays warm.
            </li>
          </ol>
        </Card>

        <div className="search-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {[
            {
              title: 'Today',
              copy: 'Your daily desk. Resurfaced highlights, recent notes, and quick wins.',
              intent: 'Use this when you want a 60-second reset.',
              next: 'Reshuffle and save one resurfaced highlight.',
              route: '/today'
            },
            {
              title: 'Library',
              copy: 'Where your reading lives. Articles, highlights, concepts, and saved views.',
              intent: 'Use this when you need to find something fast.',
              next: 'Create one saved view for a theme you care about.',
              route: '/library'
            },
            {
              title: 'Think',
              copy: 'The synthesis layer. Notebook + concept pages + backlinks.',
              intent: 'Use this when you want to make sense of what you read.',
              next: 'Write a short note using three highlights.',
              route: '/think'
            },
            {
              title: 'Review',
              copy: 'Journey, resurfacing, and reflection. Optional, powerful.',
              intent: 'Use this when you want to see progress or patterns.',
              next: 'Open Journey and scan your last 7 days.',
              route: '/review'
            },
            {
              title: 'Settings',
              copy: 'Export, import, and ownership. Your brain is yours.',
              intent: 'Use this when you want control and backup.',
              next: 'Export your data once so you know it is yours.',
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
              <p className="muted">Calmer. Focused on reading, recall, and ideas—not endless pages.</p>
            </div>
            <div>
              <strong>Do I need to organize perfectly?</strong>
              <p className="muted">No. Start messy. Search and resurface will save you.</p>
            </div>
            <div>
              <strong>What if I forget to tag?</strong>
              <p className="muted">Still fine. You can find it later and tag in seconds.</p>
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
            {allComplete && <p className="status-message success-message">Tour complete. You are in.</p>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Why this exists</span>
          </div>
          <p className="muted">
            You read great stuff. You highlight it. Then it disappears into a screenshot folder you never open.
            Note Taker is the opposite of that. It gives your reading a real home.
            So the next time you need the idea, it is there—calm, clean, and ready.
          </p>
        </Card>
      </div>
    </Page>
  );
};

export default HowToUse;
