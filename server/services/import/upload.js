const multer = require('multer');

module.exports = multer({
  storage: multer.memoryStorage(),
  // Imports use flat metadata; indexed fields must never allocate sparse arrays.
  limits: { fileSize: 15 * 1024 * 1024, fieldArrayIndexLimit: 0 }
});
