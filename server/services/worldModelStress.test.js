const {
  WorldModelStressError,
  choosePosture,
  draftScenario,
  serializeOverlay
} = require('./worldModelStress');

const page = {
  title: 'Compute stays scarce',
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    decisionPosture: 'watch',
    assumptions: [{ id: 'a1', text: 'Lead times stay long.' }]
  }
};

describe('world-model stress tests', () => {
  it('names the turned assumption and labels generated ink', () => {
    const scenario = draftScenario({
      page,
      kind: 'alternative_future',
      generated: true,
      modifiedAssumptions: [{ id: 'a1', from: 'Lead times stay long.', to: 'Fabs arrive a year early.' }],
      proposedPosture: 'act'
    });
    expect(scenario.generated).toBe(true);
    expect(scenario.generatedLabel).toMatch(/Generated/);
    expect(scenario.modifiedAssumptions[0].to).toMatch(/Fabs arrive/);
    expect(scenario.uncertainty).toMatch(/Hypothetical/);
    const overlay = serializeOverlay([scenario], page);
    expect(overlay.live.claim).toMatch(/Compute stays scarce/);
    expect(overlay.sheets[0].line).toMatch(/tracing paper/);
    expect(JSON.stringify(overlay)).not.toMatch(/gauge|score|dashboard/i);
  });

  it('lets a human keep or change posture, and refuses an unnamed turn', () => {
    const scenario = draftScenario({
      modifiedAssumptions: [{ from: 'Lead times stay long.', to: 'Lead times collapse.' }]
    });
    expect(choosePosture(scenario, { choice: 'keep' }).liveChanged).toBe(false);
    expect(choosePosture(scenario, { choice: 'change' }).liveChanged).toBe(true);
    expect(() => choosePosture(scenario, { choice: 'auto' })).toThrow(WorldModelStressError);
    expect(() => draftScenario({ modifiedAssumptions: [] })).toThrow(/must name the assumption/);
  });
});
