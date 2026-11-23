const { z } = require('zod');

/**
 * A route says the shape of what it reads, and a request of another shape is
 * refused with a 400 naming the field before the handler runs. It checks and
 * never rewrites: the handler reads req.body exactly as it arrived, extra
 * fields included, so a shape can be added to a route without changing it.
 *
 *   router.post('/api/notes', auth, shaped({ body: z.object({ title: z.string() }) }), handler)
 */

const NOUNS = { string: 'text', number: 'a number', boolean: 'true or false', array: 'a list', object: 'an object', date: 'a date' };

const sayIssue = (issue, part) => {
  const field = issue.path.join('.') || part;
  if (issue.code === 'invalid_type') return `${field} must be ${NOUNS[issue.expected] || issue.expected}.`;
  if (issue.code === 'too_big' && issue.type === 'string') return `${field} must be at most ${issue.maximum} characters.`;
  if (issue.code === 'too_big' && issue.type === 'array') return `${field} must have at most ${issue.maximum} entries.`;
  return `${field}: ${issue.message}`;
};

const shaped = shapes => (req, res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!shapes[part]) continue;
    const result = shapes[part].safeParse(req[part] ?? {});
    if (!result.success) return res.status(400).json({ error: sayIssue(result.error.issues[0], part) });
  }
  return next();
};

// Fields that arrive as JSON objects and nothing else.
const record = () => z.record(z.string(), z.unknown());

module.exports = { shaped, record, z };
