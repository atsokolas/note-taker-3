import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EditionFinding from './EditionFinding';
import EditionPaper from './EditionPaper';

const LABEL = 'Codex Wiki account grounding audit';

describe('the byline on a paper', () => {
  it('names the agent and keeps the token label for the tooltip', () => {
    render(
      <MemoryRouter>
        <EditionFinding
          item={{ itemId: 'one', title: 'A paper', finding: 'f', boundary: 'b', url: 'https://example.com', filedBy: LABEL, filedByRuntime: '' }}
          onAct={() => {}}
          onPeek={() => {}}
        />
      </MemoryRouter>
    );
    const byline = screen.getByText(/Filed by/);
    expect(byline).toHaveTextContent('Filed by CxCodex');
    expect(byline).not.toHaveTextContent('grounding audit');
    expect(byline.querySelector('[title]')).toHaveAttribute('title', LABEL);
  });

  /* A stranger reading a shared paper gets the agent's name, not the label
     someone typed in Connections. */
  it('prints only the short name on a shared paper', () => {
    const { container } = render(
      <EditionPaper edition={{ title: 'This Week in AI', writtenBy: LABEL, sections: [], items: [] }} />
    );
    expect(screen.getByText(/Written by/)).toHaveTextContent('Written by CxCodex');
    expect(container).not.toHaveTextContent('grounding audit');
    expect(container.querySelector('[title]')).toBeNull();
  });
});
