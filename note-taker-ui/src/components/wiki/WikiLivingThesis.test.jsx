import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiLivingThesis from './WikiLivingThesis';
import { SystemStatusProvider } from '../../system/SystemStatusContext';
import { saveInitialWikiJudgment, updateWikiPage } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  restoreInitialWikiJudgment: jest.fn(),
  saveInitialWikiJudgment: jest.fn(),
  updateWikiPage: jest.fn()
}));

const controls = {
  setBackgroundWork: jest.fn(),
  setLatestReceipt: jest.fn(),
  setRecoverableFailure: jest.fn(),
  clearRecoverableFailure: jest.fn(),
  resetSystemStatus: jest.fn()
};

const thesisPage = {
  _id: 'qa-thesis',
  title: 'QA Demo — Living Thesis',
  judgment: {
    kind: 'thesis',
    governingQuestion: 'What evidence changes this QA-only view?',
    currentJudgment: '',
    confidence: null,
    status: 'framing',
    decisionPosture: 'investigate',
    causalModel: { summary: '', nodes: [], edges: [] },
    assumptions: [{ assumptionId: 'a-1', text: 'QA assumption', status: 'unreviewed' }],
    unknowns: [{ unknownId: 'u-1', question: 'QA unknown?', priority: 'critical', status: 'open' }],
    falsifiers: [{ falsifierId: 'f-1', text: 'QA falsifier', observableSignal: 'QA signal', status: 'unobserved' }],
    decisions: [{ decisionId: 'd-1', summary: 'QA research step', decisionType: 'research', status: 'planned' }]
  },
  claims: [{ claimId: 'c-1', text: 'QA claim', support: 'unsupported', epistemicStatus: 'established_fact', materiality: 'critical' }]
};

const renderThesis = (props = {}) => render(
  <SystemStatusProvider value={controls}>
    <WikiLivingThesis page={thesisPage} pageId="qa-thesis" onPageUpdate={jest.fn()} {...props} />
  </SystemStatusProvider>
);

describe('WikiLivingThesis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    updateWikiPage.mockResolvedValue(thesisPage);
    saveInitialWikiJudgment.mockResolvedValue({ page: { ...thesisPage, judgment: { ...thesisPage.judgment, initialRevisionId: 'revision-1' } } });
  });

  it('renders honest empty states and separates epistemic status from evidence support', () => {
    renderThesis();
    expect(screen.getByText('No current judgment recorded.')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('Not reviewed yet')).toBeInTheDocument();
    expect(screen.getByText('Not scheduled')).toBeInTheDocument();
    expect(screen.getByText(/Inconsistent: established fact without supporting evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Research · Planned · record only/i)).toBeInTheDocument();
  });

  it('saves the narrative causal model with reserved empty graph arrays', async () => {
    renderThesis();
    fireEvent.click(screen.getByRole('button', { name: 'Edit narrative' }));
    fireEvent.change(screen.getByLabelText('Causal narrative'), { target: { value: 'QA narrative causal model.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save narrative' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('qa-thesis', expect.objectContaining({
      judgment: expect.objectContaining({ causalModel: { summary: 'QA narrative causal model.', nodes: [], edges: [] } })
    })));
  });

  it('replaces primary read values in place and moves focus into the editor', async () => {
    renderThesis();
    const editTrigger = screen.getByRole('button', { name: 'Edit thesis' });
    fireEvent.click(editTrigger);

    const questionEditor = await screen.findByLabelText('Governing question');
    await waitFor(() => expect(questionEditor).toHaveFocus());
    expect(screen.queryByRole('heading', { name: thesisPage.judgment.governingQuestion })).not.toBeInTheDocument();
    expect(screen.queryByText('No current judgment recorded.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current judgment')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save initial judgment' })).toBeDisabled();
  });

  it('keeps one structured editor active and Escape cancels without a motion delay', async () => {
    renderThesis();
    fireEvent.click(screen.getByText('Assumptions'));
    const assumptionsTrigger = screen.getByRole('button', { name: 'Edit assumptions' });
    fireEvent.click(assumptionsTrigger);
    const assumptionEditor = await screen.findByLabelText('Assumption');
    await waitFor(() => expect(assumptionEditor).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Edit thesis' })).toBeDisabled();

    fireEvent.keyDown(screen.getByLabelText('Assumption'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Assumption')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit assumptions' })).toHaveFocus());
  });

  it('uses item-specific accessible labels for destructive row actions', () => {
    renderThesis();
    fireEvent.click(screen.getByText('Decisions'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit decisions' }));
    expect(screen.getByRole('button', { name: 'Remove decision 1' })).toBeInTheDocument();
  });

  it('confirms and saves the initial judgment exactly through the dedicated action', async () => {
    renderThesis();
    fireEvent.click(screen.getByRole('button', { name: 'Save initial judgment' }));
    await waitFor(() => expect(saveInitialWikiJudgment).toHaveBeenCalledWith('qa-thesis'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('does not prove the thesis'));
  });
});
