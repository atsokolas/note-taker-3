// Writing that arrives by email.
const {
  inboundMailConfig,
  verifyWebhookSignature,
  receivedMail,
  readerForMail,
  linkFromMail,
  newsletterFromMail
} = require('../../services/import/newsletterMail');

module.exports = (router, {
  Article,
  User,
  env,
  fetchImpl,
  ingestArticleSource,
  saveLink
}) => {
  /* Email-in. Every outcome but a forged signature answers 200, so the
     provider stops retrying mail that was never going to land. */
  router.post('/api/import/email', async (req, res) => {
    const config = inboundMailConfig(env);
    if (!config.enabled) return res.status(404).json({ error: 'Email-in is not configured.' });
    if (!verifyWebhookSignature({ secret: config.secret, headers: req.headers, rawBody: req.rawBody })) {
      return res.status(401).json({ error: 'Signature did not verify.' });
    }
    if (req.body?.type && req.body.type !== 'email.received') return res.status(200).json({ status: 'ignored' });
    try {
      const mail = await receivedMail(req.body, { apiKey: config.apiKey, fetchImpl });
      const reader = await readerForMail({ User, mail, inboundAddress: config.address });
      if (!reader) {
        console.log('[email-in] dropped: no account confirmed that address');
        return res.status(200).json({ status: 'dropped' });
      }
      /* A mail that is only a link, and maybe a line about it, is a link to
         read later: it goes on the nightstand with that line as its why. */
      const link = linkFromMail(mail);
      if (link) {
        const saved = await saveLink({ userId: reader._id, url: link.url, placement: 'later', reason: link.note.slice(0, 280) })
          .catch(error => (error.statusCode === 422 ? null : Promise.reject(error)));
        if (!saved) return res.status(200).json({ status: 'dropped' });
        return res.status(200).json({ status: saved.existing ? 'duplicate' : 'saved', articleId: saved.article._id });
      }
      const url = `email://${mail.messageId}`;
      if (await Article.exists({ userId: reader._id, url })) return res.status(200).json({ status: 'duplicate' });
      const piece = newsletterFromMail({ ...mail, readerEmail: reader.morningPaper.email });
      if (!piece.content) {
        console.log('[email-in] dropped: nothing readable');
        return res.status(200).json({ status: 'dropped' });
      }
      const { article } = await ingestArticleSource({
        userId: reader._id,
        title: piece.title,
        content: piece.content,
        url,
        author: piece.author,
        siteName: piece.siteName,
        publicationDate: piece.publicationDate,
        sourceUrl: piece.sourceUrl,
        provider: 'email',
        sourceType: 'article',
        sourceLabel: piece.siteName,
        externalId: mail.messageId
      });
      return res.status(200).json({ status: 'saved', articleId: article._id });
    } catch (error) {
      console.error('[email-in] failed:', error);
      return res.status(500).json({ error: 'Failed to save that mail.' });
    }
  });
};
