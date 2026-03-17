import React from 'react';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { trackGuideCta } from '../utils/marketingAnalytics';
import '../styles/seo-article.css';

const AiNoteTakingWorkflow = () => {
  useSeoMetadata({
    title: 'AI Note-Taking Workflow for Research and Writing',
    description: 'A practical AI note-taking workflow for capturing sources, connecting notes, and turning research into writing.',
    canonicalPath: '/ai-note-taking-workflow'
  });

  return (
    <div className="seo-article-page">
      <article className="seo-article">
        <header className="seo-hero">
          <p className="seo-eyebrow">Guide</p>
          <h1>A Practical AI Note-Taking Workflow</h1>
          <p className="seo-lede">
            The best note-taking workflows start with a simple loop: capture source material,
            keep the useful parts, connect them around a question, and write in your own words.
          </p>
          <div className="seo-cta-row">
            <a
              href="/register"
              className="ui-button ui-button-primary"
              onClick={() => trackGuideCta({ page: 'ai-note-taking-workflow', cta: 'hero', target: '/register' })}
            >
              Start free
            </a>
            <a
              href="/guides"
              className="ui-button ui-button-secondary"
              onClick={() => trackGuideCta({ page: 'ai-note-taking-workflow', cta: 'hero', target: '/guides' })}
            >
              Browse guides
            </a>
          </div>
        </header>

        <section className="seo-section">
          <h2>The workflow in five steps</h2>
          <ol>
            <li>Capture the source while you read or research.</li>
            <li>Highlight only what you expect to reuse.</li>
            <li>Group related notes around a theme, concept, or open question.</li>
            <li>Write a short synthesis note in plain language.</li>
            <li>Expand that synthesis into a draft, memo, or plan.</li>
          </ol>
        </section>

        <section className="seo-section">
          <h2>What AI should do in this workflow</h2>
          <div className="seo-mistake-list">
            <section>
              <h3>Retrieve context</h3>
              <p>AI is useful when it helps surface related notes, highlights, and source material you might miss manually.</p>
            </section>
            <section>
              <h3>Support synthesis</h3>
              <p>It can help compare ideas, summarize patterns, or organize material into a working structure.</p>
            </section>
            <section>
              <h3>Stay grounded</h3>
              <p>The output should stay close to your notes and sources.</p>
            </section>
          </div>
        </section>

        <section className="seo-section">
          <h2>Why Note Taker fits this pattern</h2>
          <p>
            Note Taker supports capture, connected notes, and writing in one workspace. It is designed for people who
            need to move from saved material to synthesis without losing the source context that makes their notes useful.
          </p>
          <p>
            If you want an AI note-taking workflow that stays practical,
            {' '}
            <a
              href="/register"
              onClick={() => trackGuideCta({ page: 'ai-note-taking-workflow', cta: 'body', target: '/register' })}
            >
              Start free
            </a>.
          </p>
        </section>
      </article>
    </div>
  );
};

export default AiNoteTakingWorkflow;
