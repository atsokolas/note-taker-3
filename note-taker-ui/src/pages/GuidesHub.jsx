import React from 'react';
import useSeoMetadata from '../hooks/useSeoMetadata';
import '../styles/seo-article.css';

const GuidesHub = () => {
  useSeoMetadata({
    title: 'Note Taker Guides for Research and Knowledge Work',
    description: 'Practical guides on AI second-brain workflows, connected notes, writing, and knowledge management with Note Taker.',
    canonicalPath: '/guides'
  });

  return (
    <div className="seo-article-page">
      <article className="seo-article">
        <header className="seo-hero">
          <p className="seo-eyebrow">Guides</p>
          <h1>Practical Guides for Thinking, Writing, and Knowledge Work</h1>
          <p className="seo-lede">
            These guides are built for people evaluating better workflows for research, synthesis,
            note-taking, and personal knowledge management.
          </p>
          <div className="seo-guide-grid">
            <a href="/ai-second-brain" className="seo-guide-card">
              <h2>AI Second Brain</h2>
              <p>What the term should mean in practice, what to evaluate, and where Note Taker fits.</p>
            </a>
            <a href="/second-brain-app" className="seo-guide-card">
              <h2>Second Brain App</h2>
              <p>How to compare categories of tools when you need retrieval, connected notes, and synthesis.</p>
            </a>
            <a href="/ai-note-taking-workflow" className="seo-guide-card">
              <h2>AI Note-Taking Workflow</h2>
              <p>How to move from saved source material to writing, planning, and reusable insight.</p>
            </a>
          </div>
        </header>

        <section className="seo-section">
          <h2>How to use this hub</h2>
          <p>
            If you are still defining the category, start with <a href="/ai-second-brain">AI Second Brain</a>.
            If you are choosing a tool, move to <a href="/second-brain-app">Second Brain App</a>.
            If you already have a tool and need a better operating model, use
            <a href="/ai-note-taking-workflow"> AI Note-Taking Workflow</a>.
          </p>
        </section>
      </article>
    </div>
  );
};

export default GuidesHub;
