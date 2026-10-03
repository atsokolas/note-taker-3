// OAuth token responses are JSON; successful revocation may be plain "OK".
// Preserve HTTP status rather than turning a successful plain response into a
// parser exception that hides the subsequent token-denial assertion.
const readNoeisHttpResponse = async response => {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
};
module.exports = { readNoeisHttpResponse };
