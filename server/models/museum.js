// The Museum: the few pieces that shaped how someone thinks, hung on one wall others can visit.
const mongoose = require('mongoose');

/* A piece is what the owner chose to show, frozen as they chose it. The
   passage is a copy, not a pointer: editing a highlight in the reader must
   never silently rewrite a public wall. The hang order is the array's order. */
const museumPieceSchema = new mongoose.Schema({
  // "AT.2016.1": given once when hung, never reused, because links to it get sent.
  accession: { type: String, required: true },
  kind: { type: String, enum: ['article', 'wiki', 'note', 'thread'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  own: { type: Boolean, default: false },
  passage: { type: String, default: '', maxlength: 400 },
  why: { type: String, required: true, maxlength: 700 },
  title: { type: String, default: '', maxlength: 300 },
  author: { type: String, default: '', maxlength: 200 },
  medium: { type: String, default: '', maxlength: 200 },
  year: { type: String, default: '', maxlength: 40 },
  room: { type: String, default: '', maxlength: 60 },
  url: { type: String, default: '', maxlength: 2000 },
  ledTo: { type: [String], default: [] },
  hungAt: { type: Date, default: Date.now }
}, { _id: false });

const museumSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  // The public address, its own word rather than the login name.
  handle: { type: String, default: '', trim: true, lowercase: true },
  name: { type: String, default: '', trim: true, maxlength: 80 },
  intro: { type: String, default: '', trim: true, maxlength: 280 },
  open: { type: Boolean, default: false },
  pieces: { type: [museumPieceSchema], default: [] },
  // Accessions of pieces taken down: their links say so rather than show another piece.
  retired: { type: [String], default: [] }
}, { timestamps: true });

museumSchema.index({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $gt: '' } } });

const Museum = mongoose.model('Museum', museumSchema);

module.exports = { Museum };
