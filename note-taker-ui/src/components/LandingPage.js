import React from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const LandingPage = ({ chromeStoreLink }) => {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <div className="landing-content">
        <img src={logo} alt="Note Taker Logo" className="landing-logo" loading="lazy" decoding="async" />
        
        <h1 className="landing-title">A simple tool for your best reading.</h1>
        
        <div className="landing-body">
          <p>
            I built Note Taker because I wanted a better way to keep the articles that actually matter to me.
          </p>
          <p>
            I didn't need another complex research tool. I just needed a simple, organized way to save valuable insights so I could reference them later—whether for guidance, perspective, or just to re-read something great.
          </p>
          <p>
            <strong>Note Taker is designed for retrieval.</strong>
          </p>
          <ul className="landing-list">
            <li>📂 <strong>Organize</strong> your reading into folders that make sense to you.</li>
            <li>📄 <strong>Save</strong> articles cleanly with a single click.</li>
            <li>🎨 <strong>Highlight</strong> the specific wisdom you want to return to.</li>
            <li>🤖 <strong>Cite</strong> sources instantly when you need to use them.</li>
          </ul>
          <p>
            It’s free, private, and built to be the easiest part of your workflow.
          </p>
        </div>

        <div className="landing-actions">
          <button onClick={() => navigate('/register')} className="landing-button primary">
            Start Your Library (Free)
          </button>
          <button onClick={() => navigate('/login')} className="landing-button secondary">
            I already have an account
          </button>
        </div>

        <div className="landing-footer">
            <p>
                To use this web app, you'll need our free 
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer"> Chrome Extension</a>.
            </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;


