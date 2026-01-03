import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from '../components/ui';

const Landing = () => {
  const navigate = useNavigate();
  const hasToken = Boolean(localStorage.getItem('token'));

  const handleEnter = () => {
    if (hasToken) {
      navigate('/today');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="landing-shell">
      <div className="landing-hero">
        <p className="landing-eyebrow">Note Taker</p>
        <h1>A calm home for everything you read, highlight, and think about.</h1>
        <p className="landing-subhead">
          Stop losing ideas in bookmarks and screenshots. Note Taker turns reading into something
          you can actually come back to.
        </p>
        <div className="landing-cta">
          <Button onClick={() => navigate('/register')}>Get started</Button>
          <Button variant="secondary" onClick={() => document.getElementById('tour')?.scrollIntoView({ behavior: 'smooth' })}>
            See how it works (2 minutes)
          </Button>
        </div>
      </div>

      <Card className="landing-card">
        <h2>This is for you if…</h2>
        <ul className="landing-list">
          <li>You read a lot and actually want to remember it later.</li>
          <li>You highlight the good stuff, then it disappears.</li>
          <li>You’re tired of messy folders and endless tabs.</li>
          <li>You want your thinking to build on itself over time.</li>
          <li>You’d love to find that idea in 10 seconds six months later.</li>
        </ul>
      </Card>

      <div className="landing-grid">
        <Card className="landing-card">
          <h3>Highlights are the atom</h3>
          <p>Every highlight is a tiny brick. You can reuse it anywhere.</p>
        </Card>
        <Card className="landing-card">
          <h3>Notes are where thinking happens</h3>
          <p>Pull highlights into notes and say it in your own words.</p>
        </Card>
        <Card className="landing-card">
          <h3>The system brings things back</h3>
          <p>Resurfacing turns “I’ll remember this” into “I actually did.”</p>
        </Card>
      </div>

      <Card className="landing-card" id="tour">
        <h2>The 5‑minute tour</h2>
        <ol className="landing-steps">
          <li>Save an article.</li>
          <li>Highlight what matters.</li>
          <li>Tag highlights as Concepts.</li>
          <li>Drop highlights into Notes.</li>
          <li>Come back tomorrow (Today desk + resurfacing).</li>
        </ol>
      </Card>

      <Card className="landing-card">
        <h2>Your brain stays yours</h2>
        <ul className="landing-list">
          <li>Export your data anytime.</li>
          <li>No dark patterns. No lock‑in.</li>
          <li>No AI required. Calm by design.</li>
        </ul>
      </Card>

      <Card className="landing-footer">
        <p>
          If this sounds like how your brain works, try it. You’ll know within a day if it fits.
        </p>
        <Button onClick={handleEnter}>Enter Note Taker</Button>
      </Card>
    </div>
  );
};

export default Landing;
