/**
 * Fix ViolationType Default Penalty
 * Ensures all ViolationType records have defaultPenalty set (default: 1)
 * Then recalculates all WeeklySummary records
 * 
 * Run: node scripts/fixViolationPenalty.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ViolationType = require('../models/ViolationType');
const WeeklySummary = require('../models/WeeklySummary');
const { updateWeeklySummary } = require('../utils/weeklySummaryHelper');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chamdiem';

async function fixViolationPenalty() {
  console.log('\n========================================');
  console.log('FIX VIOLATION PENALTY & RECALCULATE');
  console.log('========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB\n');

    // Step 1: Fix ViolationType without defaultPenalty
    console.log('Step 1: Checking ViolationType defaultPenalty...');
    const violationTypes = await ViolationType.find({});
    let fixedCount = 0;
    
    for (const vt of violationTypes) {
      if (vt.defaultPenalty === undefined || vt.defaultPenalty === null) {
        vt.defaultPenalty = 1; // Default penalty of 1 point
        await vt.save();
        fixedCount++;
        console.log(`  ✅ Fixed: ${vt.name} → defaultPenalty: 1`);
      } else {
        console.log(`  ✓ OK: ${vt.name} → defaultPenalty: ${vt.defaultPenalty}`);
      }
    }
    console.log(`\n  Total ViolationType: ${violationTypes.length}, Fixed: ${fixedCount}\n`);

    // Step 2: Recalculate all WeeklySummary
    console.log('Step 2: Recalculating all WeeklySummary...');
    const summaries = await WeeklySummary.find({}).select('week class');
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      try {
        const result = await updateWeeklySummary(
          summary.week?.toString(),
          summary.class?.toString(),
          null
        );
        
        if (result) {
          successCount++;
          console.log(`  ✅ [${i + 1}/${summaries.length}] Week: ${summary.week}, Penalty: ${result.violations?.totalPenalty || 0}`);
        } else {
          console.log(`  ⚠️ [${i + 1}/${summaries.length}] Skipped (missing data)`);
        }
      } catch (error) {
        errorCount++;
        console.log(`  ❌ [${i + 1}/${summaries.length}] Error: ${error.message}`);
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('COMPLETE');
    console.log('========================================');
    console.log(`ViolationType Fixed: ${fixedCount}`);
    console.log(`WeeklySummary Updated: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB\n');
  }
}

// Run if executed directly
if (require.main === module) {
  fixViolationPenalty()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { fixViolationPenalty };
