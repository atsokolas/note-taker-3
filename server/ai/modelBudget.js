const { AsyncLocalStorage } = require('node:async_hooks');

const HOUR_MS = 60 * 60 * 1000;

// Model calls cost money, so one account gets so many an hour however it asks:
// the sign-in marks whose request this is, and every call to a model spends from it.
// Work no request started (schedules, workers on their own) belongs to nobody and is not counted.
const buildModelBudget = ({ perHour = Number(process.env.AI_CALLS_PER_HOUR) || 300, now = Date.now } = {}) => {
  const account = new AsyncLocalStorage();
  const hours = new Map();

  const onBehalfOf = (userId, work) => account.run(userId, work);

  const spend = () => {
    const userId = account.getStore();
    if (!userId) return;
    const at = now();
    const hour = hours.get(userId);
    if (!hour || at - hour.start >= HOUR_MS) return void hours.set(userId, { start: at, calls: 1 });
    if (hour.calls >= perHour) throw Object.assign(new Error('That is a lot of asking for one hour. Try again a little later.'), { status: 429 });
    hour.calls += 1;
  };

  return { onBehalfOf, spend };
};

module.exports = { buildModelBudget, ...buildModelBudget() };
