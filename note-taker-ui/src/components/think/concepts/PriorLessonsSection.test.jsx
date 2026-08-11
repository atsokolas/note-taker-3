import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PriorLessonsSection from './PriorLessonsSection';
import { adoptDecisionLessonEvidence, getConcepts } from '../../../api/concepts';

jest.mock('../../../api/concepts', () => ({
  adoptDecisionLessonEvidence: jest.fn(),
  getConcepts: jest.fn()
}));

const CONCEPT_ID = '64f100000000000000000020';
const OTHER_CONCEPT_ID = '64f100000000000000000021';
const PAGE_ID = '64f100000000000000000030';

const availableLesson = {
  id: 'decision_lesson_fixture',
  kind: 'decision_lesson',
  status: 'available_for_review',
  acceptedIntoConcept: false,
  suggestedRole: null,
  lesson: 'Utilization gains only stick when demand stays quiet.',
  result: 'mixed',
  observedAt: '2026-07-20T12:00:00.000Z',
  decision: { type: 'decision', id: 'decision-fixture', title: 'Cap inference spend' },
  observedEvidence: [
    { type: 'article', id: 'a1', title: 'Measured unit cost' }
  ],
  relevanceBasis: { type: 'explicit_wiki_investigation', pageId: PAGE_ID },
  provenance: {
    immutableSnapshotHash: 'a'.repeat(64),
    outcomeRecordHash: 'b'.repeat(64)
  }
};

const acceptedLesson = {
  ...availableLesson,
  id: 'decision_lesson_accepted',
  status: 'accepted',
  acceptedIntoConcept: true,
  acceptedRole: 'support',
  adoptionId: 'concept_decision_lesson_fixture',
  lesson: 'An already accepted lesson stays locked.',
  decision: { type: 'decision', id: 'decision-accepted', title: 'Already accepted decision' }
};

const renderSection = ({
  items = [availableLesson],
  evidence = { support: [], tension: [], context: [] },
  onAdopted = jest.fn()
} = {}) => render(
  <MemoryRouter>
    <PriorLessonsSection
      priorLessons={{
        status: items.length ? 'available' : 'none',
        acceptanceState: 'not_accepted_into_concept',
        items
      }}
      evidence={evidence}
      wikiPageId={PAGE_ID}
      onAdopted={onAdopted}
    />
  </MemoryRouter>
);

describe('PriorLessonsSection', () => {
  beforeEach(() => {
    adoptDecisionLessonEvidence.mockReset();
    getConcepts.mockReset();
    getConcepts.mockResolvedValue([
      {
        _id: CONCEPT_ID,
        name: 'Inference economics',
        continuityAnchor: { objectType: 'wiki_page', objectId: PAGE_ID }
      },
      {
        _id: OTHER_CONCEPT_ID,
        name: 'Demand absorption',
        continuityAnchor: { objectType: 'wiki_page', objectId: '64f100000000000000000031' }
      }
    ]);
    adoptDecisionLessonEvidence.mockResolvedValue({
      idempotent: false,
      adoption: {
        id: 'concept_decision_lesson_new',
        role: 'tension',
        provenance: { adoptionReceiptId: 'receipt-new' }
      },
      receipt: { id: 'receipt-new' }
    });
  });

  it('renders prior lessons and keeps Add as evidence off accepted rows', async () => {
    renderSection({ items: [availableLesson, acceptedLesson] });

    expect(await screen.findByTestId('concept-prior-lessons')).toBeInTheDocument();
    expect(screen.getByText('Prior lessons from this Wiki lineage')).toBeInTheDocument();
    expect(screen.getAllByText(availableLesson.lesson).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Add as evidence' })).toBeInTheDocument();

    const acceptedRow = screen.getByText('Already accepted decision').closest('li');
    expect(acceptedRow).toHaveClass('is-accepted');
    expect(within(acceptedRow).queryByRole('button', { name: 'Add as evidence' })).not.toBeInTheDocument();
    expect(within(acceptedRow).getByText('concept_decision_lesson_fixture')).toBeInTheDocument();
    expect(within(acceptedRow).getAllByText('Support').length).toBeGreaterThanOrEqual(1);
    expect(within(acceptedRow).getByText('Accepted role')).toBeInTheDocument();
    expect(within(acceptedRow).getByLabelText('Accepted lesson provenance'))
      .toHaveTextContent('Decision → Observed outcome → Support evidence');
  });

  it('does not preselect a role and requires confirmation before submit', async () => {
    const onAdopted = jest.fn();
    renderSection({ onAdopted });

    fireEvent.click(await screen.findByRole('button', { name: 'Add as evidence' }));

    expect(screen.getByRole('combobox', { name: 'Destination Concept' })).toHaveValue('');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    radios.forEach(radio => expect(radio).not.toBeChecked());

    expect(screen.getByRole('button', { name: 'Review confirmation' })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Destination Concept' }), {
      target: { value: CONCEPT_ID }
    });
    expect(screen.getByRole('button', { name: 'Review confirmation' })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Tension' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review confirmation' }));

    const confirm = screen.getByRole('region', { name: 'Confirm lesson adoption' });
    expect(within(confirm).getByText('Inference economics')).toBeInTheDocument();
    expect(within(confirm).getByText('Tension')).toBeInTheDocument();
    expect(within(confirm).getByText('Cap inference spend')).toBeInTheDocument();
    expect(within(confirm).getByText(availableLesson.lesson)).toBeInTheDocument();
    expect(within(confirm).getByText('Measured unit cost')).toBeInTheDocument();

    expect(adoptDecisionLessonEvidence).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm add as evidence' }));

    await waitFor(() => expect(adoptDecisionLessonEvidence).toHaveBeenCalledTimes(1));
    expect(adoptDecisionLessonEvidence).toHaveBeenCalledWith(CONCEPT_ID, {
      sourcePageId: PAGE_ID,
      decisionId: 'decision-fixture',
      lessonId: 'decision_lesson_fixture',
      role: 'tension',
      requestId: expect.any(String),
      expectedDecisionHash: 'a'.repeat(64),
      expectedOutcomeHash: 'b'.repeat(64)
    });
    const payload = adoptDecisionLessonEvidence.mock.calls[0][1];
    expect(Object.keys(payload).sort()).toEqual([
      'decisionId',
      'expectedDecisionHash',
      'expectedOutcomeHash',
      'lessonId',
      'requestId',
      'role',
      'sourcePageId'
    ].sort());
    expect(payload).not.toHaveProperty('lesson');
    expect(payload).not.toHaveProperty('observedEvidence');
    expect(payload).not.toHaveProperty('provenance');
    expect(onAdopted).toHaveBeenCalled();
  });

  it('shows a pending status while the adoption request is in flight', async () => {
    let resolveAdoption;
    adoptDecisionLessonEvidence.mockImplementationOnce(() => new Promise(resolve => {
      resolveAdoption = resolve;
    }));

    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Add as evidence' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination Concept' }), {
      target: { value: CONCEPT_ID }
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm add as evidence' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Accepting lesson as evidence');
    resolveAdoption({
      idempotent: false,
      adoption: { id: 'a1', role: 'support' },
      receipt: { id: 'r1' }
    });
    await waitFor(() => expect(screen.getByText(/Accepted into/i)).toBeInTheDocument());
  });

  it('surfaces stale_lesson, role_conflict, and generic failure with retry', async () => {
    adoptDecisionLessonEvidence.mockRejectedValueOnce({
      response: {
        data: {
          code: 'stale_lesson',
          error: 'The retained lesson changed after this evidence action was opened.'
        }
      }
    });

    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Add as evidence' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination Concept' }), {
      target: { value: CONCEPT_ID }
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Context' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm add as evidence' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed after this evidence action');

    adoptDecisionLessonEvidence.mockRejectedValueOnce({
      response: { data: { code: 'role_conflict', error: 'Conflicting role.' } }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicting role.');

    adoptDecisionLessonEvidence.mockRejectedValueOnce({
      response: { data: { error: 'Failed to accept retained lesson evidence.' } }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to accept retained lesson evidence.');
  });

  it('treats idempotent replay as success and refreshes', async () => {
    const onAdopted = jest.fn();
    adoptDecisionLessonEvidence.mockResolvedValueOnce({
      idempotent: true,
      adoption: { id: 'concept_decision_lesson_fixture', role: 'support' },
      receipt: { id: 'receipt-replay' }
    });

    renderSection({ onAdopted });
    fireEvent.click(await screen.findByRole('button', { name: 'Add as evidence' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination Concept' }), {
      target: { value: OTHER_CONCEPT_ID }
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm add as evidence' }));

    expect(await screen.findByText(/Already accepted/i)).toBeInTheDocument();
    expect(onAdopted).toHaveBeenCalledWith(
      expect.objectContaining({ idempotent: true }),
      expect.objectContaining({ destinationConceptId: OTHER_CONCEPT_ID })
    );
    expect(adoptDecisionLessonEvidence.mock.calls[0][0]).toBe(OTHER_CONCEPT_ID);
    expect(screen.getAllByText('Demand absorption').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Receipt: receipt-replay/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open destination Concept' })).toHaveAttribute(
      'href',
      expect.stringContaining(`conceptId=${OTHER_CONCEPT_ID}`)
    );
  });

  it('shows and retries destination Concept loading failures', async () => {
    getConcepts
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ _id: CONCEPT_ID, name: 'Inference economics' }]);

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load destination Concepts');
    fireEvent.click(screen.getByRole('button', { name: 'Retry destinations' }));
    await waitFor(() => expect(getConcepts).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Add as evidence' })).toBeInTheDocument();
  });

  it('shows adoption receipt on accepted rows from evidence provenance', async () => {
    renderSection({
      items: [acceptedLesson],
      evidence: {
        support: [{
          kind: 'decision_lesson',
          role: 'support',
          ref: { id: 'concept_decision_lesson_fixture', title: 'Lesson' },
          provenance: { adoptionReceiptId: 'concept-decision-lesson:v1:fixture' }
        }],
        tension: [],
        context: []
      }
    });

    expect(await screen.findByText('concept-decision-lesson:v1:fixture')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add as evidence' })).not.toBeInTheDocument();
  });
});
