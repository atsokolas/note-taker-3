import { CONCEPT_ACTIONS, dispatchConceptAction } from './conceptActionDispatch';

describe('dispatchConceptAction', () => {
  const buildModelActions = () => ({
    runQuickAction: jest.fn(),
    snapshotHypothesis: jest.fn()
  });

  it('routes support and tension actions through explicit quick-action calls', () => {
    const modelActions = buildModelActions();

    dispatchConceptAction({ type: CONCEPT_ACTIONS.STRENGTHEN_DRAFT, modelActions });
    dispatchConceptAction({ type: CONCEPT_ACTIONS.PULL_SUPPORT, modelActions });
    dispatchConceptAction({ type: CONCEPT_ACTIONS.FIND_TENSION, modelActions });
    dispatchConceptAction({ type: CONCEPT_ACTIONS.PULL_RELATED_SOURCES, modelActions });
    dispatchConceptAction({ type: CONCEPT_ACTIONS.SURFACE_OPEN_QUESTIONS, modelActions });
    dispatchConceptAction({ type: CONCEPT_ACTIONS.PREPARE_UPDATE, modelActions });

    expect(modelActions.runQuickAction).toHaveBeenNthCalledWith(1, 'strengthen-hypothesis');
    expect(modelActions.runQuickAction).toHaveBeenNthCalledWith(2, 'find-supports');
    expect(modelActions.runQuickAction).toHaveBeenNthCalledWith(3, 'find-contradictions');
    expect(modelActions.runQuickAction).toHaveBeenNthCalledWith(4, 'retrieve-related-sources');
    expect(modelActions.runQuickAction).toHaveBeenNthCalledWith(5, 'suggest-open-questions');
    expect(modelActions.runQuickAction).toHaveBeenNthCalledWith(6, 'refresh-concept');
  });

  it('routes save-version through snapshotHypothesis', () => {
    const modelActions = buildModelActions();

    dispatchConceptAction({
      type: CONCEPT_ACTIONS.SAVE_VERSION,
      modelActions,
      payload: { summary: 'Saved from action test.' }
    });

    expect(modelActions.snapshotHypothesis).toHaveBeenCalledWith('Saved from action test.');
  });

  it('routes notebook draft creation through the provided notebook handler', () => {
    const modelActions = buildModelActions();
    const createNotebookDraft = jest.fn();

    dispatchConceptAction({
      type: CONCEPT_ACTIONS.CREATE_NOTEBOOK_DRAFT,
      modelActions,
      createNotebookDraft,
      payload: { destination: 'notebook' }
    });

    expect(createNotebookDraft).toHaveBeenCalledWith({ destination: 'notebook' });
  });

  it('routes concept handoff creation through the provided handoff handler', () => {
    const modelActions = buildModelActions();
    const createConceptHandoff = jest.fn();

    dispatchConceptAction({
      type: CONCEPT_ACTIONS.CREATE_AGENT_HANDOFF,
      modelActions,
      createConceptHandoff,
      payload: { requestedActorId: 'agent-1' }
    });

    expect(createConceptHandoff).toHaveBeenCalledWith({ requestedActorId: 'agent-1' });
  });

  it('throws for unsupported actions', () => {
    expect(() => dispatchConceptAction({
      type: 'unsupported',
      modelActions: buildModelActions()
    })).toThrow('Unsupported concept action: unsupported');
  });
});
