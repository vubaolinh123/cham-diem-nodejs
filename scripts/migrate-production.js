// scripts/migrate-production.js
// Production database migration for the ChamDiem grading system.
//
// This script consolidates all index migrations and data backfills needed
// after the schoolYear-scoping bug fixes:
//   1. Backfill WeeklySummary.schoolYear from Week.schoolYear
//   2. Migrate DisciplineGrading unique index: (class, week) → (class, schoolYear, week)
//   3. Migrate ClassAcademicGrading unique index: (class, week) → (class, schoolYear, week)
//   4. Migrate WeeklySummary unique index: (week, class) → (schoolYear, week, class)
//
// SAFETY:
//   - Dry-run by default. Always run without --apply first to preview.
//   - Backs up affected collections to scripts/backups/<timestamp>/ before modifying.
//   - Idempotent: safe to run multiple times.
//   - Aborts if duplicate-key conflicts would block unique index creation (unless --force).
//
// USAGE:
//   node scripts/migrate-production.js              # dry-run (preview only)
//   node scripts/migrate-production.js --apply       # execute migration with backup
//   node scripts/migrate-production.js --apply --force  # skip duplicate check (DANGEROUS)
//
// PREREQUISITES:
//   - Set MONGODB_URI in .env to the PRODUCTION database URI
//   - Stop the backend server first (avoid concurrent writes during migration)
//   - Test on a staging copy of production data first
//
// RECOVERY:
//   If migration fails, restore from scripts/backups/<timestamp>/ or use mongodump backup.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const WeeklySummary = require('../models/WeeklySummary');
const DisciplineGrading = require('../models/DisciplineGrading');
const ClassAcademicGrading = require('../models/ClassAcademicGrading');
const Week = require('../models/Week');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DDTHH-mm-ss (filesystem-safe). */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Print a section header. */
function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
}

/** Print a step result line. */
function stepLine(step, msg) {
  console.log(`  [${step}] ${msg}`);
}

/** Print a warning line. */
function warn(msg) {
  console.log(`  ⚠ WARNING: ${msg}`);
}

/** Print an error line. */
function error(msg) {
  console.log(`  ✗ ERROR: ${msg}`);
}

/** Print a success line. */
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/**
 * Export a collection to a JSON file.
 * NOTE: For very large collections (>100k docs), mongodump is preferred.
 * This uses .lean() to avoid loading full Mongoose documents.
 */
async function backupCollection(Model, backupDir, collectionName) {
  const docs = await Model.find({}).lean();
  const filePath = path.join(backupDir, `${collectionName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
  console.log(`  Backed up ${docs.length} documents → ${filePath}`);
  return docs.length;
}

async function runBackup() {
  const ts = timestamp();
  const backupDir = path.join(__dirname, 'backups', ts);
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`  Backup directory: ${backupDir}`);

  await backupCollection(DisciplineGrading, backupDir, 'disciplinegradings');
  await backupCollection(ClassAcademicGrading, backupDir, 'classacademicgradings');
  await backupCollection(WeeklySummary, backupDir, 'weeklysummaries');

  return backupDir;
}

// ---------------------------------------------------------------------------
// Step 1: Backfill WeeklySummary.schoolYear
// ---------------------------------------------------------------------------

async function step1_backfillWeeklySummary() {
  section('Step 1: Backfill WeeklySummary.schoolYear from Week.schoolYear');

  // Find all WeeklySummary docs with missing/null schoolYear
  const missing = await WeeklySummary.find({
    $or: [
      { schoolYear: { $exists: false } },
      { schoolYear: null },
    ],
  }).lean();

  console.log(`  Mode: ${MODE}`);
  console.log(`  Records missing schoolYear: ${missing.length}`);

  if (missing.length === 0) {
    ok('No records need backfill.');
    return { updated: 0 };
  }

  if (!APPLY) {
    console.log(`  Would backfill ${missing.length} records (dry-run).`);
    return { updated: 0 };
  }

  // Build bulkWrite operations in batches of 500
  const BATCH_SIZE = 500;
  let totalUpdated = 0;
  let skipped = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const ops = [];

    for (const summary of batch) {
      const weekDoc = await Week.findById(summary.week).select('schoolYear').lean();
      if (!weekDoc || !weekDoc.schoolYear) {
        warn(`Orphaned WeeklySummary ${summary._id}: week ${summary.week} not found or has no schoolYear. Skipping.`);
        skipped++;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { _id: summary._id },
          update: { $set: { schoolYear: weekDoc.schoolYear } },
        },
      });
    }

    if (ops.length > 0) {
      const result = await WeeklySummary.bulkWrite(ops, { ordered: false });
      totalUpdated += (result.modifiedCount || 0) + (result.upsertedCount || 0);
    }
  }

  console.log(`  Updated: ${totalUpdated} records`);
  if (skipped > 0) {
    warn(`${skipped} orphaned summaries skipped (Week document missing).`);
  }
  return { updated: totalUpdated, skipped };
}

// ---------------------------------------------------------------------------
// Duplicate check helper (shared by Steps 2, 4, 5)
// ---------------------------------------------------------------------------

/**
 * Check for duplicate (class, schoolYear, week) groups in a collection.
 * Returns the count of duplicate groups.
 */
async function checkDuplicates(Model, groupFields, collectionLabel) {
  const groupId = {};
  for (const f of groupFields) {
    groupId[f] = `$${f}`;
  }

  const pipeline = [
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'duplicateGroups' },
  ];

  const result = await Model.aggregate(pipeline);
  const count = result.length > 0 ? result[0].duplicateGroups : 0;

  console.log(`  Duplicate (${groupFields.join(', ')}) groups: ${count}`);

  if (count > 0) {
    if (!APPLY) {
      warn(`${count} duplicate groups found in ${collectionLabel}. --force will be required to proceed.`);
    } else if (!FORCE) {
      error(`${count} duplicate groups found in ${collectionLabel}.`);
      error('Unique index creation would fail. Aborting.');
      error('Run fix-discipline-duplicates.js (or equivalent) first, or re-run with --force.');
      return { count, abort: true };
    } else {
      warn(`${count} duplicate groups found in ${collectionLabel}. Proceeding with --force (unique index creation may fail).`);
    }
  } else {
    ok(`No duplicates in ${collectionLabel}.`);
  }

  return { count, abort: false };
}

// ---------------------------------------------------------------------------
// Index migration helper (shared by Steps 3, 4, 5)
// ---------------------------------------------------------------------------

/**
 * Drop an old index and create a new one on a collection.
 * Idempotent: skips if already done.
 */
async function migrateIndex(collection, oldIndexName, newIndexSpec, newIndexOptions, collectionLabel) {
  const existing = await collection.indexes();

  // Drop old index
  if (existing.some((idx) => idx.name === oldIndexName)) {
    if (APPLY) {
      await collection.dropIndex(oldIndexName);
      ok(`Dropped old index: ${oldIndexName}`);
    } else {
      console.log(`  Would drop old index: ${oldIndexName}`);
    }
  } else {
    console.log(`  Old index ${oldIndexName} already dropped (or never existed).`);
  }

  // Create new index
  if (existing.some((idx) => idx.name === newIndexOptions.name)) {
    console.log(`  New index ${newIndexOptions.name} already exists. Skipping creation.`);
    return { dropped: false, created: false };
  }

  if (APPLY) {
    try {
      await collection.createIndex(newIndexSpec, newIndexOptions);
      ok(`Created new index: ${newIndexOptions.name} (unique=${!!newIndexOptions.unique})`);
    } catch (err) {
      error(`Failed to create index ${newIndexOptions.name}: ${err.message}`);
      throw err;
    }
  } else {
    console.log(`  Would create new index: ${newIndexOptions.name} (unique=${!!newIndexOptions.unique})`);
  }

  return { dropped: true, created: true };
}

// ---------------------------------------------------------------------------
// Step 2+3: DisciplineGrading duplicate check + index migration
// ---------------------------------------------------------------------------

async function step2_3_disciplineGrading() {
  section('Step 2+3: DisciplineGrading — duplicate check + index migration');

  console.log(`  Mode: ${MODE}${FORCE ? ' (--force)' : ''}`);

  // Step 2: Check duplicates
  const dupResult = await checkDuplicates(
    DisciplineGrading,
    ['class', 'schoolYear', 'week'],
    'disciplinegradings'
  );
  if (dupResult.abort) return { aborted: true };

  // Step 3: Migrate index
  const idxResult = await migrateIndex(
    DisciplineGrading.collection,
    'class_1_week_1',
    { class: 1, schoolYear: 1, week: 1 },
    { unique: true, name: 'class_1_schoolYear_1_week_1', background: true },
    'disciplinegradings'
  );

  return { duplicates: dupResult.count, ...idxResult, aborted: false };
}

// ---------------------------------------------------------------------------
// Step 4: ClassAcademicGrading duplicate check + index migration
// ---------------------------------------------------------------------------

async function step4_classAcademicGrading() {
  section('Step 4: ClassAcademicGrading — duplicate check + index migration');

  console.log(`  Mode: ${MODE}${FORCE ? ' (--force)' : ''}`);

  // Check duplicates
  const dupResult = await checkDuplicates(
    ClassAcademicGrading,
    ['class', 'schoolYear', 'week'],
    'classacademicgradings'
  );
  if (dupResult.abort) return { aborted: true };

  // Migrate index
  const idxResult = await migrateIndex(
    ClassAcademicGrading.collection,
    'class_1_week_1',
    { class: 1, schoolYear: 1, week: 1 },
    { unique: true, name: 'class_1_schoolYear_1_week_1', background: true },
    'classacademicgradings'
  );

  return { duplicates: dupResult.count, ...idxResult, aborted: false };
}

// ---------------------------------------------------------------------------
// Step 5: WeeklySummary duplicate check + index migration
// ---------------------------------------------------------------------------

async function step5_weeklySummary() {
  section('Step 5: WeeklySummary — duplicate check + index migration');

  console.log(`  Mode: ${MODE}${FORCE ? ' (--force)' : ''}`);

  // Check for records still missing schoolYear after backfill
  const stillMissing = await WeeklySummary.countDocuments({
    $or: [
      { schoolYear: { $exists: false } },
      { schoolYear: null },
    ],
  });

  if (stillMissing > 0) {
    console.log(`  Records still missing schoolYear after backfill: ${stillMissing}`);
    warn('MongoDB unique indexes treat null as a distinct value, but only ONE null is allowed per unique key.');
    warn('Multiple null schoolYear values would block unique index creation on (schoolYear, week, class).');
    if (APPLY && !FORCE) {
      error(`${stillMissing} records still have null schoolYear. Unique index creation would fail.`);
      error('Fix these records manually (orphaned Week references), then re-run.');
      return { aborted: true };
    }
    if (APPLY && FORCE) {
      warn('Proceeding with --force despite null schoolYear records. Index creation may fail.');
    }
  }

  // Check duplicates on (schoolYear, week, class)
  const dupResult = await checkDuplicates(
    WeeklySummary,
    ['schoolYear', 'week', 'class'],
    'weeklysummaries'
  );
  if (dupResult.abort) return { aborted: true };

  // Migrate index
  const idxResult = await migrateIndex(
    WeeklySummary.collection,
    'week_1_class_1',
    { schoolYear: 1, week: 1, class: 1 },
    { unique: true, name: 'schoolYear_1_week_1_class_1', background: true },
    'weeklysummaries'
  );

  return { duplicates: dupResult.count, stillMissing, ...idxResult, aborted: false };
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function printSummary(results) {
  section('MIGRATION SUMMARY');

  console.log(`  Mode: ${MODE}${FORCE ? ' (--force)' : ''}`);
  if (results.backupDir) {
    console.log(`  Backup: ${results.backupDir}`);
  }

  // Step 1
  const s1 = results.step1 || {};
  console.log(`  Step 1 (backfill WeeklySummary.schoolYear): ${s1.updated || 0} records updated` +
    (s1.skipped > 0 ? `, ${s1.skipped} skipped (orphaned)` : ''));

  // Step 2+3
  const s23 = results.step23 || {};
  if (s23.aborted) {
    console.log(`  Step 2+3 (DisciplineGrading): ABORTED — ${s23.duplicates || 0} duplicates`);
  } else {
    const dropped = s23.dropped ? 'dropped class_1_week_1' : 'class_1_week_1 already dropped';
    const created = s23.created ? 'created class_1_schoolYear_1_week_1' : 'class_1_schoolYear_1_week_1 already exists';
    console.log(`  Step 2+3 (DisciplineGrading): ${s23.duplicates || 0} duplicates, ${dropped}, ${created}`);
  }

  // Step 4
  const s4 = results.step4 || {};
  if (s4.aborted) {
    console.log(`  Step 4 (ClassAcademicGrading): ABORTED — ${s4.duplicates || 0} duplicates`);
  } else {
    const dropped = s4.dropped ? 'dropped class_1_week_1' : 'class_1_week_1 already dropped';
    const created = s4.created ? 'created class_1_schoolYear_1_week_1' : 'class_1_schoolYear_1_week_1 already exists';
    console.log(`  Step 4 (ClassAcademicGrading): ${s4.duplicates || 0} duplicates, ${dropped}, ${created}`);
  }

  // Step 5
  const s5 = results.step5 || {};
  if (s5.aborted) {
    console.log(`  Step 5 (WeeklySummary): ABORTED — ${s5.duplicates || 0} duplicates` +
      (s5.stillMissing > 0 ? `, ${s5.stillMissing} null schoolYear` : ''));
  } else {
    const dropped = s5.dropped ? 'dropped week_1_class_1' : 'week_1_class_1 already dropped';
    const created = s5.created ? 'created schoolYear_1_week_1_class_1' : 'schoolYear_1_week_1_class_1 already exists';
    console.log(`  Step 5 (WeeklySummary): ${s5.duplicates || 0} duplicates, ${dropped}, ${created}` +
      (s5.stillMissing > 0 ? `, ${s5.stillMissing} null schoolYear (warned)` : ''));
  }

  // Overall result
  const anyAborted = (results.step23 && results.step23.aborted) ||
    (results.step4 && results.step4.aborted) ||
    (results.step5 && results.step5.aborted);
  const resultLine = anyAborted ? 'Result: ABORTED (see errors above)' : 'Result: SUCCESS';
  console.log(`\n  ${resultLine}`);
  console.log(`${'='.repeat(60)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const results = {};

  try {
    console.log(`\nChamDiem Production Migration — Mode: ${MODE}${FORCE ? ' (--force)' : ''}`);
    console.log('Connecting to database...');

    await connectDB();
    console.log('Connected.\n');

    // --- Backup (apply mode only) ---
    if (APPLY) {
      section('BACKUP');
      try {
        results.backupDir = await runBackup();
      } catch (err) {
        error(`Backup failed: ${err.message}`);
        error('Aborting migration to protect data.');
        await mongoose.disconnect();
        process.exit(1);
      }
    } else {
      console.log('  DRY-RUN: skipping backup.\n');
    }

    // --- Step 1: Backfill WeeklySummary.schoolYear ---
    results.step1 = await step1_backfillWeeklySummary();

    // --- Step 2+3: DisciplineGrading ---
    results.step23 = await step2_3_disciplineGrading();
    if (results.step23.aborted) {
      printSummary(results);
      await mongoose.disconnect();
      process.exit(1);
    }

    // --- Step 4: ClassAcademicGrading ---
    results.step4 = await step4_classAcademicGrading();
    if (results.step4.aborted) {
      printSummary(results);
      await mongoose.disconnect();
      process.exit(1);
    }

    // --- Step 5: WeeklySummary ---
    results.step5 = await step5_weeklySummary();
    if (results.step5.aborted) {
      printSummary(results);
      await mongoose.disconnect();
      process.exit(1);
    }

    // --- Done ---
    printSummary(results);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`\n${'='.repeat(60)}`);
    console.error('  UNEXPECTED ERROR');
    console.error(`${'='.repeat(60)}`);
    console.error(`  ${err.message}`);
    console.error(`\n  Migration failed. Restore from backup if --apply was used.`);
    console.error(`  Backup directory: ${results.backupDir || 'N/A (no backup created)'}`);
    console.error(`${'='.repeat(60)}\n`);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
})();
