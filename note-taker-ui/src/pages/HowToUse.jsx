import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Card, Button } from '../components/ui';
import OnboardingChecklist from '../components/OnboardingChecklist';

const HowToUse = () => {
  const navigate = useNavigate();

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
        <h1>A calm home for every idea you don’t want to lose.</h1>
        <p className="muted">Save what you read. Pull the best lines. Turn them into thinking you can use.</p>
        <p className="muted">You read a lot. You highlight the good parts. You want those ideas to show up when you need them, not vanish into a folder. This fixes that.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button onClick={() => navigate('/today')}>Start in Today</Button>
          <Button variant="secondary" onClick={() => navigate('/library')}>Build your Library</Button>
          <Button variant="secondary" onClick={handleTourClick}>Take the 5‑minute tour</Button>
        </div>
      </div>

      <div className="section-stack">
        <section id="howto-tour">
          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">The 5-minute tour</span>
              <span className="muted small">Do these once and the system clicks.</span>
            </div>
            <ol className="howto-list">
              <li>
                <strong>Save an article.</strong> This is the shelf. Everything starts here.
              </li>
              <li>
                <strong>Highlight the parts that matter.</strong> Highlights are the atoms. Tiny. Sharp. Reusable.
              </li>
              <li>
                <strong>Tag as Concepts.</strong> Concepts are idea homes: “Compounding,” “Story openings,” “AI strategy.”
              </li>
              <li>
                <strong>Ask a question.</strong> Questions live inside concepts so your curiosity has a place.
              </li>
              <li>
                <strong>Write a note.</strong> Think is where you turn raw highlights into your words.
              </li>
              <li>
                <strong>Come back to Today.</strong> It resurfaces what matters so your brain stays warm.
              </li>
            </ol>
          </Card>
        </section>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">The latticework</span>
            <span className="muted small">How ideas turn into thinking.</span>
          </div>
          <p className="muted">
            Highlights are the raw material. Concepts and Questions are the scaffolding.
            Notes are the synthesis. That lattice is what lets you find the exact idea in ten seconds—months later.
          </p>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Your first 10 minutes</span>
            <span className="muted small">Do this once. Feel the system click.</span>
          </div>
          <ol className="howto-list">
            <li>
              <strong>Save 2 articles.</strong> Give Library a heartbeat.
            </li>
            <li>
              <strong>Pull 6 highlights.</strong> Don’t overthink it. Just grab what matters.
            </li>
            <li>
              <strong>Create 2 Concepts.</strong> Name the idea home, not the source.
            </li>
            <li>
              <strong>Create 1 Question.</strong> Put it under a concept.
            </li>
            <li>
              <strong>Write 5 sentences.</strong> One tiny synthesis note is enough.
            </li>
            <li>
              <strong>Visit Today.</strong> That’s your daily loop.
            </li>
          </ol>
        </Card>

        <div className="search-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {[
            {
              title: 'Today',
              copy: 'Your calm desk. Resurfaced highlights, open questions, and your next move.',
              intent: 'Use this when you want a 60‑second reset and a quick win.',
              next: 'Pick one highlight and send it into a note.',
              route: '/today'
            },
            {
              title: 'Library',
              copy: 'Your reading room. Articles, folders, highlights, and the threads between them.',
              intent: 'Use this when you need to find something fast.',
              next: 'Open one article and pull two highlights.',
              route: '/library'
            },
            {
              title: 'Think',
              copy: 'Synthesis lives here: notebook, concepts, and questions.',
              intent: 'Use this when you want to make sense, not just collect.',
              next: 'Add a question to a concept and answer it in a note.',
              route: '/think'
            },
            {
              title: 'Review',
              copy: 'Perspective over time. Reflections, Journey, and Resurface.',
              intent: 'Use this when you want to see progress and patterns.',
              next: 'Open Reflections and start a weekly note.',
              route: '/review'
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
            <span className="eyebrow">Where to start if…</span>
            <span className="muted small">Pick the path that fits you.</span>
          </div>
          <div className="section-stack">
            <div>
              <strong>You read a lot.</strong>
              <p className="muted">Start in Library. Save three articles. Highlight ten lines. Then go to Today tomorrow.</p>
            </div>
            <div>
              <strong>You research for work.</strong>
              <p className="muted">Start in Think. Create two Concepts and drop highlights into one note. Add one question per concept.</p>
            </div>
            <div>
              <strong>You are writing.</strong>
              <p className="muted">Start in Think → Notebook. Make one synthesis note, then visit Review → Reflections weekly.</p>
            </div>
          </div>
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
            <span className="eyebrow">Your first five moves</span>
            <span className="muted small">Short, clear, and you are rolling.</span>
          </div>
          <OnboardingChecklist />
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
