// scripts/fix-discipline-duplicates.js
// One-off script: resolve duplicate (class, schoolYear, week) records
// that would block the new unique index.
//
// Strategy:
//  - For each (class, schoolYear, week) group with >1 record, keep the most
//    recently updated/created record and remove the rest.
//  - Records are chosen as "primary" by: (updatedAt desc, createdAt desc, _id desc).
//  - Safe: removes duplicates that should not exist in the new index.
//
// Run: node scripts/fix-discipline-duplicates.js

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const DisciplineGrading = require('../models/DisciplineGrading');

(async () => {
  try {
    await connectDB();

    const groups = await DisciplineGrading.aggregate([
      {
        $group: {
          _id: { class: '$class', schoolYear: '$schoolYear', week: '$week' },
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    console.log(`\n=== Found ${groups.length} duplicate groups ===`);

    let totalRemoved = 0;
    for (const g of groups) {
      // Pick primary: most recently createdAt first, then highest _id
      const records = await DisciplineGrading.find({ _id: { $in: g.ids } })
        .sort({ createdAt: -1, _id: -1 })
        .select('_id createdAt updatedAt');
      const keep = records[0];
      const remove = records.slice(1).map((r) => r._id);

      const res = await DisciplineGrading.deleteMany({ _id: { $in: remove } });
      console.log(
        `  Group (class=${g._id.class}, sy=${g._id.schoolYear}, week=${g._id.week}): ` +
          `kept ${keep._id}, removed ${res.deletedCount} duplicates.`
      );
      totalRemoved += res.deletedCount;
    }

    console.log(`\nTotal duplicates removed: ${totalRemoved}`);
    console.log('You can now safely add the unique index { class, schoolYear, week }.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
