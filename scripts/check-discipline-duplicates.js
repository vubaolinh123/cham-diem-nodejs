// scripts/check-discipline-duplicates.js
// One-off script: detect duplicate (class, schoolYear, week) tuples that
// would block the new unique index { class: 1, schoolYear: 1, week: 1 }.
// Run: node scripts/check-discipline-duplicates.js

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const DisciplineGrading = require('../models/DisciplineGrading');

(async () => {
  try {
    await connectDB();

    const pipeline = [
      {
        $group: {
          _id: { class: '$class', schoolYear: '$schoolYear', week: '$week' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          createdAt: { $push: '$createdAt' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ];

    const dups = await DisciplineGrading.aggregate(pipeline);

    console.log(`\n=== Duplicate (class, schoolYear, week) groups: ${dups.length} ===`);
    if (dups.length > 0) {
      console.log('These groups would BLOCK the new unique index.');
      console.log('Run scripts/fix-discipline-duplicates.js to resolve them.');
      console.log(JSON.stringify(dups, null, 2));
    } else {
      console.log('No duplicates found. Safe to apply the new unique index.');
    }

    // Also show cross-year collisions on (class, week) only — the old index
    const crossYear = await DisciplineGrading.aggregate([
      {
        $group: {
          _id: { class: '$class', week: '$week' },
          count: { $sum: 1 },
          schoolYears: { $addToSet: '$schoolYear' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);
    console.log(`\n=== Cross-year (class, week) collisions: ${crossYear.length} ===`);
    if (crossYear.length > 0) {
      console.log('These would resolve automatically once the new index is in place.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
