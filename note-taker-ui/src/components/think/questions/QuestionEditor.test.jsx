import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionEditor from './QuestionEditor';

jest.mock('../../../hooks/useHighlights', () => () => ({
  highlights: [],
  highlightMap: new Map(),
  loading: false,
  error: null
}));

jest.mock('../../return-queue/ReturnLaterControl', () => function ReturnLaterControl() {
  return <button type="button">Return later</button>;
});

jest.mock('../../agent/AgentSkillDock', () => function AgentSkillDock() {
  return <div data-testid="agent-skill-dock" />;
});

jest.mock('../notebook/InsertHighlightModal', () => function InsertHighlightModal() {
  return null;
});

describe('QuestionEditor', () => {
  it('preserves challenged claim evidence when initializing and saving a draft', () => {
    const onSave = jest.fn();
    const question = {
      _id: 'question-1',
      text: 'How strong is this claim?',
      blocks: [{
        id: 'claim-1',
        type: 'paragraph',
        text: 'Concentrated portfolios outperform when the underwriting is right.',
        evidence: [{ stance: 'support', title: 'Block-level support' }],
        challenge: {
          enabled: true,
          createdAt: '2026-06-01T12:00:00.000Z',
          note: 'Challenge this claim.',
          support: [{ title: 'Support one' }],
          counter: [{ title: 'Counter one' }]
        }
      }]
    };

    render(
      <QuestionEditor
        question={question}
        saving={false}
        error={null}
        onSave={onSave}
      />
    );

    expect(screen.getByLabelText('Claim evidence balance: 2 support / 1 counter')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [
        expect.objectContaining({
          id: 'claim-1',
          evidence: [{ stance: 'support', title: 'Block-level support' }],
          challenge: expect.objectContaining({
            enabled: true,
            support: [{ title: 'Support one' }],
            counter: [{ title: 'Counter one' }]
          })
        })
      ]
    }));
  });
});
