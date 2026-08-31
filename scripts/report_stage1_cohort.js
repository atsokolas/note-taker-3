#!/usr/bin/env node
/**
 * Read the Stage 1 gate off the receipt store.
 *
 *   MONGODB_URI=... node scripts/report_stage1_cohort.js <userId> [userId...]
 *   MONGODB_URI=... node scripts/report_stage1_cohort.js --email a@b.com --email c@d.com
 *
 * Read-only. It queries receipts and prints what it found; it writes nothing
 * and mutates nothing, so it is safe to run against production mid-test.
 *
 * The gate is 5/5 on the first three receipts. Activation additionally needs
 * Stage 2's fourth, which is why a participant can be complete and not yet
 * activated — see cohortActivationService for why those are different claims.
 */
const mongoose = require('mongoose');
const { NoeisReceipt, User } = require('../server/models');
const {
  ACTIVATING,
  FIRST_THREE,
  buildCohortActivation,
  describeCohort
} = require('../server/services/cohortActivationService');

const parseArgs = (argv) => {
  const ids = [];
  const emails = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--email') { emails.push(String(argv[index + 1] || '').trim()); index += 1; continue; }
    if (arg.startsWith('--')) continue;
    ids.push(arg.trim());
  }
  return { ids: ids.filter(Boolean), emails: emails.filter(Boolean) };
};

const resolveParticipants = async ({ ids, emails }) => {
  const people = ids.map(id => ({ id, label: id }));
  if (emails.length) {
    const found = await User.find({ email: { $in: emails } }).select('_id email').lean();
    found.forEach(user => people.push({ id: String(user._id), label: user.email }));
    const missing = emails.filter(email => !found.some(user => user.email === email));
    missing.forEach(email => console.warn(`No account found for ${email} — not counted.`));
  }
  return people;
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const { ids, emails } = parseArgs(process.argv.slice(2));
  if (!ids.length && !emails.length) {
    throw new Error('Name the participants: <userId>... or --email <address>...');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const participants = await resolveParticipants({ ids, emails });
    const receipts = await NoeisReceipt.find({
      userId: { $in: participants.map(person => person.id) },
      kind: { $in: [...FIRST_THREE, ACTIVATING] }
    }).select('userId kind status completedAt createdAt').lean();

    const cohort = buildCohortActivation({ participants, receipts });
    console.log(describeCohort(cohort));
    console.log('');
    cohort.participants.forEach((person) => {
      const mark = person.activated ? 'activated' : person.complete ? 'complete' : 'incomplete';
      console.log(`${person.label} — ${mark}`);
      FIRST_THREE.forEach((kind) => {
        const at = person.produced[kind];
        console.log(`    ${at ? at.slice(0, 10) : '   —      '}  ${kind}`);
      });
      if (person.activatedAt) console.log(`    ${person.activatedAt.slice(0, 10)}  ${ACTIVATING}`);
      console.log('');
    });
    process.exitCode = cohort.passes ? 0 : 1;
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(2);
});
