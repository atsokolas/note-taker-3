// Offline validation against canonical schemas retrieved 2026-10-03.
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const root = path.resolve(__dirname, '..');
const ajv = new Ajv2020({allErrors: true});
for (const name of ['plugin', 'mcp']) {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin-schemas', `${name}.schema.json`)));
  const validate = ajv.compile(schema);
  const data = JSON.parse(fs.readFileSync(path.join(root, 'plugins/noeis', `${name}.json`)));
  if (!validate(data)) throw new Error(JSON.stringify(validate.errors));
  console.log(`PASS canonical Agent Plugins 1.0.0 ${name} schema`);
}
console.log('OpenAI extension semantics and directory submission requirements are separate gates.');
