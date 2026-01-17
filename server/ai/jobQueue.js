const queue = [];
let running = false;
const handlers = new Map();

const registerHandler = (type, handler) => {
  handlers.set(type, handler);
};

const drain = async () => {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const job = queue.shift();
    const handler = handlers.get(job.type);
    if (!handler) {
      console.error(`❌ No handler registered for job type "${job.type}"`);
      continue;
    }
    try {
      await handler(job.payload);
    } catch (error) {
      console.error(`❌ Job failed (${job.type}):`, error.message);
    }
  }
  running = false;
};

const enqueue = (type, payload) => {
  queue.push({ type, payload });
  setTimeout(drain, 0);
};

module.exports = {
  enqueue,
  registerHandler
};
