// scripts/migrate-class-academic-grading-index.js
// One-off migration: replace the old unique index { class, week } on
// ClassAcademicGrading with the correct one { class, schoolYear, week }.
//
// Why: The old index made week+1 of 10A in school year 2025-2026 collide
// with week+1 of 10A in school year 2026-2027, producing the "đã tồn tại"
// false-positive when starting a new school year.
//
// Run: node scripts/migrate-class-academic-grading-index.js
//
// Pre-requisite: scripts/check-class-academic-duplicates.js reports 0
// duplicate (class, schoolYear, week) groups. If not, run
// scripts/fix-class-academic-duplicates.js first.

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const ClassAcademicGrading = require('../models/ClassAcademicGrading');

(async () => {
  try {
    await connectDB();
    const collection = ClassAcademicGrading.collection;

    // 1. Inspect existing indexes
    const existing = await collection.indexes();
    console.log('=== Current indexes on classacademicgradings ===');
    existing.forEach((idx) => {
      console.log(`  ${idx.name}: ${JSON.stringify(idx.key)} unique=${!!idx.unique}`);
    });

    // 2. Drop the buggy index if it exists
    const oldIndexName = 'class_1_week_1';
    if (existing.some((idx) => idx.name === oldIndexName)) {
      await collection.dropIndex(oldIndexName);
      console.log(`\nDropped old index: ${oldIndexName}`);
    } else {
      console.log(`\nOld index ${oldIndexName} not present (already migrated).`);
    }

    // 3. Create the new correct index. `background: true` keeps it
    // non-blocking on older Mongo; on Mongo 4.2+ the build is always
    // non-blocking. `unique: true` is the actual fix.
    await collection.createIndex(
      { class: 1, schoolYear: 1, week: 1 },
      { unique: true, name: 'class_1_schoolYear_1_week_1', background: true }
    );
    console.log('Created new index: class_1_schoolYear_1_week_1 (unique=true)');

    // 4. Verify
    const after = await collection.indexes();
    console.log('\n=== Indexes after migration ===');
    after.forEach((idx) => {
      console.log(`  ${idx.name}: ${JSON.stringify(idx.key)} unique=${!!idx.unique}`);
    });

    console.log('\nMigration complete.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
})();
