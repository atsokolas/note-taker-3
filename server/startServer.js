const startServer = ({
  app,
  port,
  parseAiServiceUrl,
  joinUrl
}) => {
  const HOST = process.env.HOST || '0.0.0.0';
  return app.listen(port, HOST, () => {
    console.log(`🚀 Server running on ${HOST}:${port}`);
    const { origin, hasPath } = parseAiServiceUrl(process.env.AI_SERVICE_URL || '');
    const synthUrl = origin ? joinUrl(origin, '/synthesize') : '';
    if (synthUrl) {
      console.log('AI upstream URL:', synthUrl);
    }
    if (hasPath) {
      console.warn('[AI-UPSTREAM] AI_SERVICE_URL includes a path; using origin only.');
    }
  });
};

module.exports = {
  startServer
};
