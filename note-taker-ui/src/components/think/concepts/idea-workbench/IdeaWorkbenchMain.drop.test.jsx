import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import IdeaWorkbenchMain from './IdeaWorkbenchMain';

let latestDndProps = null;

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, ...props }) => {
    latestDndProps = props;
    return (
      <div>
        <button type="button" onClick={() => props.onDragEnd?.({ active: { id: 'card-1' }, over: { id: 'hypothesis-editor' } })}>
          Drop to hypothesis text
        </button>
        <button type="button" onClick={() => props.onDragEnd?.({ active: { id: 'card-1' }, over: { id: 'supports' } })}>
          Drop to supports
        </button>
        {children}
      </div>
    );
  },
  DragOverlay: ({ children }) => <div>{children}</div>,
  useDroppable: () => ({ isOver: false, setNodeRef: jest.fn() })
}));

jest.mock('./IdeaWorkbenchCard', () => ({ card }) => (
  <div>{card.title}</div>
));

jest.mock('./IdeaWorkbenchHypothesisEditor', () => () => (
  <div>Hypothesis editor</div>
));

jest.mock('./IdeaWorkbenchConflictModal', () => () => null);

const createModel = () => ({
  state: {
    header: {
      label: 'Idea',
      title: 'Test concept',
      prompt: 'Prompt',
      stage: 'Seed'
    },
    cards: [
      {
        id: 'card-1',
        zone: 'workspace',
        type: 'Highlight',
        title: 'Dragged card',
        content: 'Some evidence'
      }
    ],
    hypothesis: {
      html: '<p>Draft</p>'
    },
    agent: {
      comments: [
        {
          id: 'comment-1',
          target: 'hypothesis',
          tone: 'support',
          kind: 'hypothesis-suggestion',
          title: 'Suggested revision kept separate',
          body: 'Try making the mechanism more explicit.',
          caption: 'Kept separate from your draft until you choose to use it.'
        }
      ]
    }
  },
  counts: {
    workspace: 1,
    supports: 0,
    contradictions: 0,
    questions: 0
  },
  importableCounts: {
    highlights: 0,
    notes: 0,
    snippets: 0,
    concepts: 0
  },
  hypothesisVersion: {
    label: 'v1',
    summary: ''
  },
  currentMaturity: 'Early',
  actions: {
    setHeaderField: jest.fn(),
    importMaterialCard: jest.fn(),
    moveCard: jest.fn(),
    deleteCard: jest.fn(),
    tagCard: jest.fn(),
    updateHypothesisHtml: jest.fn(),
    acceptAgentComment: jest.fn(),
    dismissAgentComment: jest.fn(),
    snapshotHypothesis: jest.fn(),
    runQuickAction: jest.fn(),
    insertCardIntoHypothesis: jest.fn()
  }
});

describe('IdeaWorkbenchMain drag drop routing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('routes card drops into the hypothesis editor and evidence zones', () => {
    const model = createModel();
    render(<IdeaWorkbenchMain model={model} utilityActions={{}} />);

    expect(latestDndProps).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Drop to hypothesis text' }));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(model.actions.insertCardIntoHypothesis).toHaveBeenCalledWith('card-1', { removeCard: true });

    fireEvent.click(screen.getByRole('button', { name: 'Drop to supports' }));
    expect(model.actions.moveCard).toHaveBeenCalledWith('card-1', 'supports');
  });

  it('lets the user accept or dismiss an agent proposal', () => {
    const model = createModel();
    render(<IdeaWorkbenchMain model={model} utilityActions={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Blend into draft' }));
    expect(model.actions.acceptAgentComment).toHaveBeenCalledWith('comment-1');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(model.actions.dismissAgentComment).toHaveBeenCalledWith('comment-1');
  });
});
