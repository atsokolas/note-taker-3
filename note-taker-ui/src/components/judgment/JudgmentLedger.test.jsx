import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JudgmentLedger from './JudgmentLedger';
import {
  getJudgmentLedger,
  recordJudgmentOutcome,
  resolveJudgmentLesson
} from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  getJudgmentLedger: jest.fn(),
  recordJudgmentOutcome: jest.fn(),
  resolveJudgmentLesson: jest.fn()
}));

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: () => true
}));

const page = {
  _id: '64f500000000000000000010',
  createdAt: '2026-01-01T12:00:00.000Z',
  sourceRefs: [{ _id: 'src-10k', citationLabel: '10-K' }],
  judgment: {
    currentJudgment: 'Compute stays scarce.',
    decisionPosture: 'watch',
    bornAt: '2026-01-15T12:00:00.000Z',
    why: [{ reasonId: 'why-1', text: 'Lead times.', createdAt: '2026-01-20T12:00:00.000Z', sourceRefIds: ['src-10k'] }],
    against: [{ reasonId: 'against-1', text: 'In-house silicon.', createdAt: '2026-06-01T12:00:00.000Z' }],
    unknowns: [{ unknownId: 'u1', question: 'Does conversion slip?', createdAt: '2026-01-22T12:00:00.000Z' }],
    clocks: [
      {
        factId: 'c-e',
        clock: 'evidence',
        occurredAt: '2026-02-01T12:00:00.000Z',
        recordedAt: '2026-08-20T12:00:00.000Z',
        precision: 'day',
        authoredBy: 'world',
        summary: 'A February filing.',
        explained: {
          label: 'When the world spoke',
          when: 'Feb 1, 2026',
          author: 'The world',
          late: true,
          lateNote: 'Written down Aug 20, 2026.',
          precisionNote: ''
        }
      },
      {
        factId: 'c-d',
        clock: 'decision',
        occurredAt: '2026-01-15T12:00:00.000Z',
        recordedAt: '2026-01-15T12:00:00.000Z',
        summary: 'Held the claim.',
        causalKind: 'inference',
        explained: { label: 'When you decided', when: 'Jan 15, 2026', author: 'You' }
      }
    ],
    verdicts: [{ verdictId: 'v1', result: 'held_up', recordedAt: '2026-08-01T12:00:00.000Z' }],
    outcomes: []
  }
};

const ledger = {
  clocks: page.judgment.clocks,
  moments: ['2026-01-15T12:00:00.000Z', '2026-03-01T12:00:00.000Z', '2026-08-20T12:00:00.000Z'],
  replay: {
    frames: [
      { factId: 'c-e', clock: 'evidence', label: 'When the world spoke', summary: 'A February filing.', pivotal: true, source: { resolved: true, label: '10-K' } },
      { factId: 'c-d', clock: 'decision', label: 'When you decided', summary: 'Held the claim.', pivotal: true, causalKind: 'inference' }
    ],
    summary: 'Knew a February filing; then held the claim.'
  },
  postmortem: {
    question: 'Did it hold for the reasons you thought?',
    verdictId: 'v1',
    verdict: 'held_up'
  },
  proposals: [{
    applicationId: 'apply-1',
    lessonId: 'l-power',
    text: 'Watch conversion, not announcements.',
    sourcePageId: 'settled-1',
    sourceClaim: 'Compute stays scarce through 2027.',
    proposed: true,
    asserted: false,
    status: 'proposed',
    relevance: 'shared evidence'
  }]
};

describe('JudgmentLedger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getJudgmentLedger.mockResolvedValue(ledger);
  });

  it('names each clock and lets the time cursor lift tracing paper', async () => {
    render(<JudgmentLedger pageId={page._id} claim={page.judgment.currentJudgment} page={page} judgment={page.judgment} />);
    expect(await screen.findByText(/Written down/)).toBeInTheDocument();
    expect(screen.getAllByText('When the world spoke').length).toBeGreaterThan(0);
    const slider = screen.getByRole('slider', { name: /belief at this moment/i });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(await screen.findByText(/tracing paper/i)).toBeInTheDocument();
  });

  it('replays evidence to action without bounce, and labels inference', async () => {
    render(<JudgmentLedger pageId={page._id} claim={page.judgment.currentJudgment} page={page} judgment={page.judgment} />);
    expect(await screen.findByText(/Knew a February filing/)).toBeInTheDocument();
    expect(screen.getByText('Inference')).toBeInTheDocument();
    expect(screen.getByText('10-K')).toBeInTheDocument();
  });

  it('asks the one-question postmortem and may record a lesson without rewriting the verdict', async () => {
    recordJudgmentOutcome.mockResolvedValue({
      judgment: {
        ...page.judgment,
        outcomes: [{ outcomeId: 'o1', verdictSnapshot: 'held_up', answer: 'Power, not silicon.', lesson: 'Watch conversion.' }]
      }
    });
    const saved = jest.fn();
    render(<JudgmentLedger pageId={page._id} claim={page.judgment.currentJudgment} page={page} judgment={page.judgment} onSaved={saved} />);
    expect(await screen.findByText('Did it hold for the reasons you thought?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'It held' }));
    fireEvent.change(screen.getByPlaceholderText(/one sentence/i), { target: { value: 'Power, not silicon.' } });
    fireEvent.change(screen.getByPlaceholderText(/a lesson/i), { target: { value: 'Watch conversion.' } });
    fireEvent.click(screen.getByRole('button', { name: /record what followed/i }));
    await waitFor(() => expect(recordJudgmentOutcome).toHaveBeenCalledWith(expect.objectContaining({
      silence: false,
      answer: 'Power, not silicon.',
      lesson: 'Watch conversion.',
      verdictId: 'v1'
    })));
  });

  it('proposes a settled lesson and will not assert it', async () => {
    resolveJudgmentLesson.mockResolvedValue({ judgment: page.judgment });
    render(<JudgmentLedger pageId={page._id} claim={page.judgment.currentJudgment} page={page} judgment={page.judgment} />);
    expect(await screen.findByText('Watch conversion, not announcements.')).toBeInTheDocument();
    expect(screen.getByText(/Not asserted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it here' }));
    await waitFor(() => expect(resolveJudgmentLesson).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted',
      lessonId: 'l-power'
    })));
  });

  it('honors reduced motion by remaining still', async () => {
    const { container } = render(<JudgmentLedger pageId={page._id} claim={page.judgment.currentJudgment} page={page} judgment={page.judgment} />);
    await screen.findByRole('heading', { name: 'The ledger' });
    expect(container.querySelector('.judgment-ledger')).toHaveClass('is-still');
  });
});
