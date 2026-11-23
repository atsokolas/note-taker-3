// Concepts and their workspace check, built once on the real models.
const { buildConceptWorkspaceAuthorizationService } = require('./conceptWorkspaceAuthorizationService');
const mongoose = require('mongoose');
const {
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  WikiPage,
  ReferenceEdge
} = require('../models/index');
const { ensureWorkspace } = require('../utils/workspaceUtils');
const { buildConceptService } = require('./conceptService');

const conceptWorkspaceAuthorization = buildConceptWorkspaceAuthorizationService({
  mongoose,
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  WikiPage,
  ensureWorkspace
});
const { getConcepts, getConceptMeta, updateConceptMeta, getConceptRelated } = buildConceptService({
  Article,
  TagMeta,
  NotebookEntry,
  ReferenceEdge,
  mongoose,
  workspaceAuthorization: conceptWorkspaceAuthorization
});

module.exports = {
  conceptWorkspaceAuthorization,
  getConcepts,
  getConceptMeta,
  updateConceptMeta,
  getConceptRelated
};
