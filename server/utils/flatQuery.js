/**
 * Every query field is one string or absent. Express's default parser turns
 * `?q=a&q=b` into a list and `?id[$gt]=` into an object, which routes then call
 * string methods on or hand to Mongo. Here a field sent twice is no field (as
 * OAuth requires of its parameters) and brackets are just characters.
 */
/** @param {string} search @returns {Record<string, string>} */
const flatQuery = (search) => {
  const query = Object.create(null);
  const seen = new Set();
  for (const [key, value] of new URLSearchParams(search)) {
    if (seen.has(key)) delete query[key];
    else query[key] = value;
    seen.add(key);
  }
  return query;
};

module.exports = { flatQuery };
