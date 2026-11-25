const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createDossierBuildRun, recordDossierBuildStage, finishDossierBuildRun } = require('./wikiDossierBuildReliabilityService');

/* A build declared dead stays dead: the worker that held it can neither keep
   writing stages nor mark it completed over the failure. */
test('real Mongo: a worker that lost its build cannot save over it', async () => {
  const memory = await MongoMemoryServer.create();
  try {
    await mongoose.connect(memory.getUri());
    const { WikiMaintenanceRun } = require('../models');
    await WikiMaintenanceRun.init();
    const page = { _id: new mongoose.Types.ObjectId(), createdFrom: { label: 'company-dossier:ACME' } };
    const { run, acquired } = await createDossierBuildRun({ WikiMaintenanceRun, page, userId: new mongoose.Types.ObjectId() });
    assert.equal(acquired, true);
    await recordDossierBuildStage({ run, stage: 'reading', summary: 'Reading the 10-K.' });

    await WikiMaintenanceRun.updateOne({ _id: run._id }, { $set: { status: 'failed' }, $unset: { leaseKey: 1 } });
    await assert.rejects(recordDossierBuildStage({ run, stage: 'writing' }), { name: 'DocumentNotFoundError' });
    await assert.rejects(finishDossierBuildRun({ run, status: 'completed' }), { name: 'DocumentNotFoundError' });
    assert.equal((await WikiMaintenanceRun.findById(run._id).lean()).status, 'failed');
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
});
