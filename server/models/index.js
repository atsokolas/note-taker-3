// Every model, one file per room.
module.exports = {
  ...require('./account'),
  ...require('./library'),
  ...require('./think'),
  ...require('./wiki'),
  ...require('./agents'),
  ...require('./editions'),
  ...require('./museum'),
  ...require('./imports'),
  ...require('./search')
};
