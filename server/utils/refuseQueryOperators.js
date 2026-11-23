/**
 * A JSON body can carry an object where the server expects a value:
 * `{"username": {"$ne": ""}}`. (The query string cannot: see flatQuery.)
 * Handed to Mongo, that object is read as a query operator instead of a value.
 * No client of this API sends a key that starts with `$`, so any request that
 * does is refused here, once, before any route can pass it on.
 */

const carriesOperator = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 32) return false;
  return Object.entries(value).some(([key, inner]) => key.startsWith('$') || carriesOperator(inner, depth + 1));
};

const refuseQueryOperators = (req, res, next) => {
  if (carriesOperator(req.body)) {
    return res.status(400).json({ error: 'Field names cannot start with $.' });
  }
  return next();
};

module.exports = { refuseQueryOperators };
