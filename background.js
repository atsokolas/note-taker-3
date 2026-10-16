import { request } from './api.js';

/* The margin on a page asks Noeis through here, so the token never enters a
   page and every request shares the popup's rules. Only the extension's own
   scripts can send these messages. */
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== 'api') return false;
  request(message.path, message).then(
    data => reply({ ok: true, data }),
    error => reply({ ok: false, error: error.message })
  );
  return true;
});
