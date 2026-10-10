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
    const byline = screen.getByText(/Picked by/);
    expect(byline).toHaveTextContent('Picked by CxCodex');
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

  it('names a shared paper by runtime when its label says nothing', () => {
    const { container } = render(
      <EditionPaper edition={{ title: 'This Week in AI', writtenBy: 'My laptop', writtenByRuntime: 'codex', sections: [], items: [] }} />
    );
    expect(screen.getByText(/Written by/)).toHaveTextContent('Written by CxCodex');
    expect(container).not.toHaveTextContent('My laptop');
  });
});

describe('two hands on one source', () => {
  const item = {
    itemId: 'one', title: 'A paper', url: 'https://example.com',
    finding: 'Twelve points better.', boundary: 'One lab.', filedBy: 'OpenClaw · Jarvis', filedByRuntime: 'openclaw',
    readings: [{ filedBy: LABEL, filedByRuntime: '', finding: 'Within run-to-run noise.', boundary: 'Three seeds.', note: '' }]
  };

  it('sets each reading in its own column, named, with its own limit, and judges neither', () => {
    const { container } = render(
      <MemoryRouter>
        <EditionFinding item={item} onAct={() => {}} onPeek={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('Filed independently by two hands.')).toBeInTheDocument();
    const columns = container.querySelectorAll('.edition-readings__column');
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveTextContent('OpenClaw’s reading');
    expect(columns[0]).toHaveTextContent('Twelve points better.');
    expect(columns[0]).toHaveTextContent('One lab.');
    expect(columns[1]).toHaveTextContent('Codex’s reading');
    expect(columns[1]).toHaveTextContent('Within run-to-run noise.');
    expect(columns[1]).toHaveTextContent('Three seeds.');
    /* The first reading keeps the passage the reader can select from. */
    expect(columns[0].querySelector('[data-finding-text="one"]')).not.toBeNull();
    expect(screen.queryByText(/Picked by/)).toBeNull();
    expect(container).not.toHaveTextContent(/agree|differ/i);
  });

  it('prints both readings on a shared paper, without the token labels', () => {
    const { container } = render(
      <EditionPaper edition={{
        title: 'This Week in AI',
        sections: [],
        items: [{ ...item, filedBy: 'OpenClaw · Jarvis' }]
      }} />
    );
    expect(container.querySelectorAll('.edition-readings__column')).toHaveLength(2);
    expect(screen.getByText('Three seeds.')).toBeInTheDocument();
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('reads exactly as before when only one hand filed', () => {
    const { container } = render(
      <MemoryRouter>
        <EditionFinding item={{ ...item, readings: [] }} onAct={() => {}} onPeek={() => {}} />
      </MemoryRouter>
    );
    expect(container.querySelector('.edition-readings')).toBeNull();
    expect(screen.getByText(/Picked by/)).toBeInTheDocument();
  });
});
