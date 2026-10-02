const assert = require('assert');
const { generateNotebookWordingOptions } = require('./notebookWordingOptionsService');

const run = async () => {
  const result = await generateNotebookWordingOptions({
    passage: 'We might need to delay the launch.',
    generate: async () => JSON.stringify({
      options: [
        { wording: 'We need to delay the launch.', explanation: 'States the delay directly.' },
        { wording: 'Delay the launch.', explanation: 'Cuts the preamble and leads with the decision.' }
      ]
    })
  });
  assert.strictEqual(result.status, 'ready');
  assert.strictEqual(result.options.length, 2);
  console.log('notebookWordingOptionsService tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
