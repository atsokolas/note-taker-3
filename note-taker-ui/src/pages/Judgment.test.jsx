import React from 'react';
import * as router from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Judgment from './Judgment';
import AgentRail from '../agent/AgentRail';
import { AgentRailProvider } from '../agent/AgentRailContext';
import { useNoeisSurface } from '../surface/NoeisSurfaceContext';
import { clearSentenceHandoff, peekSentenceHandoff, resetFirstPaint } from '../motion/columnMotion';
import { SystemStatusProvider } from '../system/SystemStatusContext';
import {
  getCompanyDossierJudgmentReview,
  getJudgmentChangeProposal,
  getJudgmentLibraryEvidence,
  getWikiPage,
  listCompanyDossierJudgmentReviews,
  listWikiPages,
  listWikiSourceEvents,
  proposeJudgmentChange,
  resolveCompanyDossierJudgmentReview,
  resolveJudgmentChange,
  updateWikiPage
} from '../api/wiki';
import { streamChatWithAgent } from '../api/agent';

jest.mock('../api/articles', () => ({ getArticles: jest.fn(() => Promise.resolve([])) }));

jest.mock('../surface/NoeisSurfaceContext', () => ({
  useNoeisSurface: jest.fn()
}));

jest.mock('../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getCompanyDossierJudgmentReview: jest.fn(),
  getJudgmentChangeProposal: jest.fn(),
  getJudgmentLibraryEvidence: jest.fn(),
  getWikiPage: jest.fn(),
  listCompanyDossierJudgmentReviews: jest.fn(),
  listWikiPages: jest.fn(),
  listWikiSourceEvents: jest.fn(),
  proposeJudgmentChange: jest.fn(),
  resolveCompanyDossierJudgmentReview: jest.fn(),
  resolveJudgmentChange: jest.fn(),
  updateWikiPage: jest.fn()
}));

jest.mock('../api/agent', () => ({
  getAgentThread: jest.fn(),
  streamChatWithAgent: jest.fn()
}));

jest.mock('../api/dailyLoop', () => ({
  recordClaimFalsifiability: jest.fn().mockResolvedValue({})
}));

jest.mock('../api/judgmentResolution', () => ({
  getJudgmentLedger: jest.fn(() => Promise.resolve({
    clocks: [],
    moments: [],
    replay: { frames: [] },
    proposals: []
  })),
  recordJudgmentOutcome: jest.fn(),
  resolveJudgmentLesson: jest.fn(),
  recordJudgmentVerdict: jest.fn(),
  setJudgmentResolution: jest.fn()
}));

const judgmentPage = () => ({
  _id: 'wiki-nvidia',
  title: 'NVIDIA',
  sourceRefs: [
    { _id: 'src-1', type: 'external', citationLabel: 'SemiAnalysis', url: 'https://semianalysis.com/capacity' },
    { _id: 'src-2', type: 'external', citationLabel: 'TrendForce', url: 'https://trendforce.com/supply' }
  ],
  judgment: {
    kind: 'thesis',
    governingQuestion: 'Does demand outrun capacity?',
    currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
    startedAt: '2026-02-14T12:00:00.000Z',
    why: [
      { reasonId: 'why-1', text: 'AI demand keeps compounding faster than new supply.', sourceRefIds: ['src-1'] },
      { reasonId: 'why-2', text: 'Lead times and power constrain what can be delivered.', sourceRefIds: ['src-2'] }
    ],
    against: [{ reasonId: 'against-1', text: 'Hyperscalers are designing more in-house silicon.', sourceRefIds: ['src-1'] }],
    falsifiers: [{ falsifierId: 'f-1', text: 'Confirmed signed capacity converts within 90 days.', status: 'unobserved' }],
    decisions: [{
      decisionId: 'd-1',
      summary: 'Started 1.5%. Won’t add until signed capacity converts.',
      decidedAt: '2026-02-14T12:00:00.000Z',
      status: 'taken',
      reviewAt: '2027-02-14T12:00:00.000Z',
      outcome: {}
    }]
  }
});

const overnightEvent = () => ({
  _id: 'event-1',
  affectedPageIds: ['wiki-nvidia'],
  title: 'Deliverable capacity still lags demand',
  summary: 'The filing restates the same gap.',
  createdAt: '2026-08-14T04:00:00.000Z'
});

const articleReply = (reply, id = 'article-counter-1', title = 'Capacity disclosures') => ({
  reply,
  relatedItems: [{ type: 'article', id, title, snippet: reply }]
});

const dossierResearchReview = () => ({
  id: 'company-dossier-judgment-review:wiki-nvidia:candidate-1',
  kind: 'company_dossier_judgment_review',
  status: 'awaiting_review',
  title: 'Review what changed for NVDA',
  provenance: {
    pageId: 'wiki-nvidia',
    judgmentAtAcceptance: 'NVIDIA demand still outruns deliverable capacity.',
    comparison: {
      headline: 'Supply evidence strengthened while export risk widened.',
      summary: 'The accepted research changed two decision-relevant claims.',
      claimChanges: [{
        kind: 'changed',
        title: 'CoWoS supply expanded faster than expected.',
        detail: 'The capacity constraint eased, but did not disappear.'
      }],
      expectations: {
        summary: 'The base case still requires revenue growth above 30%.'
      }
    }
  }
});

const judgmentChangeProposal = (after = 'Capacity is easing faster than demand is compounding.') => ({
  id: 'judgment-change-proposal:wiki-nvidia:proposal-1',
  kind: 'judgment_change_proposal',
  status: 'pending',
  provenance: {
    pageId: 'wiki-nvidia',
    proposalId: 'proposal-1',
    before: 'NVIDIA demand still outruns deliverable capacity.',
    after
  }
});

// The rail is mounted beside the column, as it is in the shell. Rendering them
// together is what lets a test assert the whole contract: the agent retrieves
// on one side, the human accepts, and the line appears on the other.
const withRail = (children) => (
  <AgentRailProvider>
    {children}
    <AgentRail />
  </AgentRailProvider>
);

const renderDetail = () => {
  jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'wiki-nvidia' });
  return render(withRail(<Judgment />));
};

const renderDetailWithStatus = (controls) => {
  jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'wiki-nvidia' });
  return render(
    <SystemStatusProvider value={controls}>
      {withRail(<Judgment />)}
    </SystemStatusProvider>
  );
};

const renderIndex = () => {
  jest.spyOn(router, 'useParams').mockReturnValue({});
  return render(withRail(<Judgment />));
};

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetFirstPaint();
  clearSentenceHandoff();
  listWikiPages.mockResolvedValue([]);
  listCompanyDossierJudgmentReviews.mockResolvedValue([]);
  listWikiSourceEvents.mockResolvedValue([]);
  getCompanyDossierJudgmentReview.mockResolvedValue(null);
  getJudgmentChangeProposal.mockResolvedValue(null);
  proposeJudgmentChange.mockImplementation(async (_pageId, proposed) => judgmentChangeProposal(proposed));
  resolveJudgmentChange.mockImplementation(async (_pageId, _receiptId, action) => {
    const proposal = judgmentChangeProposal();
    return {
      page: action === 'accept'
        ? { ...judgmentPage(), judgment: { ...judgmentPage().judgment, currentJudgment: proposal.provenance.after } }
        : judgmentPage(),
      proposal: { ...proposal, status: `${action}${action === 'defer' ? 'red' : action.endsWith('e') ? 'd' : 'ed'}` }
    };
  });
  resolveCompanyDossierJudgmentReview.mockImplementation(async (_pageId, _receiptId, resolution) => ({
    ...dossierResearchReview(),
    status: 'completed',
    provenance: { ...dossierResearchReview().provenance, resolution }
  }));
  getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
  streamChatWithAgent.mockResolvedValue({ reply: 'Noeis found no decisive counterevidence.' });
});

describe('Judgment index', () => {
  it('declares the claim-first Judgment index to the persistent shell', async () => {
    renderIndex();

    await screen.findByLabelText('Hold a sentence');
    expect(useNoeisSurface).toHaveBeenCalledWith(expect.objectContaining({
      room: 'judgment',
      objectType: 'judgment_index',
      objectId: 'all',
      projection: 'index'
    }));
  });

  it('is a title column, with the claim under it when they differ', async () => {
    listWikiPages.mockResolvedValue([
      judgmentPage(),
      { _id: 'plain', title: 'A plain wiki page' }
    ]);

    renderIndex();

    const content = within(document.querySelector('.judgment-room__content'));
    const title = await content.findByRole('link', { name: 'NVIDIA' });
    expect(title).toHaveAttribute('href', '/judgment/wiki-nvidia');
    expect(content.getByText('NVIDIA demand still outruns deliverable capacity.')).toBeInTheDocument();
    expect(screen.queryByText('A plain wiki page')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /company case/i })).not.toBeInTheDocument();
  });

  it('hands the case headline off when opening a claim, so the title can fly', async () => {
    listWikiPages.mockResolvedValue([judgmentPage()]);

    renderIndex();

    const title = await within(document.querySelector('.judgment-room__content'))
      .findByRole('link', { name: 'NVIDIA' });
    title.getBoundingClientRect = () => ({ top: 80, left: 24, width: 220, height: 28 });
    title.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(title);

    expect(peekSentenceHandoff()).toEqual(expect.objectContaining({
      sentence: 'NVIDIA',
      rect: expect.objectContaining({ top: 80, left: 24, width: 220 })
    }));
  });

  it('quietly marks a case when accepted dossier research awaits the owner', async () => {
    listWikiPages.mockResolvedValue([judgmentPage()]);
    listCompanyDossierJudgmentReviews.mockResolvedValue([dossierResearchReview()]);

    renderIndex();

    const content = within(document.querySelector('.judgment-room__content'));
    const caseLink = await content.findByRole('link', { name: 'NVIDIA' });
    const row = caseLink.closest('li');
    expect(within(row).getByText('Accepted research to review')).toBeInTheDocument();
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('recovers from a compact projection that hides judgments on older pages', async () => {
    listWikiPages
      .mockResolvedValueOnce([{ _id: 'wiki-nvidia', title: 'NVIDIA' }])
      .mockResolvedValueOnce([judgmentPage()]);

    renderIndex();

    expect(await within(document.querySelector('.judgment-room__content')).findByRole('link', {
      name: 'NVIDIA'
    })).toHaveAttribute('href', '/judgment/wiki-nvidia');
    expect(listWikiPages).toHaveBeenNthCalledWith(1, { projection: 'judgment', limit: 500 });
    expect(listWikiPages).toHaveBeenNthCalledWith(2, { limit: 200 });
  });

  /* The empty index is one prompt: hold a sentence. A company-case composer
     used to sit beside it, as if this were an investing app. Wiki still has
     that path for dossiers; Judgment does not peer it here. */
  it('asks to hold a sentence, and does not offer a company case', async () => {
    listWikiPages.mockResolvedValue([]);

    renderIndex();

    expect(await screen.findByLabelText('Hold a sentence')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('One sentence you think is true.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /company case/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Create a company case/i)).not.toBeInTheDocument();
    expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /morning/i })).not.toBeInTheDocument();
    expect(document.querySelector('.judgment__index')).not.toBeInTheDocument();
  });
});

describe('Judgment claim', () => {
  it('declares the exact claim and its decision identities to the persistent shell', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(getWikiPage).toHaveBeenCalledWith('wiki-nvidia', { reader: 1 });
    await waitFor(() => expect(useNoeisSurface).toHaveBeenCalledWith(expect.objectContaining({
      room: 'judgment',
      objectType: 'judgment_claim',
      objectId: 'wiki-nvidia',
      pageId: 'wiki-nvidia',
      claimId: 'wiki-nvidia',
      title: 'NVIDIA',
      decisionIds: ['d-1'],
      latestDecisionId: 'd-1',
      projection: 'case'
    })));
  });

  it('holds the prior still, with the log underneath', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    expect(await screen.findByLabelText('Title')).toHaveValue('NVIDIA');
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
    expect(screen.getByRole('link', { name: '← All judgments' })).toHaveAttribute('href', '/judgment');
    expect(screen.getByText('I’d change my mind if')).toBeInTheDocument();
    expect(screen.getByText('Confirmed signed capacity converts within 90 days.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Why' })).toBeChecked();
    expect(screen.getByLabelText('Why do you believe it?')).toBeInTheDocument();
    const semi = screen.getAllByRole('link', { name: 'Source 1: SemiAnalysis' });
    expect(semi).toHaveLength(2);
    expect(semi[0]).toHaveAttribute('href', 'https://semianalysis.com/capacity');
    expect(screen.getByRole('link', { name: 'Source 2: TrendForce' }))
      .toHaveAttribute('href', 'https://trendforce.com/supply');
    expect(screen.queryByText('SemiAnalysis and TrendForce')).not.toBeInTheDocument();
    expect(screen.getByText('AI demand keeps compounding faster than new supply.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /February 2026/ })).toBeInTheDocument();
    expect(screen.queryByText('Started 1.5%. Won’t add until signed capacity converts.')).not.toBeInTheDocument();

    fireEvent.mouseEnter(semi[0]);
    expect(document.querySelector('.judgment-log')).toHaveClass('is-listening');
    expect(document.querySelectorAll('.judgment-log__row.is-kin')).toHaveLength(2);
    expect(screen.getByText('SemiAnalysis · 2 lines')).toBeInTheDocument();
  });

  it('opens a library-backed [n] in the library instead of ejecting to the open web', async () => {
    getWikiPage.mockResolvedValue({
      ...judgmentPage(),
      sourceRefs: [
        ...judgmentPage().sourceRefs,
        {
          _id: 'src-lib',
          type: 'article',
          citationLabel: '10-K',
          objectId: 'nvda-10k',
          url: 'https://www.sec.gov/Archives/edgar/data/1045810/nvda.htm'
        }
      ],
      judgment: {
        ...judgmentPage().judgment,
        why: [
          ...judgmentPage().judgment.why,
          { reasonId: 'why-lib', text: 'The filing already names the capacity gap.', sourceRefIds: ['src-lib'] }
        ]
      }
    });

    renderDetail();

    const cite = await screen.findByRole('link', { name: 'Source 3: 10-K' });
    expect(cite).toHaveAttribute('href', '/library?articleId=nvda-10k');
    expect(cite).not.toHaveAttribute('target');
    expect(cite).toHaveClass('is-passage');
    expect(screen.getAllByRole('link', { name: 'Source 1: SemiAnalysis' })[0])
      .toHaveAttribute('target', '_blank');
  });

  it('lets the log show one side of the case', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('tab', { name: 'Against' }));
    expect(screen.getByText('Hyperscalers are designing more in-house silicon.')).toBeInTheDocument();
    expect(screen.queryByText('AI demand keeps compounding faster than new supply.')).not.toBeInTheDocument();
  });

  it('renames the case without rewriting the claim', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), ...body }));

    renderDetail();

    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'NVDA' } });
    fireEvent.blur(title);

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('wiki-nvidia', { title: 'NVDA' }));
    expect(updateWikiPage.mock.calls[0][1].judgment).toBeUndefined();
    expect(screen.getByLabelText('Title')).toHaveValue('NVDA');
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
  });

  it('does not overwrite a title still being typed', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    let finishSave;
    updateWikiPage.mockImplementation(() => new Promise((resolve) => {
      finishSave = () => resolve({ ...judgmentPage(), title: 'NVDA' });
    }));

    renderDetail();
    const title = await screen.findByLabelText('Title');
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'NVDA' } });
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    fireEvent.change(title, { target: { value: 'NVDA Corp' } });
    await act(async () => { finishSave(); });
    expect(title).toHaveValue('NVDA Corp');
  });

  it('keeps an unnamed case’s title empty and the opinion underneath', async () => {
    const unnamed = judgmentPage();
    unnamed.title = unnamed.judgment.currentJudgment;
    getWikiPage.mockResolvedValue(unnamed);

    renderDetail();

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Name this');
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
    expect(title).not.toHaveValue('NVIDIA demand still outruns deliverable capacity.');
  });

  it('yields the name ghost when a name is typed', async () => {
    const unnamed = judgmentPage();
    unnamed.title = unnamed.judgment.currentJudgment;
    getWikiPage.mockResolvedValue(unnamed);

    renderDetail();

    const title = await screen.findByLabelText('Title');
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'Compute' } });

    expect(title).toHaveValue('Compute');
    expect(screen.queryByDisplayValue('Name this')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
  });

  it('does not ghost Name this on a named case', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('NVIDIA');
    expect(title).not.toHaveAttribute('placeholder', 'Name this');
    expect(screen.queryByDisplayValue('Name this')).not.toBeInTheDocument();
  });

  it('names an unnamed case without swallowing the opinion', async () => {
    const unnamed = judgmentPage();
    unnamed.title = unnamed.judgment.currentJudgment;
    getWikiPage.mockResolvedValue(unnamed);
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...unnamed, ...body }));

    renderDetail();

    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'AI' } });
    fireEvent.blur(title);

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('wiki-nvidia', { title: 'AI' }));
    expect(updateWikiPage.mock.calls[0][1].judgment).toBeUndefined();
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
  });

  it('rewrites the opinion without renaming the case', async () => {
    const dated = judgmentPage();
    dated.judgment.why[0].createdAt = '2026-02-14T12:00:00.000Z';
    getWikiPage.mockResolvedValue(dated);
    const next = 'I am bullish NVIDIA compute.';
    const acceptedPage = {
      ...dated,
      judgment: {
        ...dated.judgment,
        currentJudgment: next,
        decisions: [
          ...dated.judgment.decisions,
          { decisionId: 'change-1', summary: `Changed what I hold: ${next}`, status: 'taken', decidedAt: '2026-08-30T13:00:00.000Z' }
        ]
      }
    };
    resolveJudgmentChange.mockResolvedValue({
      page: acceptedPage,
      proposal: { ...judgmentChangeProposal(next), status: 'accepted' }
    });

    renderDetail();

    const opinion = await screen.findByLabelText('What you hold');
    fireEvent.change(opinion, { target: { value: next } });
    fireEvent.blur(opinion);

    await waitFor(() => expect(proposeJudgmentChange).toHaveBeenCalledWith('wiki-nvidia', next));
    expect(screen.queryByTestId('ariadne-thread')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What you hold')).toHaveValue('NVIDIA demand still outruns deliverable capacity.');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(resolveJudgmentChange).toHaveBeenCalledWith(
      'wiki-nvidia', judgmentChangeProposal(next).id, 'accept'
    ));
    expect(updateWikiPage).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('NVIDIA');
    await waitFor(() => {
      expect(document.querySelector('.judgment-log__row--did .judgment-log__text'))
        .toHaveTextContent('Changed what I hold: I am bullish NVIDIA compute.');
    });
    expect(screen.getByTestId('opinion-ghost'))
      .toHaveTextContent('NVIDIA demand still outruns deliverable capacity.');
    expect(screen.getByLabelText('What you hold')).toHaveValue(next);
    expect(await screen.findByTestId('ariadne-thread')).toBeInTheDocument();
  });

  it('does not draw provenance when accepting the proposed change fails', async () => {
    const next = 'I am bullish NVIDIA compute.';
    getWikiPage.mockResolvedValue(judgmentPage());
    resolveJudgmentChange.mockRejectedValueOnce(new Error('The write failed.'));
    renderDetail();

    const opinion = await screen.findByLabelText('What you hold');
    fireEvent.change(opinion, { target: { value: next } });
    fireEvent.blur(opinion);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The write failed.');
    expect(screen.queryByTestId('ariadne-thread')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
  });

  it('offers all four human dispositions and restores the receipt after reload', async () => {
    const proposal = judgmentChangeProposal('Capacity is easing faster than demand is compounding.');
    getWikiPage.mockResolvedValue(judgmentPage());
    getJudgmentChangeProposal.mockResolvedValue(proposal);

    const first = renderDetail();
    const review = await screen.findByRole('region', { name: 'Judgment change review' });
    ['Accept', 'Preserve', 'Reject', 'Defer'].forEach(label => {
      expect(within(review).getByRole('button', { name: label })).toBeInTheDocument();
    });
    fireEvent.click(within(review).getByRole('button', { name: 'Defer' }));
    await waitFor(() => expect(resolveJudgmentChange).toHaveBeenCalledWith(
      'wiki-nvidia', proposal.id, 'defer'
    ));
    first.unmount();

    getJudgmentChangeProposal.mockResolvedValue({ ...proposal, status: 'deferred' });
    renderDetail();
    expect(await screen.findByText('Deferred')).toBeInTheDocument();
    expect(screen.getByText('Receipt bound to the exact before and after sentences.')).toBeInTheDocument();
  });

  it('does not ghost the opinion on first paint', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    renderDetail();
    await screen.findByLabelText('What you hold');
    expect(screen.queryByTestId('opinion-ghost')).not.toBeInTheDocument();
  });

  it('ghosts the previous opinion on an unnamed case, not the stuffed title', async () => {
    const unnamed = judgmentPage();
    unnamed.title = unnamed.judgment.currentJudgment;
    getWikiPage.mockResolvedValue(unnamed);
    const next = 'I am bullish NVIDIA compute.';
    resolveJudgmentChange.mockResolvedValue({
      page: { ...unnamed, judgment: { ...unnamed.judgment, currentJudgment: next } },
      proposal: { ...judgmentChangeProposal(next), status: 'accepted' }
    });

    renderDetail();

    const opinion = await screen.findByLabelText('What you hold');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    fireEvent.change(opinion, { target: { value: next } });
    fireEvent.blur(opinion);
    await screen.findByRole('button', { name: 'Accept' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(screen.getByTestId('opinion-ghost'))
      .toHaveTextContent('NVIDIA demand still outruns deliverable capacity.'));
    expect(screen.getByTestId('opinion-ghost'))
      .not.toHaveTextContent('Name this');
    expect(screen.getByLabelText('What you hold')).toHaveValue(next);
  });

  it('does not ghost a blank when the opinion is restored', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    renderDetail();
    const opinion = await screen.findByLabelText('What you hold');
    fireEvent.change(opinion, { target: { value: '' } });
    fireEvent.blur(opinion);
    expect(opinion).toHaveValue('NVIDIA demand still outruns deliverable capacity.');
    expect(screen.queryByTestId('opinion-ghost')).not.toBeInTheDocument();
  });

  it('asks the owner to review accepted dossier research without changing the judgment', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    getCompanyDossierJudgmentReview.mockResolvedValue(dossierResearchReview());

    renderDetail();

    expect(await screen.findByText('Accepted research · your view is unchanged')).toBeInTheDocument();
    expect(screen.getByText('Supply evidence strengthened while export risk widened.')).toBeInTheDocument();
    expect(screen.getByText('CoWoS supply expanded faster than expected.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the accepted research' }))
      .toHaveAttribute('href', '/wiki/workspace?page=wiki-nvidia#wiki-dossier-review');
    expect(screen.getByLabelText('What you hold'))
      .toHaveValue('NVIDIA demand still outruns deliverable capacity.');
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('lets the owner keep the judgment without writing it again', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    getCompanyDossierJudgmentReview.mockResolvedValue(dossierResearchReview());

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Keep this view' }));

    await waitFor(() => expect(resolveCompanyDossierJudgmentReview).toHaveBeenCalledWith(
      'wiki-nvidia',
      dossierResearchReview().id,
      'kept'
    ));
    expect(updateWikiPage).not.toHaveBeenCalled();
    expect(screen.queryByText('Accepted research · your view is unchanged')).not.toBeInTheDocument();
  });

  it('resolves a review as revised only after the owner changes the judgment', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    getCompanyDossierJudgmentReview.mockResolvedValue(dossierResearchReview());
    resolveJudgmentChange.mockResolvedValue({
      page: {
        ...judgmentPage(),
        judgment: { ...judgmentPage().judgment, currentJudgment: 'Capacity is easing faster than demand is compounding.' }
      },
      proposal: { ...judgmentChangeProposal(), status: 'accepted' }
    });

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Revise the view' }));
    const opinion = screen.getByLabelText('What you hold');
    expect(opinion).toHaveFocus();
    expect(resolveCompanyDossierJudgmentReview).not.toHaveBeenCalled();

    fireEvent.change(opinion, { target: { value: 'Capacity is easing faster than demand is compounding.' } });
    fireEvent.blur(opinion);

    await screen.findByRole('button', { name: 'Accept' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(resolveJudgmentChange).toHaveBeenCalled());
    await waitFor(() => expect(resolveCompanyDossierJudgmentReview).toHaveBeenCalledWith(
      'wiki-nvidia',
      dossierResearchReview().id,
      'revised'
    ));
    expect(resolveJudgmentChange.mock.invocationCallOrder[0])
      .toBeLessThan(resolveCompanyDossierJudgmentReview.mock.invocationCallOrder[0]);
  });

  it('does not overwrite an opinion still being typed', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    let finishSave;
    proposeJudgmentChange.mockImplementation(() => new Promise((resolve) => {
      finishSave = () => resolve(judgmentChangeProposal('I am bullish NVIDIA.'));
    }));

    renderDetail();
    const opinion = await screen.findByLabelText('What you hold');
    fireEvent.focus(opinion);
    fireEvent.change(opinion, { target: { value: 'I am bullish NVIDIA.' } });
    fireEvent.blur(opinion);
    await waitFor(() => expect(proposeJudgmentChange).toHaveBeenCalled());
    fireEvent.focus(opinion);
    fireEvent.change(opinion, { target: { value: 'I am bullish NVIDIA compute.' } });
    await act(async () => { finishSave(); });
    expect(opinion).toHaveValue('I am bullish NVIDIA compute.');
  });

  it('restores the name if the title is cleared', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();
    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.blur(title);

    expect(title).toHaveValue('NVIDIA');
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('keeps the claim if the opinion is cleared', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();
    const opinion = await screen.findByLabelText('What you hold');
    fireEvent.change(opinion, { target: { value: '' } });
    fireEvent.blur(opinion);

    expect(opinion).toHaveValue('NVIDIA demand still outruns deliverable capacity.');
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  /* This used to assert the opposite: an empty field was absent entirely.
     That rule was right about the danger — nothing on this page may be filled
     in with something plausible — and wrong about the remedy. A judgment
     carried out of a tension arrives with two sides written and two sections
     still to write, and hiding those two left a page that promises four things
     showing one. The section is present; what is absent is any line in it. */
  it('shows an empty field as the question it asks, and writes nothing into it', async () => {
    const bare = judgmentPage();
    bare.judgment.against = [];
    bare.judgment.decisions = [];
    getWikiPage.mockResolvedValue(bare);

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { level: 2, name: 'Against' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'What I did' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Why do you believe it?')).toHaveValue('');
    expect(screen.queryByText('Hyperscalers are designing more in-house silicon.')).not.toBeInTheDocument();
    expect(screen.queryByText(/this line doesn’t get edited/)).not.toBeInTheDocument();
  });

  it('keeps the review off the page until the review date has passed', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { level: 2, name: 'What happened?' })).not.toBeInTheDocument();
  });

  it('arrives with one block when the review date has passed', async () => {
    const due = judgmentPage();
    due.judgment.decisions[0].reviewAt = '2020-01-01T12:00:00.000Z';
    getWikiPage.mockResolvedValue(due);

    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: 'What happened?' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is filled in until you say what happened/)).toBeInTheDocument();
  });
});

describe('the overnight line', () => {
  it('sits on the threshold of the claim and writes into Against when accepted', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    expect(await screen.findByText(/Overnight: Deliverable capacity still lags demand\./)).toBeInTheDocument();
    const overnight = screen.getByRole('group', { name: 'Overnight agent line' });
    const back = screen.getByRole('link', { name: /All judgments/ });
    const title = screen.getByLabelText('Title');
    expect(back.compareDocumentPosition(overnight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overnight.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overnight).toHaveClass('judgment-slip');

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    const [pageId, updates] = updateWikiPage.mock.calls[0];
    expect(pageId).toBe('wiki-nvidia');
    expect(updates.judgment.against.map(line => line.text)).toEqual([
      'Hyperscalers are designing more in-house silicon.',
      'Deliverable capacity still lags demand. The filing restates the same gap.'
    ]);
    // The lines already on the page are carried forward untouched.
    expect(updates.judgment.why.map(line => line.text)).toEqual([
      'AI demand keeps compounding faster than new supply.',
      'Lead times and power constrain what can be delivered.'
    ]);
    await waitFor(() => expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument());
  });

  it('writes into Why when the human says Why', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.why).toHaveLength(3);
  });

  it('evaporates on Dismiss, persists the id, and writes nothing into Why or Against', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    const [, body] = updateWikiPage.mock.calls[0];
    expect(body.judgment.dismissedOvernightEventIds).toEqual(['event-1']);
    expect(body.judgment.why).toEqual(judgmentPage().judgment.why);
    expect(body.judgment.against).toEqual(judgmentPage().judgment.against);
    await waitFor(() => expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument());
  });

  it('does not resurrect a dismissed overnight line after remount', async () => {
    const stored = { dismissedOvernightEventIds: [] };
    getWikiPage.mockImplementation(async () => {
      const loaded = judgmentPage();
      loaded.judgment.dismissedOvernightEventIds = [...stored.dismissedOvernightEventIds];
      return loaded;
    });
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => {
      stored.dismissedOvernightEventIds = [...(updates.judgment.dismissedOvernightEventIds || [])];
      return { ...judgmentPage(), judgment: updates.judgment };
    });

    const first = renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(stored.dismissedOvernightEventIds).toEqual(['event-1']));
    await waitFor(() => expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument());

    first.unmount();
    renderDetail();

    expect(await screen.findByLabelText('Title')).toHaveValue('NVIDIA');
    expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument();
  });

  it('never reads the daily loop, so the morning paper cursor is untouched', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(listWikiSourceEvents).toHaveBeenCalled();
  });

  it('keeps Why and Against as buttons, even when the inbox is offering the same words', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({
      claim: 'c',
      terms: [],
      candidates: [{
        id: 'highlight:a1:h1',
        text: 'Deliverable capacity lags demand by roughly two years.',
        sourceLabel: 'On compute · FT'
      }]
    });
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);

    renderDetail();
    await screen.findByText(/Overnight: Deliverable capacity still lags demand\./);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    const overnight = screen.getByRole('group', { name: 'Overnight agent line' });
    expect(within(overnight).getByRole('button', { name: 'Why' })).toBeInTheDocument();
    expect(within(overnight).getByRole('button', { name: 'Against' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: 'Against' })).toHaveLength(1);
  });

  it('does not write overnight into the composer draft', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();
    const input = await screen.findByLabelText('Why do you believe it?');
    fireEvent.change(input, { target: { value: 'A typed why.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Overnight agent line' })).getByRole('button', { name: 'Against' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const overnightSave = updateWikiPage.mock.calls.find(([, body]) => (
      (body.judgment.against || []).some(line => /deliverable capacity still lags demand/i.test(line.text))
    ));
    expect(overnightSave).toBeTruthy();
    expect(overnightSave[1].judgment.why.map(line => line.text)).not.toContain('A typed why.');
    expect(overnightSave[1].judgment.against.at(-1).reasonId || '').not.toMatch(/^why_/);
    expect(input).toHaveValue('A typed why.');
  });

  it('is silent when nothing arrived overnight', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([]);

    renderDetail();

    expect(await screen.findByLabelText('Title')).toHaveValue('NVIDIA');
    expect(screen.queryByRole('group', { name: 'Overnight agent line' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing (arrived|waiting|overnight)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/morning inbox/i)).not.toBeInTheDocument();
  });

  it('stays silent when overnight arrived but does not answer this sentence', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([{
      _id: 'event-leftover',
      affectedPageIds: ['wiki-nvidia'],
      title: 'A 13F filing was posted',
      summary: 'Positions were rebalanced across the sector.',
      createdAt: '2026-08-14T04:00:00.000Z'
    }]);

    renderDetail();

    expect(await screen.findByLabelText('Title')).toHaveValue('NVIDIA');
    expect(screen.queryByRole('group', { name: 'Overnight agent line' })).not.toBeInTheDocument();
    expect(screen.queryByText(/13F/)).not.toBeInTheDocument();
  });
});

describe('the agent rail', () => {
  const askInRail = async (question) => {
    const rail = await screen.findByRole('complementary', { name: 'Skeptical partner' });
    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence or counterevidence'), {
      target: { value: question }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));
    return rail;
  };

  it('keeps exact Library evidence in the column and leaves the rail for explicit questions', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    getJudgmentLibraryEvidence.mockResolvedValue({
      claim: 'NVIDIA demand still outruns deliverable capacity.',
      terms: ['demand', 'capacity'],
      candidates: [{
        id: 'highlight:a1:h1',
        text: 'Demand has compounded faster than available supply.',
        sourceLabel: 'On compute · FT'
      }]
    });

    renderDetail();
    const inbox = await screen.findByRole('region', { name: 'On this sentence' });
    expect(within(inbox).getByText('Demand has compounded faster than available supply.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Find the strongest passage/ })).not.toBeInTheDocument();
    expect(streamChatWithAgent).not.toHaveBeenCalled();
  });

  it('names where a retrieved line came from, and says so when nothing did', async () => {
    // A retrieved sentence with no source is an assertion. The whole contract
    // is that the agent retrieves rather than knows, so provenance is part of
    // the line — and its absence is worth saying out loud.
    getWikiPage.mockResolvedValue(judgmentPage());
    streamChatWithAgent.mockResolvedValue({
      reply: 'Supply is catching up faster than the thesis assumes.',
      relatedItems: [{ itemType: 'wiki_page', itemId: 'src-1', title: 'SemiAnalysis' }]
    });

    renderDetail();
    const rail = await askInRail('What cuts against this claim?');
    expect(await within(rail).findByText('From SemiAnalysis')).toBeInTheDocument();
  });

  it('does not invent additional candidates when the durable reply contains one answer', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    streamChatWithAgent.mockResolvedValue({ reply: 'Supply is catching up faster than the thesis assumes.' });

    renderDetail();
    const rail = await askInRail('What cuts against this claim?');
    expect(await within(rail).findByText('Supply is catching up faster than the thesis assumes.')).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Another' })).not.toBeInTheDocument();
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('is about the claim, and says so before anything is retrieved', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    const rail = await screen.findByRole('complementary', { name: 'Skeptical partner' });
    expect(within(rail).getByText('Skeptical partner')).toBeInTheDocument();
    expect(await within(rail).findByText('NVIDIA demand still outruns deliverable capacity.')).toBeInTheDocument();
    expect(within(rail).getByText('Nothing to retrieve until you ask.')).toBeInTheDocument();
    expect(within(rail).getByPlaceholderText('Bring evidence or counterevidence')).toBeInTheDocument();
    expect(within(rail).getByText('Retrieves. You accept.')).toBeInTheDocument();
  });

  it('writes a rail answer only when the human accepts it', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    streamChatWithAgent.mockResolvedValue(articleReply('Supply is catching up faster than the thesis assumes.'));
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();
    const rail = await askInRail('What cuts against this claim?');
    expect(await within(rail).findByText('Supply is catching up faster than the thesis assumes.')).toBeInTheDocument();
    // The retrieved line is in the rail, not the column, and nothing is saved.
    expect(updateWikiPage).not.toHaveBeenCalled();

    fireEvent.click(within(rail).getByRole('button', { name: 'Accept' }));
    fireEvent.click(await within(rail).findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.against.map(line => line.text)).toEqual([
      'Hyperscalers are designing more in-house silicon.',
      'Supply is catching up faster than the thesis assumes.'
    ]);
  });

  it('asks in the human’s own words and lets them choose the field', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    streamChatWithAgent.mockResolvedValue(articleReply('Packaging capacity is still the binding constraint.'));
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    const rail = await screen.findByRole('complementary', { name: 'Skeptical partner' });
    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence or counterevidence'), {
      target: { value: 'what did packaging do' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));

    await within(rail).findByText('Packaging capacity is still the binding constraint.');
    expect(streamChatWithAgent).toHaveBeenCalledWith(expect.objectContaining({
      message: 'what did packaging do',
      persistThread: true,
      context: expect.objectContaining({ type: 'wiki_page', id: 'wiki-nvidia', pageId: 'wiki-nvidia' })
    }), expect.any(Object));

    fireEvent.click(within(rail).getByRole('button', { name: 'Accept' }));
    fireEvent.click(await within(rail).findByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.why).toHaveLength(3);
  });

  it('dismisses a retrieved line without writing anything', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    streamChatWithAgent.mockResolvedValue(articleReply('A line the human does not want.'));

    renderDetail();
    const rail = await askInRail('What cuts against this claim?');
    await within(rail).findByText('A line the human does not want.');

    fireEvent.click(within(rail).getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(within(rail).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument());
    expect(within(rail).getByText('A line the human does not want.')).toBeInTheDocument();
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('writes a judgment down without asking the server for a governing question', async () => {
    // The claim is what makes a page a judgment. Sending `kind` as well made
    // the server require a governing question — judgment pages in their older
    // shape are a question being investigated — and refuse the whole thing
    // with a 400. This is the shipped bug that test did not exist to catch.
    const { createWikiPage, updateWikiPage } = require('../api/wiki');
    jest.spyOn(router, 'useParams').mockReturnValue({});
    listWikiPages.mockResolvedValue([]);
    createWikiPage.mockResolvedValue({ _id: 'wiki-new' });
    updateWikiPage.mockResolvedValue({});

    render(<Judgment />);
    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.judgment__new')).toHaveClass('is-alone'));

    fireEvent.change(screen.getByLabelText('Hold a sentence'), {
      target: { value: 'Demand still outruns deliverable capacity.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hold it' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    expect(createWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Demand still outruns deliverable capacity.' })
    );
    const [, payload] = updateWikiPage.mock.calls[0];
    expect(payload.judgment.currentJudgment).toBe('Demand still outruns deliverable capacity.');
    expect(payload.judgment.kind).toBeUndefined();
    const content = within(document.querySelector('.judgment-room__content'));
    expect(await content.findByRole('link', { name: 'Demand still outruns deliverable capacity.' }))
      .toHaveAttribute('href', '/judgment/wiki-new');
    expect(content.getByText('held · today')).toBeInTheDocument();
    expect(content.getByText('Noted. I’ll look for what cuts against it.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Hold a sentence')).toHaveValue(''));
  });

  it('slides an existing hold forward instead of writing a second copy', async () => {
    const { createWikiPage, updateWikiPage } = require('../api/wiki');
    jest.spyOn(router, 'useParams').mockReturnValue({});
    listWikiPages.mockResolvedValue([judgmentPage()]);
    createWikiPage.mockResolvedValue({
      _id: 'wiki-nvidia',
      reusedExisting: true,
      judgment: {
        currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
        startedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    render(<Judgment />);
    const content = within(document.querySelector('.judgment-room__content'));
    expect(await content.findByRole('link', { name: 'NVIDIA' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Hold a sentence'), {
      target: { value: 'NVIDIA demand still outruns deliverable capacity.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hold it' }));

    await waitFor(() => expect(createWikiPage).toHaveBeenCalled());
    expect(updateWikiPage).not.toHaveBeenCalled();
    await waitFor(() => expect(content.getByRole('link', { name: 'NVIDIA' }).closest('li')).toHaveClass('is-forward'));
    expect(content.getByRole('link', { name: 'NVIDIA' }).closest('li'))
      .toHaveTextContent('You already hold this — 21 days.');
    expect(content.queryByText(/Noted\. I’ll look for what cuts against it/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Hold a sentence')).toHaveValue(''));
  });

  /* The index needs one sentence and a provenance line per judgment. Asking
     for whole pages pulled every body and every ledger in the corpus down the
     wire to throw almost all of it away, which is why this page took minutes
     to open on a real library. */
  it('asks for the Judgment projection, not every page in full', async () => {
    jest.spyOn(router, 'useParams').mockReturnValue({});
    listWikiPages.mockResolvedValue([]);
    render(<Judgment />);
    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(listWikiPages).toHaveBeenCalledWith(expect.objectContaining({ projection: 'judgment' }));
  });

});

describe('Evidence from the library', () => {
  const candidate = {
    id: 'highlight:a1:h1',
    kind: 'highlight',
    text: 'Deliverable capacity lags demand by roughly two years.',
    sourceLabel: 'On compute · FT',
    whyThisSource: 'Answers 3 of 5 key terms · demand · deliverable · capacity'
  };

  beforeEach(() => {
    getWikiPage.mockResolvedValue(judgmentPage());
  });

  it('opens the prior without waiting on the library inbox', async () => {
    let resolveEvidence;
    getJudgmentLibraryEvidence.mockImplementation(() => new Promise((resolve) => {
      resolveEvidence = resolve;
    }));

    renderDetail();

    expect(await screen.findByLabelText('Title')).toHaveValue('NVIDIA');
    expect(screen.getByLabelText('Why do you believe it?')).toBeInTheDocument();
    expect(screen.queryByText(candidate.text)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Look in your library →' })).not.toBeInTheDocument();

    await act(async () => {
      resolveEvidence({ claim: 'c', terms: ['capacity'], candidates: [candidate] });
    });
    expect(await screen.findByText(candidate.text)).toBeInTheDocument();
  });

  it('shows library passages in the composer without a door', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });

    renderDetail();

    expect(await screen.findByText(candidate.text)).toBeInTheDocument();
    expect(getJudgmentLibraryEvidence).toHaveBeenCalledWith('wiki-nvidia');
    expect(screen.queryByRole('button', { name: 'Look in your library →' })).not.toBeInTheDocument();
    expect(screen.queryByText('File under')).not.toBeInTheDocument();
    expect(screen.queryByText('On compute · FT')).not.toBeInTheDocument();
    const inbox = screen.getByRole('region', { name: 'On this sentence' });
    expect(inbox).toHaveClass('judgment-slip');
    expect(within(inbox).getByRole('button', { name: 'Why' })).toBeInTheDocument();
    expect(within(inbox).getByRole('button', { name: 'Against' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Why' })).toBeChecked();
  });

  it('files an inbox line under Why, and the line leaves the inbox for the log', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));

    renderDetail();
    const inbox = await screen.findByRole('region', { name: 'On this sentence' });
    fireEvent.click(within(inbox).getByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    const filed = body.judgment.why[body.judgment.why.length - 1];
    expect(filed).toMatchObject({
      text: candidate.text,
      sourceLabel: 'On compute · FT',
      acceptedFrom: 'highlight:a1:h1'
    });
    expect(filed.createdAt).toEqual(expect.any(String));
    expect(await screen.findByRole('link', { name: 'Source 3: On compute · FT' }))
      .toHaveAttribute('href', '/library?articleId=a1&highlightId=h1');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'On this sentence' })).not.toBeInTheDocument();
    });
  });

  it('flies the inbox passage into the arriving log row instead of evaporating and popping', async () => {
    const animate = jest.fn(() => ({ finished: Promise.resolve() }));
    const realGetRect = Element.prototype.getBoundingClientRect;
    Element.prototype.animate = animate;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList?.contains('judgment-inbox__text')) {
        return { top: 120, left: 40, width: 280, height: 36, bottom: 156, right: 320 };
      }
      if (this.classList?.contains('judgment-log__text')) {
        return { top: 420, left: 80, width: 560, height: 40, bottom: 460, right: 640 };
      }
      return { top: 0, left: 0, width: 120, height: 20, bottom: 20, right: 120 };
    };
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));

    try {
      renderDetail();
      const inbox = await screen.findByRole('region', { name: 'On this sentence' });
      fireEvent.click(within(inbox).getByRole('button', { name: 'Why' }));

      await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
      expect(document.querySelector('.judgment-inbox__line')).toHaveClass('is-leaving');
      await waitFor(() => expect(animate).toHaveBeenCalled());
      const [frames] = animate.mock.calls[0];
      expect(frames[0].transform).toBe('translate3d(-40px, -300px, 0) scale(0.5)');
      expect(frames[1].transform).toBe('translate3d(0, 0, 0) scale(1)');
      const arrived = [...document.querySelectorAll('.judgment-log__row')]
        .find(row => row.textContent.includes(candidate.text));
      expect(arrived).toBeTruthy();
      expect(arrived).not.toHaveClass('is-arriving');
    } finally {
      delete Element.prototype.animate;
      Element.prototype.getBoundingClientRect = realGetRect;
    }
  });

  it('sets the filed passage in place when motion is reduced', async () => {
    const originalMatchMedia = window.matchMedia;
    const animate = jest.fn(() => ({ finished: Promise.resolve() }));
    Element.prototype.animate = animate;
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener() {},
      removeEventListener() {}
    }));
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));

    try {
      renderDetail();
      const inbox = await screen.findByRole('region', { name: 'On this sentence' });
      fireEvent.click(within(inbox).getByRole('button', { name: 'Why' }));
      await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
      const arrived = [...document.querySelectorAll('.judgment-log__row')]
        .find(row => row.textContent.includes(candidate.text));
      expect(arrived).toBeTruthy();
      expect(animate).not.toHaveBeenCalled();
    } finally {
      delete Element.prototype.animate;
      window.matchMedia = originalMatchMedia;
    }
  });

  it('files the passage itself once Why is selected on the rail', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));

    renderDetail();
    await screen.findByText(candidate.text);
    fireEvent.click(screen.getByRole('radio', { name: 'Why' }));
    fireEvent.click(screen.getByRole('button', { name: candidate.text }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.why.at(-1).text).toBe(candidate.text);
  });

  it('stays silent when the library has nothing to say', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [] });
    renderDetail();
    await screen.findByLabelText('Title');
    await waitFor(() => expect(getJudgmentLibraryEvidence).toHaveBeenCalled());
    expect(screen.queryByText(/Nothing you have saved speaks to this yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'On this sentence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Look in your library →' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Why do you believe it?')).toBeInTheDocument();
  });

  it('reports a failed library prefetch through system status, not a toast or the case', async () => {
    const controls = {
      setBackgroundWork: jest.fn(),
      setLatestReceipt: jest.fn(),
      clearRecentReceipts: jest.fn(),
      setRecoverableFailure: jest.fn(),
      clearRecoverableFailure: jest.fn(),
      resetSystemStatus: jest.fn()
    };
    getJudgmentLibraryEvidence.mockRejectedValue(new Error('library down'));
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetailWithStatus(controls);

    expect(await screen.findByLabelText('Title')).toHaveValue('NVIDIA');
    await waitFor(() => expect(controls.setRecoverableFailure).toHaveBeenCalled());
    expect(controls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'Library evidence',
      retryable: true
    }));
    expect(controls.setLatestReceipt).not.toHaveBeenCalled();
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/toast/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Why do you believe it?')).toBeInTheDocument();
  });

  it('does not announce a quiet library read in system status', async () => {
    const controls = {
      setBackgroundWork: jest.fn(),
      setLatestReceipt: jest.fn(),
      clearRecentReceipts: jest.fn(),
      setRecoverableFailure: jest.fn(),
      clearRecoverableFailure: jest.fn(),
      resetSystemStatus: jest.fn()
    };
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [] });
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetailWithStatus(controls);

    await screen.findByLabelText('Title');
    await waitFor(() => expect(getJudgmentLibraryEvidence).toHaveBeenCalled());
    expect(controls.setBackgroundWork).not.toHaveBeenCalled();
    expect(controls.setRecoverableFailure).not.toHaveBeenCalled();
    expect(controls.setLatestReceipt).not.toHaveBeenCalled();
  });

  it('keeps a long inbox to a few lines, with more…', async () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      id: `highlight:a1:h${index}`,
      text: `Passage ${index}: deliverable capacity still lags demand.`,
      sourceLabel: 'FT'
    }));
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: many });

    renderDetail();
    expect(await screen.findByText('Passage 0: deliverable capacity still lags demand.')).toBeInTheDocument();
    expect(screen.queryByText('Passage 3: deliverable capacity still lags demand.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'more…' }));
    expect(screen.getByText('Passage 3: deliverable capacity still lags demand.')).toBeInTheDocument();
  });

  it('whispers a source that already speaks in the log', async () => {
    const kinCandidate = {
      id: 'highlight:a9:h9',
      text: 'Deliverable capacity still lags demand on the SemiAnalysis thread.',
      sourceLabel: 'SemiAnalysis'
    };
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: [], candidates: [kinCandidate] });

    renderDetail();
    fireEvent.mouseEnter(await screen.findByText(kinCandidate.text));
    expect(screen.getByText('SemiAnalysis · 2 lines')).toBeInTheDocument();
    expect(document.querySelector('.judgment-log')).toHaveClass('is-listening');
  });

  it('keeps the arrived log row in the same kinship as [n] hover', async () => {
    const kinCandidate = {
      id: 'highlight:a9:h9',
      text: 'Deliverable capacity still lags demand on the SemiAnalysis thread.',
      sourceLabel: 'SemiAnalysis'
    };
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: [], candidates: [kinCandidate] });
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));

    renderDetail();
    const inbox = await screen.findByRole('region', { name: 'On this sentence' });
    fireEvent.click(within(inbox).getByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const arrived = await screen.findByText(kinCandidate.text);
    const semi = screen.getAllByRole('link', { name: 'Source 1: SemiAnalysis' })[0];
    fireEvent.mouseEnter(semi);
    expect(arrived.closest('.judgment-log__row')).toHaveClass('is-kin');
    expect(document.querySelector('.judgment-log')).toHaveClass('is-listening');
  });

  it('lights other log rows from the same week when you hover a date', async () => {
    const dated = judgmentPage();
    dated.judgment.why[0].createdAt = '2026-08-10T12:00:00.000Z';
    dated.judgment.why[1].createdAt = '2026-08-14T12:00:00.000Z';
    dated.judgment.against[0].createdAt = '2026-08-01T12:00:00.000Z';
    getWikiPage.mockResolvedValue(dated);

    renderDetail();
    const stamp = await screen.findByText((_, node) => (
      node?.tagName === 'TIME' && node.getAttribute('dateTime') === '2026-08-10T12:00:00.000Z'
    ));
    fireEvent.mouseEnter(stamp);

    expect(document.querySelector('.judgment-log')).toHaveClass('is-listening');
    expect(screen.getByText('AI demand keeps compounding faster than new supply.').closest('.judgment-log__row')).toHaveClass('is-kin');
    expect(screen.getByText('Lead times and power constrain what can be delivered.').closest('.judgment-log__row')).toHaveClass('is-kin');
    expect(screen.getByText('Hyperscalers are designing more in-house silicon.').closest('.judgment-log__row')).not.toHaveClass('is-kin');
  });

  it('lights Why on the rail from the inbox line', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });

    renderDetail();
    const inbox = await screen.findByRole('region', { name: 'On this sentence' });
    fireEvent.click(screen.getByRole('radio', { name: 'Against' }));
    expect(screen.getByRole('radio', { name: 'Against' })).toBeChecked();
    fireEvent.mouseEnter(within(inbox).getByRole('button', { name: 'Why' }));
    expect(screen.getByRole('radio', { name: 'Why' })).toHaveAttribute('data-hint', 'true');
  });

  it('shows why the server selected a candidate', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({
      claim: 'c',
      terms: ['capacity', 'nvidia'],
      candidates: [candidate]
    });

    renderDetail();
    const inbox = await screen.findByRole('region', { name: 'On this sentence' });
    expect(within(inbox).getByText(candidate.text)).toBeInTheDocument();
    expect(inbox.querySelector('.judgment-inbox__hold')).toHaveTextContent('demand');
    expect(inbox.querySelector('.judgment-inbox__hold')).toHaveTextContent('deliverable');
    expect(inbox.querySelector('.judgment-inbox__hold')).toHaveTextContent('capacity');
    expect(inbox.querySelector('.judgment-inbox__hold')).not.toHaveTextContent(/score|strongest/i);
  });

  it('looks again in the library when the held sentence is revised', async () => {
    const nextHold = 'Rates still matter for asset prices.';
    const nextCandidate = {
      id: 'highlight:a2:h2',
      kind: 'highlight',
      text: 'Rates still matter for long-duration asset prices.',
      sourceLabel: 'On duration · FT'
    };
    getJudgmentLibraryEvidence
      .mockResolvedValueOnce({ claim: 'c', terms: ['capacity'], candidates: [candidate] })
      .mockResolvedValueOnce({ claim: 'c', terms: ['rates', 'asset'], candidates: [nextCandidate] });
    resolveJudgmentChange.mockResolvedValue({
      page: {
        ...judgmentPage(),
        judgment: { ...judgmentPage().judgment, currentJudgment: nextHold }
      },
      proposal: { ...judgmentChangeProposal(nextHold), status: 'accepted' }
    });

    renderDetail();
    expect(await screen.findByText(candidate.text)).toBeInTheDocument();
    expect(getJudgmentLibraryEvidence).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('What you hold'), { target: { value: nextHold } });
    fireEvent.blur(screen.getByLabelText('What you hold'));

    await screen.findByRole('button', { name: 'Accept' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(resolveJudgmentChange).toHaveBeenCalled());
    await waitFor(() => expect(getJudgmentLibraryEvidence).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(nextCandidate.text)).toBeInTheDocument();
    expect(screen.queryByText(candidate.text)).not.toBeInTheDocument();
    expect(screen.queryByText(/toast/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'On this sentence' })).toBeInTheDocument();
  });

  it('files a library passage as Why on a hold that is not a company, and keeps the passage after reload', async () => {
    const hold = 'Hire Maya as the first engineer.';
    const passage = {
      id: 'highlight:note-1:h-maya',
      kind: 'highlight',
      text: 'Maya is the engineer I would hire first.',
      sourceLabel: 'Hiring notes'
    };
    const hirePage = {
      _id: 'wiki-hire',
      title: hold,
      sourceRefs: [],
      judgment: { currentJudgment: hold, why: [], against: [] }
    };
    let saved = hirePage;
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'wiki-hire' });
    getWikiPage.mockImplementation(async () => saved);
    getJudgmentLibraryEvidence
      .mockResolvedValueOnce({ claim: hold, terms: ['hire', 'maya', 'first', 'engineer'], candidates: [passage] })
      .mockResolvedValue({ claim: hold, terms: ['hire', 'maya', 'first', 'engineer'], candidates: [] });
    updateWikiPage.mockImplementation(async (_id, body) => {
      saved = { ...hirePage, judgment: body.judgment };
      return saved;
    });

    const first = render(withRail(<Judgment />));
    const inbox = await screen.findByRole('region', { name: 'On this sentence' });
    expect(within(inbox).getByText(passage.text)).toBeInTheDocument();
    fireEvent.click(within(inbox).getByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.why.at(-1)).toMatchObject({
      text: passage.text,
      sourceLabel: 'Hiring notes',
      acceptedFrom: 'highlight:note-1:h-maya'
    });
    expect(await screen.findByRole('link', { name: 'Source 1: Hiring notes' }))
      .toHaveAttribute('href', '/library?articleId=note-1&highlightId=h-maya');

    first.unmount();
    render(withRail(<Judgment />));

    expect(await screen.findByText(passage.text)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source 1: Hiring notes' }))
      .toHaveAttribute('href', '/library?articleId=note-1&highlightId=h-maya');
    expect(screen.queryByRole('region', { name: 'On this sentence' })).not.toBeInTheDocument();
    expect(screen.queryByText(/NVIDIA|ticker|10-K/i)).not.toBeInTheDocument();
  });

  it('keeps the passage door on first paint from the casebook list', async () => {
    const hold = 'Hire Maya as the first engineer.';
    const listed = {
      _id: 'wiki-hire',
      title: hold,
      judgment: {
        currentJudgment: hold,
        why: [{
          reasonId: 'why_1',
          text: 'Maya is the engineer I would hire first.',
          sourceLabel: 'Hiring notes',
          acceptedFrom: 'highlight:note-1:h-maya',
          createdAt: '2026-08-29T12:00:00.000Z'
        }],
        against: []
      }
    };
    let resolvePage;
    getWikiPage.mockImplementation(() => new Promise((resolve) => { resolvePage = resolve; }));
    listWikiPages.mockResolvedValue([listed]);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: hold, terms: [], candidates: [] });
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'wiki-hire' });

    render(withRail(<Judgment />));

    expect(await screen.findByRole('link', { name: 'Source 1: Hiring notes' }))
      .toHaveAttribute('href', '/library?articleId=note-1&highlightId=h-maya');
    expect(screen.getByText('Maya is the engineer I would hire first.')).toBeInTheDocument();

    await act(async () => {
      resolvePage(listed);
    });
  });
});

describe('Parking a judgment, and the lesson it leaves', () => {
  beforeEach(() => {
    getWikiPage.mockResolvedValue(judgmentPage());
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));
  });

  it('asks one question on the way out, and files the answer as a lesson', async () => {
    renderDetail();
    await screen.findByLabelText('Title');

    fireEvent.click(screen.getByRole('button', { name: 'Park this' }));
    fireEvent.change(screen.getByLabelText('What did holding this teach you?'), {
      target: { value: 'Announced capacity is not delivered capacity.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Park it' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.status).toBe('parked');
    expect(body.judgment.lessons[0]).toMatchObject({
      text: 'Announced capacity is not delivered capacity.',
      closedAs: 'parked'
    });
    // Parking says nothing about whether the claim is true.
    expect(body.judgment.currentJudgment).toBe('NVIDIA demand still outruns deliverable capacity.');
  });

  it('lets you park without a lesson, because sometimes there is not one', async () => {
    renderDetail();
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Park this' }));
    fireEvent.click(screen.getByRole('button', { name: 'Park it' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.status).toBe('parked');
    expect(body.judgment.lessons).toEqual([]);
  });

  it('says a parked claim is still yours, and offers it back', async () => {
    const parked = judgmentPage();
    parked.judgment.status = 'parked';
    parked.judgment.lessons = [{ lessonId: 'l1', text: 'Power, not silicon.', closedAs: 'parked', at: '2026-08-01T00:00:00.000Z' }];
    getWikiPage.mockResolvedValue(parked);

    renderDetail();
    await screen.findByLabelText('Title');

    expect(screen.getByText(/It is still yours; you are just not tending it/)).toBeInTheDocument();
    // The lesson reads on the page it came from.
    expect(screen.getByRole('heading', { name: 'What it taught me' })).toBeInTheDocument();
    expect(screen.getByText('Power, not silicon.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pick it back up' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.status).toBe('monitoring');
    expect(body.judgment.parkedAt).toBeNull();
  });
});

describe('The index only raises its voice about what was avoided', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = days => new Date(Date.now() - days * DAY).toISOString();

  it('marks a claim whose arrived evidence has gone unread, and stays silent about the rest', async () => {
    const avoided = judgmentPage();
    avoided._id = 'wiki-avoided';
    avoided.updatedAt = daysAgo(200);
    avoided.judgment.lastReviewedAt = daysAgo(200);

    const quiet = judgmentPage();
    quiet._id = 'wiki-quiet';
    quiet.title = 'Rates';
    quiet.judgment.currentJudgment = 'Rates still matter for asset prices.';
    quiet.updatedAt = daysAgo(200);
    quiet.judgment.lastReviewedAt = daysAgo(200);

    listWikiPages.mockResolvedValue([avoided, quiet]);
    listWikiSourceEvents.mockResolvedValue([
      { _id: 'e1', affectedPageIds: ['wiki-avoided'], sourceUpdatedAt: daysAgo(40) }
    ]);

    renderIndex();

    const content = within(document.querySelector('.judgment-room__content'));
    await content.findByRole('link', { name: 'NVIDIA' });
    expect(screen.getByText('1 thing arrived about this and is unread')).toBeInTheDocument();

    // The quiet claim gets no mark at all. Nothing arrived; that is not a problem.
    const rows = content.getAllByRole('listitem');
    const quietRow = rows.find(row => row.textContent.includes('Rates still matter'));
    expect(quietRow).toHaveTextContent('Rates');
    expect(quietRow).toHaveTextContent('Rates still matter for asset prices.');
    expect(quietRow.querySelector('.judgment__index-note')).toBeNull();
  });

  it('reads the events alongside the pages rather than after them', async () => {
    listWikiPages.mockResolvedValue([]);
    listWikiSourceEvents.mockResolvedValue([]);
    renderIndex();
    await waitFor(() => expect(listWikiSourceEvents).toHaveBeenCalled());
    expect(listWikiSourceEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 40 }));
  });

  it('still lists the claims when the events cannot be read', async () => {
    listWikiPages.mockResolvedValue([judgmentPage()]);
    listWikiSourceEvents.mockRejectedValue(new Error('nope'));
    renderIndex();
    expect(await within(document.querySelector('.judgment-room__content'))
      .findByRole('link', { name: 'NVIDIA' })).toBeInTheDocument();
  });
});

describe('What a belief rests on', () => {
  const otherClaim = {
    _id: 'wiki-compute',
    title: 'Compute',
    judgment: { currentJudgment: 'Compute stays scarce.' }
  };

  beforeEach(() => {
    getWikiPage.mockResolvedValue(judgmentPage());
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));
  });

  it('records the edge and the reason, never inferring either', async () => {
    listWikiPages.mockResolvedValue([judgmentPage(), otherClaim]);
    renderDetail();
    await screen.findByLabelText('Title');

    expect(await screen.findByText('Nothing yet. A belief that stands on its own is fine.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Say what this rests on' }));

    fireEvent.change(screen.getByLabelText('Which belief does this rest on?'), { target: { value: 'wiki-compute' } });
    fireEvent.change(screen.getByLabelText('Why?'), {
      target: { value: 'If compute stops being scarce this stops being true.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'It rests on that' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.dependsOn).toHaveLength(1);
    expect(body.judgment.dependsOn[0]).toMatchObject({
      pageId: 'wiki-compute',
      note: 'If compute stops being scarce this stops being true.',
      proposedBy: 'user'
    });
  });

  it('never offers the claim itself as something it rests on', async () => {
    listWikiPages.mockResolvedValue([judgmentPage(), otherClaim]);
    renderDetail();
    await screen.findByLabelText('Title');
    fireEvent.click(await screen.findByRole('button', { name: 'Say what this rests on' }));

    const select = screen.getByLabelText('Which belief does this rest on?');
    const options = Array.from(select.querySelectorAll('option')).map(option => option.value);
    expect(options).toContain('wiki-compute');
    expect(options).not.toContain('wiki-nvidia');
  });

  it('shows what would be shaken if this claim moved', async () => {
    const dependent = {
      _id: 'wiki-cw',
      title: 'CoreWeave',
      judgment: {
        currentJudgment: 'CoreWeave is undervalued.',
        dependsOn: [{ dependencyId: 'd1', pageId: 'wiki-nvidia', note: 'It prices the scarcity.' }]
      }
    };
    listWikiPages.mockResolvedValue([judgmentPage(), dependent]);
    renderDetail();
    await screen.findByLabelText('Title');

    expect(await screen.findByRole('heading', { name: 'What rests on this' })).toBeInTheDocument();
    expect(within(document.querySelector('.judgment-room__content'))
      .getByRole('link', { name: 'CoreWeave' }))
      .toHaveAttribute('href', '/judgment/wiki-cw');
    expect(screen.getByText('It prices the scarcity.')).toBeInTheDocument();
  });

  it('raises what rests on a claim before you park it, without touching them', async () => {
    const dependent = {
      _id: 'wiki-cw',
      title: 'CoreWeave',
      judgment: {
        currentJudgment: 'CoreWeave is undervalued.',
        dependsOn: [{ dependencyId: 'd1', pageId: 'wiki-nvidia', note: 'It prices the scarcity.' }]
      }
    };
    listWikiPages.mockResolvedValue([judgmentPage(), dependent]);
    renderDetail();
    await screen.findByLabelText('Title');

    fireEvent.click(await screen.findByRole('button', { name: 'Park this' }));
    expect(screen.getByText(/One belief rests on this/)).toBeInTheDocument();
    expect(screen.getByText(/Parking this does not change them/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Park it' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    // Only this page was written. The dependent claim is raised, never edited.
    expect(updateWikiPage.mock.calls.every(([id]) => id === 'wiki-nvidia')).toBe(true);
  });

  it('still reads the claim when the rest of the corpus cannot be loaded', async () => {
    listWikiPages.mockRejectedValue(new Error('nope'));
    renderDetail();
    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
  });
});

describe('The drift, above the claims', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = days => new Date(Date.now() - days * DAY).toISOString();
  const many = (topic, days, count) => Array.from({ length: count }, (_, i) => ({
    _id: `${topic}${days}${i}`, createdAt: daysAgo(days), folder: { _id: topic, name: topic }
  }));

  it('draws where the reading has been going, at the top of the index', async () => {
    const { getArticles } = require('../api/articles');
    getArticles.mockResolvedValue([...many('Capacity', 70, 5), ...many('Power', 4, 5)]);
    listWikiPages.mockResolvedValue([judgmentPage()]);

    renderIndex();

    expect(await screen.findByText('Where your reading is going')).toBeInTheDocument();
    // Above the claims it produced: this is the weather, not another claim.
    const drift = document.querySelector('.drift');
    const list = document.querySelector('.judgment__index');
    expect(drift.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still lists the claims when the reading cannot be read', async () => {
    const { getArticles } = require('../api/articles');
    getArticles.mockRejectedValue(new Error('nope'));
    listWikiPages.mockResolvedValue([judgmentPage()]);
    renderIndex();
    expect(await within(document.querySelector('.judgment-room__content'))
      .findByRole('link', { name: 'NVIDIA' })).toBeInTheDocument();
  });

  it('does not mistake a fast casebook for an empty reading history', async () => {
    const { getArticles } = require('../api/articles');
    let releaseReading;
    getArticles.mockReturnValue(new Promise((resolve) => { releaseReading = resolve; }));
    listWikiPages.mockResolvedValue([judgmentPage()]);

    renderIndex();

    expect(await within(document.querySelector('.judgment-room__content'))
      .findByRole('link', { name: 'NVIDIA' })).toBeInTheDocument();
    expect(screen.getByText('Reading back the last three months…')).toBeInTheDocument();
    expect(screen.queryByText(/file a little more/i)).not.toBeInTheDocument();

    await act(async () => { releaseReading([]); });
    expect(screen.queryByText('Reading back the last three months…')).not.toBeInTheDocument();
  });
});

describe('The index while it is still loading', () => {
  /* "No claims yet" appeared on every visit for the seconds the request took,
     to an account with a dozen claims. The software describing its own latency
     as a fact about the reader. */
  it('does not say you have no claims before it knows', async () => {
    let release;
    listWikiPages.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    listWikiSourceEvents.mockResolvedValue([]);

    renderIndex();

    expect(await screen.findByText('Reading back what you hold…')).toBeInTheDocument();
    expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hold a sentence')).toBeInTheDocument();

    await act(async () => { release([judgmentPage()]); });
    expect(await within(document.querySelector('.judgment-room__content'))
      .findByRole('link', { name: 'NVIDIA' })).toBeInTheDocument();
    expect(screen.queryByText('Reading back what you hold…')).not.toBeInTheDocument();
  });

  it('still offers the hold once it knows the index really is empty', async () => {
    listWikiPages.mockResolvedValue([]);
    listWikiSourceEvents.mockResolvedValue([]);
    renderIndex();
    expect(await screen.findByLabelText('Hold a sentence')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Reading back what you hold…')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /company case/i })).not.toBeInTheDocument();
  });
});
