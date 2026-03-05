import tourReducer, {
  applyRemoteTourState,
  createInitialTourState,
  tourActionTypes
} from './tourReducer';

describe('tourReducer', () => {
  it('hydrates remote state shape', () => {
    const state = createInitialTourState();
    const remote = {
      status: 'in_progress',
      currentStepId: 'capture_first_highlight',
      completedStepIds: ['install_extension'],
      isFirstTimeVisitor: false,
      signals: {
        extensionConnected: true,
        firstHighlightCaptured: false,
        conceptFromHighlight: false,
        workspaceOrganized: false,
        semanticSearchUsed: false
      }
    };
    const next = applyRemoteTourState(state, remote, { preserveOpen: false, open: true });
    expect(next.loading).toBe(false);
    expect(next.open).toBe(true);
    expect(next.status).toBe('in_progress');
    expect(next.currentStepId).toBe('capture_first_highlight');
    expect(next.completedStepIds).toEqual(['install_extension']);
    expect(next.signals.extensionConnected).toBe(true);
  });

  it('handles local open state updates', () => {
    const start = createInitialTourState();
    const next = tourReducer(start, { type: tourActionTypes.SET_OPEN, payload: true });
    expect(next.open).toBe(true);
  });
});

