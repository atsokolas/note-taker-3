const assert = require('assert');
const { deriveDraftSummary } = require('../agentArtifactDrafts');

const run = () => {
  const summary = deriveDraftSummary(`
# Summary Brief: World Models

## Core claim
World models compress experience into latent simulations.

## Best support in view
Planning only helps if the model keeps checking itself against the world.
`);

  assert.strictEqual(
    summary,
    'World models compress experience into latent simulations.',
    'Draft summaries should promote the first substantive line instead of the markdown heading.'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('agentArtifactDrafts tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
