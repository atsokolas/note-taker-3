import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ThinkHome from './ThinkHome';

jest.mock('../../api/connections', () => ({
  searchConnectableItems: jest.fn()
}));

jest.mock('../agent/AgentTicker', () => function MockAgentTicker({ label, lines = [] }) {
  return <div aria-label={label}>{lines.join(' ')}</div>;
});

const { searchConnectableItems } = require('../../api/connections');

const noop = () => {};

const baseProps = {
  recentTargets: [],
  workingSet: { notebooks: [], concepts: [], questions: [] },
  returnQueue: [],
  recentHighlights: [],
  recentArticles: [],
  onOpenTarget: noop,
  onOpenNotebook: noop,
  onOpenConcept: noop,
  onOpenQuestion: noop,
  onOpenReturnQueueItem: noop,
  onOpenArticle: noop,
  onOpenActivation: noop,
  onClearActivation: noop,
  onCreateNote: noop,
  onCreateConcept: noop,
  onCreateFromTemplate: noop,
  onCreateQuestion: noop
};

describe('ThinkHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchConnectableItems.mockResolvedValue([]);
  });

  it('promotes "New note" to a primary action and keeps the rest secondary', () => {
    const onCreateNote = jest.fn();
    render(<ThinkHome {...baseProps} onCreateNote={onCreateNote} />);

    expect(screen.getByRole('form', { name: 'Universal command' })).toBeInTheDocument();

    const newNote = screen.getByRole('button', { name: 'New note' });
    expect(newNote.className).toMatch(/ui-quiet-button--primary/);

    const newConcept = screen.getByRole('button', { name: 'New concept' });
    expect(newConcept.className).not.toMatch(/ui-quiet-button--primary/);

    fireEvent.click(newNote);
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it('routes the universal command through the home command handler', async () => {
    const onUniversalCommand = jest.fn().mockResolvedValue('Thought partner opened this as a question.');
    render(<ThinkHome {...baseProps} onUniversalCommand={onUniversalCommand} />);

    const input = screen.getByPlaceholderText('Think, ask, or build...');
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeDisabled();

    fireEvent.change(input, { target: { value: 'What should I read next?' } });
    expect(start).toBeEnabled();
    fireEvent.click(start);

    expect(await screen.findByText('Thought partner opened this as a question.')).toBeInTheDocument();
    expect(onUniversalCommand).toHaveBeenCalledWith('What should I read next?', {
      references: [],
      sourceContext: '',
      provenancePending: false
    });
    expect(input).toHaveValue('');
  });

  it('pulls Home references into the universal command context', async () => {
    const onUniversalCommand = jest.fn().mockResolvedValue('Opened with context.');
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'wiki_page',
      itemId: 'wiki-1',
      title: 'Investing thesis',
      snippet: 'Settled synthesis'
    }]);
    render(<ThinkHome {...baseProps} onUniversalCommand={onUniversalCommand} />);

    fireEvent.change(screen.getByLabelText('Search Home references'), {
      target: { value: 'investing' }
    });

    expect(await screen.findByRole('button', { name: /Investing thesis/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Investing thesis/ }));

    expect(screen.getByLabelText('Pulled Home references')).toHaveTextContent('Wiki · Investing thesis');
    expect(screen.getByLabelText('Pending provenance trace')).toHaveTextContent('1 pending provenance trace');

    fireEvent.change(screen.getByPlaceholderText('Think, ask, or build...'), {
      target: { value: 'Use this as the starting point' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(onUniversalCommand).toHaveBeenCalledWith(
      'Use this as the starting point',
      {
        references: [expect.objectContaining({
          type: 'wiki',
          id: 'wiki-1',
          title: 'Investing thesis'
        })],
        sourceContext: 'home_reference_tray',
        provenancePending: true
      }
    ));
  });

  it('keeps Library highlight provenance when Home references feed the command', async () => {
    const onUniversalCommand = jest.fn().mockResolvedValue('Opened with highlight context.');
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'highlight',
      itemId: 'highlight-1',
      title: 'Margin of safety quote',
      snippet: 'Price is what you pay, value is what you get.',
      articleId: 'article-1'
    }]);
    render(<ThinkHome {...baseProps} onUniversalCommand={onUniversalCommand} />);

    expect(screen.getByText('Pull Library highlights, sources, Wiki pages, or Think work into the next command.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search Home references'), {
      target: { value: 'margin' }
    });

    expect(await screen.findByRole('button', { name: /Margin of safety quote/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Margin of safety quote/ }));

    expect(screen.getByLabelText('Pulled Home references')).toHaveTextContent('Highlight · Margin of safety quote');
    expect(screen.getByLabelText('Pending provenance trace')).toHaveTextContent('1 pending provenance trace');

    fireEvent.change(screen.getByPlaceholderText('Think, ask, or build...'), {
      target: { value: 'Use the quote to build a page' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(onUniversalCommand).toHaveBeenCalledWith(
      'Use the quote to build a page',
      {
        references: [expect.objectContaining({
          type: 'highlight',
          id: 'highlight-1',
          articleId: 'article-1',
          title: 'Margin of safety quote',
          snippet: 'Price is what you pay, value is what you get.'
        })],
        sourceContext: 'home_reference_tray',
        provenancePending: true
      }
    ));
  });

  it('renders corpus telemetry, the live ticker, and first-run starter actions', () => {
    const onCreateNote = jest.fn();
    const onCreateConcept = jest.fn();
    const onCreateQuestion = jest.fn();
    render(
      <ThinkHome
        {...baseProps}
        onCreateNote={onCreateNote}
        onCreateConcept={onCreateConcept}
        onCreateQuestion={onCreateQuestion}
      />
    );

    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('corpus:');
    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('0 sources');
    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('0 wiki pages');
    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('0 agent moves');
    expect(screen.getByLabelText('Thought partner home trace')).toHaveTextContent('waiting for first source or thought');
    expect(screen.getByLabelText('Agent orientation')).toHaveTextContent('Thought partner is ready to seed the space.');
    expect(screen.getByRole('status', { name: 'Thought partner status' })).toHaveTextContent('Thought partner is ready to seed the space.');
    expect(screen.getByTestId('think-home-first-run')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Drop a source' }));
    expect(screen.getByPlaceholderText('Think, ask, or build...')).toHaveValue('/ingest ');
    expect(screen.getByText('Paste a source URL after /ingest, or use reference... to pull a Library item.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Start a thought' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Build a concept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));

    expect(onCreateNote).toHaveBeenCalledTimes(1);
    expect(onCreateConcept).toHaveBeenCalledTimes(1);
    expect(onCreateQuestion).toHaveBeenCalledTimes(1);
  });

  it('shows a living pulse from recent work and source material', () => {
    render(
      <ThinkHome
        {...baseProps}
        recentTargets={[{
          id: 'recent-1',
          type: 'concept',
          title: 'Circle of competence',
          openedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
        }]}
        returnQueue={[{
          _id: 'rq1',
          itemType: 'article',
          item: { title: 'Munger interview' },
          reason: 'due today'
        }]}
        recentHighlights={[{
          _id: 'h1',
          articleTitle: 'Margin of safety',
          text: 'A durable margin of safety changes how you evaluate downside.'
        }]}
        corpusTelemetry={{
          sources: 2,
          highlights: 7,
          concepts: 3,
          wikiPages: 1,
          openThreads: 1,
          agentMoves: 1,
          returnQueue: 1
        }}
        recentWikiPages={[{
          _id: 'wiki-1',
          title: 'Circle of competence',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
        }]}
        recentAgentActivity={[{
          id: 'activity-1',
          title: 'Maintained investing pages',
          summary: 'Rebuilt one page from library sources.'
        }]}
      />
    );

    expect(screen.queryByTestId('think-home-first-run')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('2 sources');
    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('1 wiki page');
    expect(screen.getByLabelText('Corpus telemetry')).toHaveTextContent('1 agent move');
    expect(screen.getByLabelText('Thought partner home trace')).toHaveTextContent('found 5 live threads');
    expect(screen.getAllByText('Circle of competence').length).toBeGreaterThan(0);
    expect(screen.getByText('Maintained investing pages')).toBeInTheDocument();
    expect(screen.getAllByText('Munger interview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Margin of safety').length).toBeGreaterThan(0);
  });

  it('makes living pulse rows actionable for resume and metabolize moves', async () => {
    const onOpenConcept = jest.fn();
    const onUniversalCommand = jest.fn().mockResolvedValue('Thought partner is feeding this source to Wiki.');
    render(
      <ThinkHome
        {...baseProps}
        workingSet={{
          notebooks: [],
          concepts: [{ _id: 'concept-1', name: 'Margin of safety', count: 3 }],
          questions: []
        }}
        recentArticles={[{
          _id: 'article-1',
          title: 'Investor letter',
          url: 'https://example.com/investor-letter',
          summary: 'Cash-flow valuation notes.'
        }]}
        corpusTelemetry={{
          sources: 1,
          highlights: 0,
          concepts: 1,
          wikiPages: 0,
          openThreads: 0,
          agentMoves: 0,
          returnQueue: 0
        }}
        onOpenConcept={onOpenConcept}
        onUniversalCommand={onUniversalCommand}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Concept: Margin of safety' }));
    expect(onOpenConcept).toHaveBeenCalledWith('Margin of safety');

    fireEvent.click(screen.getByRole('button', { name: 'Source: Investor letter' }));

    await waitFor(() => expect(onUniversalCommand).toHaveBeenCalledWith(
      '/ingest @article:article-1 https://example.com/investor-letter',
      {
        references: [expect.objectContaining({
          type: 'article',
          id: 'article-1',
          title: 'Investor letter',
          snippet: 'Cash-flow valuation notes.'
        })],
        sourceContext: 'home_reference_tray',
        provenancePending: true
      }
    ));
    expect(await screen.findByText('Thought partner is feeding this source to Wiki.')).toBeInTheDocument();
  });

  it('uses the home greeting as a specific resume or metabolize entrypoint', () => {
    const onOpenTarget = jest.fn();
    const onOpenArticle = jest.fn();
    const recent = {
      id: 'concept-1',
      type: 'concept',
      title: 'Calm magnetic interfaces',
      openedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    };
    const { rerender } = render(
      <ThinkHome
        {...baseProps}
        recentTargets={[recent]}
        recentArticles={[{ _id: 'a1', title: 'Interface research' }]}
        corpusTelemetry={{
          sources: 1,
          highlights: 2,
          concepts: 1,
          openThreads: 1,
          returnQueue: 0
        }}
        onOpenTarget={onOpenTarget}
        onOpenArticle={onOpenArticle}
      />
    );

    const orientation = screen.getByLabelText('Agent orientation');
    expect(orientation).toHaveTextContent('I kept "Calm magnetic interfaces" warm.');
    fireEvent.click(within(orientation).getByRole('button', { name: 'Resume thread' }));
    expect(onOpenTarget).toHaveBeenCalledWith(recent);

    rerender(
      <ThinkHome
        {...baseProps}
        recentArticles={[{ _id: 'a1', title: 'Interface research' }]}
        corpusTelemetry={{
          sources: 1,
          highlights: 2,
          concepts: 0,
          openThreads: 0,
          returnQueue: 0
        }}
        onOpenTarget={onOpenTarget}
        onOpenArticle={onOpenArticle}
      />
    );

    const nextOrientation = screen.getByLabelText('Agent orientation');
    expect(nextOrientation).toHaveTextContent('Thought partner sees');
    fireEvent.click(within(nextOrientation).getByRole('button', { name: 'Metabolize latest source' }));
    expect(onOpenArticle).toHaveBeenCalledWith({ _id: 'a1', title: 'Interface research' });
  });

  it('feeds the latest source into the universal ingest bridge when available', async () => {
    const onUniversalCommand = jest.fn().mockResolvedValue('Thought partner is feeding this source to Wiki.');
    const onOpenArticle = jest.fn();
    render(
      <ThinkHome
        {...baseProps}
        recentArticles={[{
          _id: 'article-1',
          title: 'Interface research',
          url: 'https://example.com/interface-research',
          summary: 'Source about interface design.'
        }]}
        corpusTelemetry={{
          sources: 1,
          highlights: 0,
          concepts: 0,
          wikiPages: 0,
          openThreads: 0,
          agentMoves: 0,
          returnQueue: 0
        }}
        onUniversalCommand={onUniversalCommand}
        onOpenArticle={onOpenArticle}
      />
    );

    fireEvent.click(within(screen.getByLabelText('Agent orientation')).getByRole('button', { name: 'Metabolize latest source' }));

    expect(screen.getByLabelText('Thought partner home trace')).toHaveTextContent('scanning corpus');
    await waitFor(() => expect(onUniversalCommand).toHaveBeenCalledWith(
      '/ingest @article:article-1',
      {
        references: [expect.objectContaining({
          type: 'article',
          id: 'article-1',
          title: 'Interface research'
        })],
        sourceContext: 'home_reference_tray',
        provenancePending: true
      }
    ));
    expect(await screen.findByText('Thought partner is feeding this source to Wiki.')).toBeInTheDocument();
    expect(onOpenArticle).not.toHaveBeenCalled();
  });

  it('renders a posture-aware thinking index sorted by movement', () => {
    const onOpenConcept = jest.fn();
    const onOpenQuestion = jest.fn();
    const onOpenNotebook = jest.fn();
    const onCreateConcept = jest.fn();
    const onCreateQuestion = jest.fn();
    const onCreateNote = jest.fn();
    render(
      <ThinkHome
        {...baseProps}
        recentTargets={[
          {
            id: 'question-1',
            type: 'question',
            title: 'How durable is this claim?',
            openedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString()
          },
          {
            id: 'note-1',
            type: 'notebook',
            title: 'Reading scratchpad',
            openedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()
          }
        ]}
        workingSet={{
          notebooks: [{ _id: 'note-1', title: 'Reading scratchpad', updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() }],
          concepts: [{ name: 'Durable claims', count: 4 }],
          questions: [{ _id: 'question-1', text: 'How durable is this claim?', linkedTagName: 'Durable claims' }]
        }}
        onOpenConcept={onOpenConcept}
        onOpenQuestion={onOpenQuestion}
        onOpenNotebook={onOpenNotebook}
        onCreateConcept={onCreateConcept}
        onCreateQuestion={onCreateQuestion}
        onCreateNote={onCreateNote}
      />
    );

    const index = screen.getByRole('region', { name: /Thinking index/i });
    expect(within(index).getByText('Thinking index')).toBeInTheDocument();
    expect(screen.getByText('Generative')).toBeInTheDocument();
    expect(screen.getByText('Dialectical')).toBeInTheDocument();
    expect(screen.getByText('Quiet')).toBeInTheDocument();
    expect(screen.getByText(/sees overlap around/i)).toBeInTheDocument();
    expect(within(index).getByText('4 highlights attached')).toBeInTheDocument();
    expect(within(index).getByText('scoped to Durable claims')).toBeInTheDocument();

    fireEvent.click(within(index).getByRole('button', { name: /Generative idea building Concept Durable claims/ }));
    expect(onOpenConcept).toHaveBeenCalledWith('Durable claims');
    fireEvent.click(within(index).getByRole('button', { name: /Dialectical open inquiry Question How durable is this claim/ }));
    expect(onOpenQuestion).toHaveBeenCalledWith('question-1');
    fireEvent.click(within(index).getByRole('button', { name: /Reading scratchpad/ }));
    expect(onOpenNotebook).toHaveBeenCalledWith('note-1');

    const postureLauncher = within(index).getByRole('toolbar', { name: 'Start a Think posture' });
    fireEvent.click(within(postureLauncher).getByRole('button', { name: 'Open generative' }));
    fireEvent.click(within(postureLauncher).getByRole('button', { name: 'Open dialectical' }));
    fireEvent.click(within(postureLauncher).getByRole('button', { name: 'Open quiet' }));
    expect(onCreateConcept).toHaveBeenCalledTimes(1);
    expect(onCreateQuestion).toHaveBeenCalledTimes(1);
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it('drives the bloom CSS vars on pointermove over the primary button', () => {
    render(<ThinkHome {...baseProps} />);
    const primary = screen.getByRole('button', { name: 'New note' });
    primary.getBoundingClientRect = () => ({
      top: 100, left: 200, right: 320, bottom: 140, width: 120, height: 40, x: 200, y: 100, toJSON: () => ({})
    });
    // jsdom doesn't propagate clientX/clientY through fireEvent.pointerMove options;
    // dispatch a real PointerEvent and assign the coords on the event object.
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'clientX', { value: 250 });
    Object.defineProperty(moveEvent, 'clientY', { value: 120 });
    primary.dispatchEvent(moveEvent);
    expect(primary.style.getPropertyValue('--bloom-x')).toBe('50px');
    expect(primary.style.getPropertyValue('--bloom-y')).toBe('20px');

    fireEvent.pointerLeave(primary);
    expect(primary.style.getPropertyValue('--bloom-x')).toBe('');
    expect(primary.style.getPropertyValue('--bloom-y')).toBe('');
  });

  it('renders a strengthened Continue hero with type chip and Resume CTA when a recent item exists', () => {
    const onOpenTarget = jest.fn();
    const recent = {
      id: 'concept-1',
      type: 'concept',
      title: 'Calm magnetic interfaces',
      path: '/think?tab=concepts&name=Calm%20magnetic%20interfaces',
      openedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    };
    render(<ThinkHome {...baseProps} recentTargets={[recent]} onOpenTarget={onOpenTarget} />);

    expect(screen.getByText('Calm magnetic interfaces')).toBeInTheDocument();
    expect(screen.getByText('Concept')).toBeInTheDocument();
    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(resume.className).toMatch(/ui-quiet-button--primary/);

    fireEvent.click(resume);
    expect(onOpenTarget).toHaveBeenCalledTimes(1);
    expect(onOpenTarget.mock.calls[0][0].id).toBe('concept-1');

    fireEvent.click(screen.getByRole('button', { name: 'Resume Calm magnetic interfaces' }));
    expect(onOpenTarget).toHaveBeenCalledTimes(2);
  });

  it('falls back to an empty message when there is no recent item', () => {
    render(<ThinkHome {...baseProps} />);
    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('shows column-level empty actions and wires them to the create handlers', () => {
    const onCreateNote = jest.fn();
    const onCreateConcept = jest.fn();
    const onCreateQuestion = jest.fn();
    render(
      <ThinkHome
        {...baseProps}
        onCreateNote={onCreateNote}
        onCreateConcept={onCreateConcept}
        onCreateQuestion={onCreateQuestion}
      />
    );

    // Each empty column shows its action.
    expect(screen.getByTestId('think-home-empty-notebooks')).toBeInTheDocument();
    expect(screen.getByTestId('think-home-empty-concepts')).toBeInTheDocument();
    expect(screen.getByTestId('think-home-empty-questions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start your first note/ }));
    fireEvent.click(screen.getByRole('button', { name: /Create your first concept/ }));
    fireEvent.click(screen.getByRole('button', { name: /Capture your first question/ }));

    expect(onCreateNote).toHaveBeenCalledTimes(1);
    expect(onCreateConcept).toHaveBeenCalledTimes(1);
    expect(onCreateQuestion).toHaveBeenCalledTimes(1);
  });

  it('hides the column empty action once the column has items', () => {
    render(
      <ThinkHome
        {...baseProps}
        workingSet={{
          notebooks: [{ _id: 'n1', title: 'A note', updatedAt: new Date().toISOString() }],
          concepts: [],
          questions: []
        }}
      />
    );

    expect(screen.queryByTestId('think-home-empty-notebooks')).not.toBeInTheDocument();
    expect(screen.getByTestId('think-home-empty-concepts')).toBeInTheDocument();
    expect(screen.getByTestId('think-home-empty-questions')).toBeInTheDocument();
  });
});
