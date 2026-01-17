const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1:8b-instruct';

const getConfig = () => ({
  host: process.env.OLLAMA_HOST || DEFAULT_HOST,
  model: process.env.OLLAMA_MODEL || DEFAULT_MODEL
});

const requestJson = async (url, payload) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama request failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
};

const generate = async ({ model, prompt, system, temperature, maxTokens }) => {
  const { host, model: defaultModel } = getConfig();
  if (!prompt) {
    throw new Error('Ollama generate requires a prompt.');
  }
  const payload = {
    model: model || defaultModel,
    prompt,
    stream: false
  };
  if (system) payload.system = system;
  if (typeof temperature === 'number') payload.temperature = temperature;
  if (typeof maxTokens === 'number') payload.num_predict = maxTokens;

  const data = await requestJson(`${host}/api/generate`, payload);
  if (!data || typeof data.response !== 'string') {
    throw new Error('Ollama response missing text.');
  }
  return data.response;
};

const checkHealth = async () => {
  const { host, model } = getConfig();
  const res = await fetch(`${host}/api/tags`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama health check failed (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  const hasModel = models.some(entry => entry?.name === model);
  return { model, available: hasModel, models };
};

module.exports = {
  generate,
  checkHealth
};
