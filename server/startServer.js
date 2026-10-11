const startServer = ({ app, port }) => {
  const HOST = process.env.HOST || '0.0.0.0';
  return app.listen(port, HOST, () => {
    console.log(`🚀 Server running on ${HOST}:${port}`);
  });
};

module.exports = {
  startServer
};
